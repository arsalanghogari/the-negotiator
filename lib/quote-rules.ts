import type { Quote } from '../types';

// Itemization must reconcile against SOME honest reading before we accuse anyone:
// base+fees or fees alone (extractors sometimes restate the base as a line item),
// against the final total or the pre-negotiation total (sellers rarely re-itemize
// after conceding). Unknown fee amounts make it unverifiable, not mismatched.
// Relative imports only — scripts/check.ts runs this under plain node.
export function itemizationMismatch(
  q: Pick<Quote, 'basePrice' | 'lineItems' | 'totalPrice' | 'negotiated' | 'priceBefore'>
): boolean {
  const amounts = q.lineItems.map((li) => li.amount);
  if (q.totalPrice <= 0 || amounts.some((a) => a == null)) return false;
  const feeSum = (amounts as number[]).reduce((s, a) => s + a, 0);
  const targets = [q.totalPrice, ...(q.negotiated && q.priceBefore != null ? [q.priceBefore] : [])];
  const sums = [q.basePrice + feeSum, feeSum];
  return !sums.some((s) => targets.includes(s));
}
