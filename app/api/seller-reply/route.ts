import { showcaseSellerReply } from '@/lib/calls';
import { activeJobData } from '@/lib/job-data';
import { citedAmount, knownAmounts, researchAmounts } from '@/lib/quote-rules';
import type { TranscriptTurn } from '@/types';

export const maxDuration = 30;

// Every negotiator turn passes through here before the seller answers — the tripwire for
// invented competing quotes. Prompt rules alone failed twice (same phantom $1,900), so
// enforcement is deterministic: a cited amount that doesn't exist among THIS job's quotes
// makes the seller skeptical and triggers a client-side correction to the agent.
export async function POST(req: Request) {
  const { turns } = (await req.json()) as { turns: TranscriptTurn[] };
  if (!Array.isArray(turns) || turns.length === 0) {
    return Response.json({ error: 'turns required' }, { status: 400 });
  }

  let violation: number | null = null;
  const lastNegotiator = [...turns].reverse().find((t) => t.speaker === 'negotiator');
  const cited = lastNegotiator ? citedAmount(lastNegotiator.text) : null;
  if (cited != null) {
    const job = await activeJobData();
    if (job) {
      const allowed = knownAmounts(job.quotes);
      // Researched market figures are honest leverage ("from another company I found
      // out…") — citing them is not a phantom quote.
      for (const n of researchAmounts(job.research)) allowed.add(n);
      // Amounts the seller has stated in THIS call are fair to repeat back (they aren't
      // extracted into the store until the call saves).
      for (const t of turns) {
        if (t.speaker !== 'seller') continue;
        for (const m of t.text.matchAll(/\$\s?([\d,]+)/g)) allowed.add(Number(m[1].replace(/,/g, '')));
      }
      if (!allowed.has(cited)) violation = cited;
    }
  }

  return Response.json({ text: await showcaseSellerReply(turns, violation), violation });
}
