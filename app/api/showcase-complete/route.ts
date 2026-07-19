import { extractQuote } from '@/lib/calls';
import { readAll, upsert } from '@/lib/store';
import { vertical } from '@/config/vertical';
import type { JobSpec, Transcript, TranscriptTurn } from '@/types';

export const maxDuration = 60;

// Persists the showcased voice call and extracts its Quote (replaces the tough text-call quote).
export async function POST(req: Request) {
  const { turns } = (await req.json()) as { turns: TranscriptTurn[] };
  const spec = (await readAll<JobSpec>('jobspecs')).filter((s) => s.confirmedByUser).at(-1);
  if (!spec) return Response.json({ error: 'no confirmed job spec' }, { status: 400 });
  if (!Array.isArray(turns) || turns.length < 2) {
    return Response.json({ error: 'not enough turns to extract' }, { status: 400 });
  }

  const seller = vertical.sellers.find((s) => s.persona === 'tough')!;
  const transcript: Transcript = {
    transcriptId: `tx-${spec.jobId}-${seller.persona}`,
    jobId: spec.jobId,
    persona: seller.persona,
    providerName: seller.providerName,
    turns,
  };
  await upsert('transcripts', 'transcriptId', transcript as unknown as Record<string, unknown>);
  const quote = await extractQuote(transcript);
  await upsert('quotes', 'quoteId', quote as unknown as Record<string, unknown>);
  return Response.json({ quote });
}
