import OpenAI from 'openai';
import { readAll } from '@/lib/store';
import type { JobSpec, Quote, Report, Transcript } from '@/types';

export const maxDuration = 60;

// Q&A over the customer's own data: job spec, quotes, transcripts, report. Grounded only.
export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages: { role: 'user' | 'assistant'; content: string }[] };
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: 'messages required' }, { status: 400 });
  }

  const spec = (await readAll<JobSpec>('jobspecs')).filter((s) => s.confirmedByUser).at(-1);
  if (!spec) return Response.json({ error: 'no confirmed job spec yet' }, { status: 400 });
  // Only transcripts backing an extracted quote — seeded fixtures share the demo jobId with
  // live runs, and feeding both gives the model two conflicting versions of every call
  // (the exact hallucination this guards against; same rule as report generation).
  const all = (await readAll<Transcript>('transcripts')).filter((t) => t.jobId === spec.jobId);
  const refs = new Set(all.map((t) => t.transcriptId));
  const quotes = (await readAll<Quote>('quotes')).filter((q) => refs.has(q.transcriptRef));
  const quoted = new Set(quotes.map((q) => q.transcriptRef));
  const transcripts = all.filter((t) => quoted.has(t.transcriptId));
  const report = (await readAll<Report>('reports')).find((r) => r.jobId === spec.jobId);

  const openai = new OpenAI();
  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are The Negotiator's assistant, answering a customer's questions about their moving quotes. Use ONLY the data below — never invent numbers, providers, or transcript moments. If the data doesn't answer the question, say so plainly. Be concise (a short paragraph at most) and cite concrete figures.

JOB SPEC: ${JSON.stringify(spec)}
QUOTES: ${JSON.stringify(quotes)}
REPORT: ${JSON.stringify(report ?? 'not generated yet')}
TRANSCRIPTS: ${JSON.stringify(transcripts.map((t) => ({ id: t.transcriptId, provider: t.providerName, text: t.turns.map((x) => `${x.speaker}: ${x.text}`).join('\n') })))}`,
      },
      ...messages.slice(-10),
    ],
  });
  return Response.json({ text: res.choices[0].message.content ?? '' });
}
