import type { Quote } from '../types';

// A competing-quote citation in negotiator speech. Voice agents speak amounts in words
// ("one thousand, nine hundred dollars"), text agents in digits ("$1,900") — parse both.
const UNITS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

function wordsToNumber(words: string[]): number | null {
  let total = 0, current = 0, seen = false;
  for (const w of words) {
    if (w in UNITS) { current += UNITS[w]; seen = true; }
    else if (w in TENS) { current += TENS[w]; seen = true; }
    else if (w === 'hundred') { current = (current || 1) * 100; seen = true; }
    else if (w === 'thousand') { total += (current || 1) * 1000; current = 0; seen = true; }
    else if (w === 'and') continue;
    else break;
  }
  return seen ? total + current : null;
}

export function citedAmount(text: string): number | null {
  const m = text.match(/(?:quote|offer)\s+(?:for|of|at)\s+(.{0,60})/i);
  if (!m) return null;
  const tail = m[1];
  const digits = tail.match(/^\$?\s?([\d,]+)/);
  if (digits) return Number(digits[1].replace(/,/g, ''));
  return wordsToNumber(tail.toLowerCase().replace(/[,–—-]/g, ' ').split(/\s+/).filter(Boolean));
}

// Every dollar amount stated anywhere in a turn — digits ("$2,150") or spoken words
// ("two thousand dollars"). Word parsing also yields partial sums; that only ever adds
// extra candidates, and membership still requires the exact total.
function amountsIn(text: string): Set<number> {
  const out = new Set<number>();
  for (const m of text.replace(/(\d),(?=\d)/g, '$1').matchAll(/\d+/g)) out.add(Number(m[0]));
  const words = text.toLowerCase().replace(/[,–—-]/g, ' ').split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    if (!(words[i] in UNITS || words[i] in TENS)) continue;
    const n = wordsToNumber(words.slice(i));
    if (n != null && n > 0) out.add(n);
  }
  return out;
}

// Binding is what arms the leverage chain, so extraction's say-so (or a seller's) is not
// enough: it stands only if the NEGOTIATOR restated it on the call with the exact total
// ("So to confirm: $2,150 binding — correct?"), which its prompt requires before accepting.
export function bindingConfirmed(turns: { speaker: string; text: string }[], total: number): boolean {
  return (
    total > 0 &&
    turns.some((t) => t.speaker === 'negotiator' && /binding/i.test(t.text) && amountsIn(t.text).has(total))
  );
}

// Researched market figures are legitimately citable ("from another company I found out
// this runs about $X") — they ARE other companies' published prices. The tripwire must
// not punish honest leverage; binding claims remain corroborated-quotes-only.
// Structural type (not MarketResearch) so scripts/check.ts keeps plain-node imports.
export function researchAmounts(
  r: { typicalLow: number; typicalHigh: number; median: number } | null | undefined
): number[] {
  return r ? [r.typicalLow, r.median, r.typicalHigh] : [];
}

// Every dollar amount that legitimately exists for a job's quotes — the only numbers
// the negotiator may ever cite as competing quotes.
export function knownAmounts(quotes: Quote[]): Set<number> {
  return new Set(
    quotes.flatMap((q) => [q.totalPrice, q.priceBefore, q.priceAfter]).filter((n): n is number => n != null && n > 0)
  );
}

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
