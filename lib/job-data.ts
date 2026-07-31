import { readAll } from './store';
import type { MarketResearch } from './research';
import type { JobSpec, Quote, Transcript } from '../types';

// The active job's scoped data — the ONLY quotes/transcripts any live-call machinery may
// see (unscoped reads once leaked another job's quote into a call).
export async function activeJobData() {
  const spec = (await readAll<JobSpec>('jobspecs')).filter((s) => s.confirmedByUser).at(-1);
  if (!spec) return null;
  const transcriptIds = new Set(
    (await readAll<Transcript>('transcripts')).filter((t) => t.jobId === spec.jobId).map((t) => t.transcriptId)
  );
  const quotes = (await readAll<Quote>('quotes')).filter((q) => transcriptIds.has(q.transcriptRef));
  const research = (await readAll<MarketResearch>('research')).find((r) => r.jobId === spec.jobId) ?? null;
  return { spec, quotes, research };
}
