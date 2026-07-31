import { describe, expect, test } from 'vitest';
import { moving } from '../config/moving.ts';
import { autobody } from '../config/autobody.ts';

// Market research runs once at the start and arms EVERY call — with or without a
// competing quote — always framed as research, never as a bid.

const spec = '{"homeSize":"2br"}';
const research = '{"typicalLow":1800,"typicalHigh":3200,"median":2400,"source":"web"}';
const quote = '{"provider":"Budget Moves Co","total":1500,"binding":true}';

describe.each([
  ['moving', moving],
  ['autobody', autobody],
])('%s negotiatorPrompt', (_name, vertical) => {
  test('no quote + research → cites market rate, framed as research not a bid', () => {
    const p = vertical.negotiatorPrompt(spec, null, research);
    expect(p).toContain(research);
    expect(p).toContain('NOT a bid');
  });

  test('competing quote + research → holds both levers', () => {
    const p = vertical.negotiatorPrompt(spec, quote, research);
    expect(p).toContain(quote);
    expect(p).toContain(research);
    expect(p).toContain('NOT a bid');
  });

  test('neither → unchanged fallback', () => {
    expect(vertical.negotiatorPrompt(spec, null, null)).toContain('no competing quote yet, so focus');
  });
});
