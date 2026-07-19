import { bestBindingQuote } from '@/lib/calls';
import { readAll } from '@/lib/store';
import type { Quote } from '@/types';

// The negotiator agent's get_best_competing_quote tool hits this mid-call.
export async function GET() {
  const best = bestBindingQuote(await readAll<Quote>('quotes'));
  return Response.json(
    best ? { provider: best.providerName, total: best.totalPrice, binding: best.binding } : null
  );
}
