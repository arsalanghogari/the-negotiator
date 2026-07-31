import { describe, expect, test } from 'vitest';
import { moving } from '../config/moving.ts';
import { autobody } from '../config/autobody.ts';

// Market research runs once at the start and arms EVERY call — with or without a
// competing quote. It is attributable to other companies (the figures ARE their
// published prices), but never a binding offer or a personally-given quote.

const spec = '{"homeSize":"2br"}';
const research = '{"typicalLow":1800,"typicalHigh":3200,"median":2400,"source":"web"}';
const quote = '{"provider":"Budget Moves Co","total":1500,"binding":true}';

describe.each([
  ['moving', moving],
  ['autobody', autobody],
])('%s negotiatorPrompt', (_name, vertical) => {
  test('no quote + research → attributable market-rate leverage with the binding-claim line', () => {
    const p = vertical.negotiatorPrompt(spec, null, research);
    expect(p).toContain(research);
    expect(p).toContain('from another');
    expect(p).toContain('binding offer');
  });

  test('competing quote + research → holds both levers', () => {
    const p = vertical.negotiatorPrompt(spec, quote, research);
    expect(p).toContain(quote);
    expect(p).toContain(research);
    expect(p).toContain('binding offer');
  });

  test('neither → unchanged fallback', () => {
    expect(vertical.negotiatorPrompt(spec, null, null)).toContain('no competing quote yet, so focus');
  });
});
