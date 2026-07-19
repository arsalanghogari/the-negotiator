import { bestBindingQuote } from '@/lib/calls';
import { activeJobData } from '@/lib/job-data';

// The negotiator agent's get_best_competing_quote tool hits this mid-call.
// Returns an instruction-bearing sentence, not bare JSON — voice agents misread terse
// numbers (one call cited a nonexistent $1,900), so the rules travel with the answer.
// Scoped to the CURRENT job via activeJobData (an unfiltered read once leaked another
// job's quote into a call).
const NO_QUOTE =
  'You hold no competing quote. Do not cite or invent one — focus on getting a full itemized number.';

export async function GET() {
  const job = await activeJobData();
  const best = job ? bestBindingQuote(job.quotes) : null;
  return Response.json({
    answer: best
      ? `Your best competing quote is EXACTLY $${best.totalPrice.toLocaleString()} (binding, from ${best.providerName}). If you cite it, cite this exact amount and no other number, at most once in the call. If the seller's price is already at or below $${best.totalPrice.toLocaleString()}, do not cite it — accept or wrap up.`
      : NO_QUOTE,
  });
}
