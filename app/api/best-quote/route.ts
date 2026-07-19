import { bestBindingQuote } from '@/lib/calls';
import { readAll } from '@/lib/store';
import type { JobSpec, Quote, Transcript } from '@/types';

// The negotiator agent's get_best_competing_quote tool hits this mid-call.
// Returns an instruction-bearing sentence, not bare JSON — voice agents misread terse
// numbers (one call cited a nonexistent $1,900), so the rules travel with the answer.
// Quotes are scoped to the CURRENT job: an unfiltered read once leaked a $2,000 binding
// quote from a previous job into a call whose real best was $2,300 — an honest agent
// citing a lying tool.
const NO_QUOTE =
  'You hold no competing quote. Do not cite or invent one — focus on getting a full itemized number.';

export async function GET() {
  const spec = (await readAll<JobSpec>('jobspecs')).filter((s) => s.confirmedByUser).at(-1);
  if (!spec) return Response.json({ answer: NO_QUOTE });
  const jobTranscripts = new Set(
    (await readAll<Transcript>('transcripts')).filter((t) => t.jobId === spec.jobId).map((t) => t.transcriptId)
  );
  const quotes = (await readAll<Quote>('quotes')).filter((q) => jobTranscripts.has(q.transcriptRef));
  const best = bestBindingQuote(quotes);
  return Response.json({
    answer: best
      ? `Your best competing quote is EXACTLY $${best.totalPrice.toLocaleString()} (binding, from ${best.providerName}). If you cite it, cite this exact amount and no other number, at most once in the call. If the seller's price is already at or below $${best.totalPrice.toLocaleString()}, do not cite it — accept or wrap up.`
      : NO_QUOTE,
  });
}
