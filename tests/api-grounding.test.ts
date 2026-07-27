import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { JobSpec, Quote, Transcript } from '../types';

// Integration tests for the grounding invariants — each one is a shipped-bug regression:
// unscoped reads once made the chatbot blend stale transcripts (invented fee breakdowns)
// and made the agent cite another job's quote as live leverage.

const { createMock, storeData } = vi.hoisted(() => ({
  createMock: vi.fn(),
  storeData: { collections: {} as Record<string, unknown[]> },
}));

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: createMock } };
  },
}));

vi.mock('@/lib/store', () => ({
  readAll: async (name: string) => storeData.collections[name] ?? [],
  writeAll: async (name: string, items: unknown[]) => { storeData.collections[name] = items; },
  upsert: async (name: string, idKey: string, item: Record<string, unknown>) => {
    const items = (storeData.collections[name] ?? []) as Record<string, unknown>[];
    const i = items.findIndex((x) => x[idKey] === item[idKey]);
    if (i >= 0) items.splice(i, 1);
    items.push(item);
    storeData.collections[name] = items;
  },
}));

const spec = (jobId: string, over: Partial<JobSpec> = {}): JobSpec => ({
  jobId, vertical: 'moving',
  origin: { city: 'San Francisco', zip: '94110', floor: 3, hasElevator: false },
  destination: { city: 'San Jose', zip: '95112', floor: 1, hasElevator: true },
  distanceMiles: 45, homeSize: '2br', largeItems: [], boxCountEst: 40, stairsFlights: 2,
  longCarry: true, packingService: false, preferredDate: '2026-08-01', specialNotes: '',
  customerName: 'Alex', contactEmail: 'a@b.co', confirmedByUser: true, ...over,
});

const transcript = (id: string, jobId: string, text: string): Transcript => ({
  transcriptId: id, jobId, persona: 'tough', providerName: `prov-${id}`,
  turns: [{ speaker: 'seller', text }],
});

const quote = (transcriptRef: string, over: Partial<Quote> = {}): Quote => ({
  quoteId: `q-${transcriptRef}`, providerName: `prov-${transcriptRef}`, persona: 'tough',
  basePrice: 2000, lineItems: [], totalPrice: 2000, binding: true, redFlag: false,
  redFlagReason: null, itemizationMismatch: false, negotiated: false, priceBefore: null,
  priceAfter: null, transcriptRef, callOutcome: 'quoted', ...over,
});

beforeEach(() => {
  createMock.mockReset();
  createMock.mockResolvedValue({ choices: [{ message: { content: 'stubbed answer' } }] });
  storeData.collections = {};
});

describe('/api/ask — only the active job’s quote-backed transcripts reach the model', () => {
  test('excludes stale unbacked transcripts and other jobs', async () => {
    storeData.collections = {
      jobspecs: [spec('job-A')],
      transcripts: [
        transcript('tx-backed', 'job-A', 'UNIQUE-BACKED-LINE'),
        transcript('tx-stale', 'job-A', 'UNIQUE-STALE-LINE'), // seeded fixture, no quote
        transcript('tx-other', 'job-B', 'UNIQUE-OTHERJOB-LINE'),
      ],
      quotes: [quote('tx-backed'), quote('tx-other')],
      reports: [],
    };
    const { POST } = await import('@/app/api/ask/route');
    const res = await POST(
      new Request('http://t/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'why?' }] }),
      })
    );
    expect(res.status).toBe(200);
    const system = createMock.mock.calls[0][0].messages[0].content as string;
    expect(system).toContain('UNIQUE-BACKED-LINE');
    expect(system).not.toContain('UNIQUE-STALE-LINE');
    expect(system).not.toContain('UNIQUE-OTHERJOB-LINE');
  });

  test('400 when no confirmed spec exists', async () => {
    const { POST } = await import('@/app/api/ask/route');
    const res = await POST(
      new Request('http://t/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'why?' }] }),
      })
    );
    expect(res.status).toBe(400);
  });
});

describe('/api/best-quote — leverage is scoped to the active job', () => {
  test('another job’s lower binding quote never leaks in', async () => {
    storeData.collections = {
      jobspecs: [spec('job-B'), spec('job-A')], // job-A is active (last confirmed)
      transcripts: [transcript('tx-a', 'job-A', 'x'), transcript('tx-b', 'job-B', 'x')],
      quotes: [
        quote('tx-a', { totalPrice: 2300, providerName: 'A-Mover' }),
        quote('tx-b', { totalPrice: 2000, providerName: 'B-Mover' }), // lower, wrong job
      ],
    };
    const { GET } = await import('@/app/api/best-quote/route');
    const j = await (await GET()).json();
    expect(j.answer).toContain('$2,300');
    expect(j.answer).toContain('A-Mover');
    expect(j.answer).not.toContain('2,000');
  });

  test('no binding quotes → explicit hold-none instruction', async () => {
    storeData.collections = {
      jobspecs: [spec('job-A')],
      transcripts: [transcript('tx-a', 'job-A', 'x')],
      quotes: [quote('tx-a', { binding: false })],
    };
    const { GET } = await import('@/app/api/best-quote/route');
    const j = await (await GET()).json();
    expect(j.answer).toContain('You hold no competing quote');
  });
});

describe('/api/seller-reply — the anti-bluff tripwire', () => {
  const post = async (turns: unknown) => {
    const { POST } = await import('@/app/api/seller-reply/route');
    return (
      await POST(
        new Request('http://t/api/seller-reply', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ turns }),
        })
      )
    ).json();
  };

  beforeEach(() => {
    storeData.collections = {
      jobspecs: [spec('job-A')],
      transcripts: [transcript('tx-a', 'job-A', 'x')],
      quotes: [quote('tx-a', { totalPrice: 2000, priceBefore: 2300, priceAfter: 2000, negotiated: true })],
    };
  });

  test('phantom worded citation → violation with the parsed amount', async () => {
    const j = await post([
      { speaker: 'seller', text: 'Our price is $2,400.' },
      { speaker: 'negotiator', text: 'I have a binding quote for one thousand, nine hundred dollars. Can you beat it?' },
    ]);
    expect(j.violation).toBe(1900);
  });

  test('citing a real stored amount → no violation', async () => {
    const j = await post([
      { speaker: 'seller', text: 'Our price is $2,400.' },
      { speaker: 'negotiator', text: 'I have a binding quote for $2,000, can you beat it?' },
    ]);
    expect(j.violation).toBeNull();
  });

  test('repeating an amount the seller stated THIS call → no violation', async () => {
    const j = await post([
      { speaker: 'seller', text: 'I can do a binding rate of $2,150 for this move.' },
      { speaker: 'negotiator', text: 'So that is a quote of $2,150 for the move as described?' },
    ]);
    expect(j.violation).toBeNull();
  });
});

describe('/api/live-call — the safety gate holds', () => {
  test('refuses when LIVE_CALLS_ENABLED is not true', async () => {
    delete process.env.LIVE_CALLS_ENABLED;
    const { POST } = await import('@/app/api/live-call/route');
    const res = await POST(
      new Request('http://t/api/live-call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ toNumber: '+13105550100', providerName: 'Test' }),
      })
    );
    expect(res.status).toBe(403);
  });
});
