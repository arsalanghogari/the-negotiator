import OpenAI from 'openai';
import type { NextRequest } from 'next/server';

const PROMPT =
  'Extract a moving job spec from this document (existing quote, bill, or room photos). Populate only JobSpec fields. For anything not present, use null — never guess. Return JSON matching the JobSpec schema.';

// Extraction-only fields; jobId/vertical/confirmedByUser are set by the app.
const nullable = (t: string) => ({ type: [t, 'null'] });
const place = {
  type: 'object',
  properties: {
    city: nullable('string'),
    zip: nullable('string'),
    floor: nullable('number'),
    hasElevator: nullable('boolean'),
  },
  required: ['city', 'zip', 'floor', 'hasElevator'],
  additionalProperties: false,
};
const schema = {
  type: 'object',
  properties: {
    origin: place,
    destination: place,
    distanceMiles: nullable('number'),
    homeSize: { type: ['string', 'null'], enum: ['studio', '1br', '2br', '3br+', null] },
    largeItems: { type: 'array', items: { type: 'string' } },
    boxCountEst: nullable('number'),
    stairsFlights: nullable('number'),
    longCarry: nullable('boolean'),
    packingService: nullable('boolean'),
    preferredDate: nullable('string'),
    specialNotes: nullable('string'),
  },
  required: [
    'origin', 'destination', 'distanceMiles', 'homeSize', 'largeItems', 'boxCountEst',
    'stairsFlights', 'longCarry', 'packingService', 'preferredDate', 'specialNotes',
  ],
  additionalProperties: false,
};

export async function POST(req: NextRequest) {
  const file = (await req.formData()).get('file');
  if (!(file instanceof File)) return Response.json({ error: 'no file' }, { status: 400 });

  const b64 = Buffer.from(await file.arrayBuffer()).toString('base64');
  const part =
    file.type === 'application/pdf'
      ? { type: 'input_file' as const, filename: file.name, file_data: `data:application/pdf;base64,${b64}` }
      : { type: 'input_image' as const, image_url: `data:${file.type};base64,${b64}`, detail: 'auto' as const };

  const openai = new OpenAI();
  const res = await openai.responses.create({
    model: 'gpt-4o',
    input: [{ role: 'user', content: [{ type: 'input_text', text: PROMPT }, part] }],
    text: { format: { type: 'json_schema', name: 'job_spec_extraction', strict: true, schema } },
  });
  return Response.json(JSON.parse(res.output_text));
}
