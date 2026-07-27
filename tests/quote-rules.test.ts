import { describe, expect, test } from 'vitest';
import { citedAmount, knownAmounts, itemizationMismatch } from '../lib/quote-rules';
import type { Quote } from '../types';

// The tripwire parser is the honesty guarantee: a miss means an invented competing quote
// sails through unverified. Table-driven on purpose — add a row per new speech pattern.
describe('citedAmount — digit citations', () => {
  const cases: [string, number | null][] = [
    ['I have a binding quote for $2,000, can you beat it?', 2000],
    ['I have a binding quote for $1,900.', 1900],
    ['I have a quote of $2,400 from another mover.', 2400],
    ['They gave me an offer at $950.', 950],
    ['quote for 2,300 from a competitor', 2300], // no dollar sign
    ['a quote for $12,500 on the same job', 12500],
  ];
  test.each(cases)('%s → %s', (text, want) => {
    expect(citedAmount(text)).toBe(want);
  });
});

describe('citedAmount — worded citations (voice agents speak numbers)', () => {
  const cases: [string, number | null][] = [
    ['I have a binding quote for two thousand dollars.', 2000],
    ['I have a binding quote for one thousand, nine hundred dollars. Can you beat that price?', 1900], // the real phantom
    ['I have a binding quote for two thousand one hundred sixty dollars. Can you beat it?', 2160],
    ['a quote of nineteen hundred dollars from another company', 1900],
    ['a quote for twenty-four hundred dollars', 2400],
    ['binding offer of three thousand fifty dollars', 3050],
    ['a quote of eight hundred fifty dollars', 850],
    ['an offer of seven hundred dollars flat', 700],
    ['quote for two thousand, two hundred and fifty dollars', 2250],
  ];
  test.each(cases)('%s → %s', (text, want) => {
    expect(citedAmount(text)).toBe(want);
  });
});

describe('citedAmount — non-citations stay silent', () => {
  const cases: string[] = [
    'Could you itemize the fees for me?',
    'So to confirm: $2,000 binding for the move as described — correct?', // confirm-back, no "quote for"
    'We have two trucks available on that date.', // "two" is not a price
    'Is that binding?',
    'The move is on August first, two thousand twenty-six.', // a DATE, not a quote (no trigger phrase)
    'I appreciate the offer, thank you.', // "offer" without an amount after it
  ];
  test.each(cases)('%s → null', (text) => {
    expect(citedAmount(text)).toBeNull();
  });
});

describe('citedAmount — known ceiling (documented, not silently wrong)', () => {
  // Colloquial pair-form ("twenty-four fifty" = $2,450) parses arithmetically to 74.
  // ponytail: accepted miss — the tripwire treats an unparseable/odd amount as a
  // violation-candidate anyway when it doesn't match known amounts; revisit if agents
  // start speaking pair-form. This test documents today's behavior so a change is loud.
  test('pair-form "twenty four fifty" parses arithmetically (74), not colloquially (2450)', () => {
    expect(citedAmount('a quote for twenty four fifty')).toBe(74);
  });
});

describe('knownAmounts', () => {
  const q = (over: Partial<Quote>): Quote =>
    ({
      quoteId: 'q', providerName: 'p', persona: 'tough', basePrice: 0, lineItems: [],
      totalPrice: 0, binding: false, redFlag: false, redFlagReason: null,
      itemizationMismatch: false, negotiated: false, priceBefore: null, priceAfter: null,
      transcriptRef: 't', callOutcome: 'quoted', ...over,
    }) as Quote;

  test('collects totals, priceBefore, and priceAfter across quotes', () => {
    const set = knownAmounts([
      q({ totalPrice: 2000, priceBefore: 2300, priceAfter: 2000 }),
      q({ totalPrice: 1500 }),
    ]);
    expect([...set].sort()).toEqual([1500, 2000, 2300]);
  });
  test('ignores zeros and nulls (callback quotes contribute nothing)', () => {
    expect(knownAmounts([q({ totalPrice: 0 })]).size).toBe(0);
  });
});

describe('itemizationMismatch — flag only when NO honest reading reconciles', () => {
  const base = {
    basePrice: 2300,
    lineItems: [{ label: 'fees', amount: 400 }],
    totalPrice: 2700,
    negotiated: false,
    priceBefore: null as number | null,
  };
  test('base + fees = total → clean', () => {
    expect(itemizationMismatch(base)).toBe(false);
  });
  test('base restated inside lineItems (fees alone = pre-negotiation total) → clean', () => {
    // The real Golden Gate case: "Base price $2,300" AND "Base moving service $2,300".
    expect(
      itemizationMismatch({
        basePrice: 2300,
        lineItems: [{ label: 'Base moving service', amount: 2300 }, { label: 'large items', amount: 300 }, { label: 'long carry', amount: 100 }],
        totalPrice: 2400,
        negotiated: true,
        priceBefore: 2700,
      })
    ).toBe(false);
  });
  test('negotiated drop without re-itemization (base+fees = priceBefore) → clean', () => {
    expect(
      itemizationMismatch({
        basePrice: 2400,
        lineItems: [{ label: 'piano', amount: 200 }, { label: 'long carry', amount: 100 }],
        totalPrice: 2250,
        negotiated: true,
        priceBefore: 2700,
      })
    ).toBe(false);
  });
  test('genuinely broken sums → flagged', () => {
    expect(
      itemizationMismatch({ basePrice: 2000, lineItems: [{ label: 'piano', amount: 200 }], totalPrice: 2500, negotiated: false, priceBefore: null })
    ).toBe(true);
  });
  test('unknown fee amount → unverifiable, never flagged', () => {
    expect(
      itemizationMismatch({ basePrice: 1500, lineItems: [{ label: 'stairs', amount: null }], totalPrice: 1500, negotiated: false, priceBefore: null })
    ).toBe(false);
  });
  test('zero-total callback quote → never flagged', () => {
    expect(itemizationMismatch({ basePrice: 0, lineItems: [], totalPrice: 0, negotiated: false, priceBefore: null })).toBe(false);
  });
});
