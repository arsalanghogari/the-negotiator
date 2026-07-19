import OpenAI from 'openai';
import { readAll, upsert } from '@/lib/store';
import { vertical } from '@/config/vertical';
import type { JobSpec, Quote, Report, Transcript } from '@/types';

export const maxDuration = 120;

const RANKING_PROMPT =
  "You are advising a customer choosing a mover. Given the confirmed job spec and all structured quotes with transcripts, recommend one quote and explain in plain language why — citing specific fees and quoting short transcript moments. Flag any too-cheap (red-flag) quotes and why they're risky. Note where a price was negotiated down. Be concrete and honest.";

async function bundle() {
  const specs = await readAll<JobSpec>('jobspecs');
  const spec = specs.filter((s) => s.confirmedByUser).at(-1);
  if (!spec) return null;
  const all = (await readAll<Transcript>('transcripts')).filter((t) => t.jobId === spec.jobId);
  const refs = new Set(all.map((t) => t.transcriptId));
  const quotes = (await readAll<Quote>('quotes')).filter((q) => refs.has(q.transcriptRef));
  // Only transcripts backing an extracted quote — stale/seeded ones must not leak into the rationale.
  const quoted = new Set(quotes.map((q) => q.transcriptRef));
  const transcripts = all.filter((t) => quoted.has(t.transcriptId));
  return { spec, quotes, transcripts };
}

export async function GET() {
  const b = await bundle();
  if (!b) return Response.json({ error: 'no confirmed job spec' }, { status: 404 });
  const report = (await readAll<Report>('reports')).find((r) => r.jobId === b.spec.jobId) ?? null;
  return Response.json({ ...b, report });
}

export async function POST() {
  const b = await bundle();
  if (!b) return Response.json({ error: 'no confirmed job spec — run intake first' }, { status: 400 });
  if (b.quotes.length === 0) return Response.json({ error: 'no quotes — run calls first' }, { status: 400 });
  const { spec, quotes, transcripts } = b;

  const schema = {
    type: 'object',
    properties: {
      recommendedQuoteId: { type: 'string', enum: quotes.map((q) => q.quoteId) },
      rationale: { type: 'string' },
      redFlags: {
        type: 'array',
        items: {
          type: 'string',
          description: 'One plain-language sentence naming the provider and why the quote is risky — never an ID',
        },
      },
    },
    required: ['recommendedQuoteId', 'rationale', 'redFlags'],
    additionalProperties: false,
  };

  const openai = new OpenAI();
  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: RANKING_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          jobSpec: spec,
          marketMedian: vertical.marketMedian,
          quotes,
          transcripts: transcripts.map((t) => ({
            transcriptId: t.transcriptId,
            text: t.turns.map((x) => `${x.speaker}: ${x.text}`).join('\n'),
          })),
        }),
      },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'report', strict: true, schema } },
  });
  const out = JSON.parse(res.choices[0].message.content ?? '{}');

  // Rank by true total cost — deterministic, so it's code, not model judgment.
  const report: Report = {
    jobId: spec.jobId,
    ranked: [...quotes].sort((a, b) => a.totalPrice - b.totalPrice),
    recommendedQuoteId: out.recommendedQuoteId,
    rationale: out.rationale,
    redFlags: out.redFlags,
  };
  await upsert('reports', 'jobId', report as unknown as Record<string, unknown>);
  return Response.json({ ...b, report });
}
