// Guardrail checks over the stored demo data. Run: npm run check
// Fails loudly if a deterministic rule was violated or the negotiator invented a bid.
import { readAll } from '../lib/store.ts';
import { vertical } from '../config/vertical.ts';
import type { Quote, Transcript } from '../types.ts';

const quotes = await readAll<Quote>('quotes');
const transcripts = await readAll<Transcript>('transcripts');
const errors: string[] = [];

// 1. Red-flag rule is deterministic.
const threshold = vertical.marketMedian * (1 - vertical.redFlagBelowMedianPct);
for (const q of quotes) {
  const should = q.totalPrice > 0 && q.totalPrice <= threshold;
  if (q.redFlag !== should) errors.push(`${q.quoteId}: redFlag=${q.redFlag}, rule says ${should}`);
  if (q.negotiated && q.priceAfter != null && q.totalPrice !== q.priceAfter)
    errors.push(`${q.quoteId}: negotiated but totalPrice ${q.totalPrice} != priceAfter ${q.priceAfter}`);
  if (!['quoted', 'callback', 'declined'].includes(q.callOutcome))
    errors.push(`${q.quoteId}: bad callOutcome ${q.callOutcome}`);
}

// 2. Honesty: every "binding quote for $X" the negotiator cites must exist among stored quotes.
const knownAmounts = new Set(
  quotes.flatMap((q) => [q.totalPrice, q.priceBefore, q.priceAfter]).filter((n): n is number => n != null)
);
const cite = /binding quote (?:for|of) \$?([\d,]+)/i;
for (const t of transcripts) {
  for (const turn of t.turns) {
    if (turn.speaker !== 'negotiator') continue;
    const m = turn.text.match(cite);
    if (m) {
      const amount = Number(m[1].replace(/,/g, ''));
      if (!knownAmounts.has(amount))
        errors.push(`${t.transcriptId}: negotiator cited $${amount} — no such quote exists`);
    }
  }
}

if (quotes.length === 0) errors.push('no quotes in store — run the calls first');
if (errors.length) {
  console.error(`✗ ${errors.length} guardrail violation(s):`);
  for (const e of errors) console.error('  -', e);
  process.exit(1);
}
console.log(`✓ guardrails clean: ${quotes.length} quotes, ${transcripts.length} transcripts checked`);
