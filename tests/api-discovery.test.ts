import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Discovery must (a) follow the ACTIVE job's origin — the San-Jose-movers-for-an-LA-move
// bug — and (b) never break the demo when Google is unavailable (snapshot fallback).

const { storeData } = vi.hoisted(() => ({ storeData: { specs: [] as unknown[] } }));

vi.mock('@/lib/store', () => ({
  readAll: async () => storeData.specs,
}));

const laSpec = {
  jobId: 'job-la', vertical: 'moving', confirmedByUser: true,
  origin: { city: 'Los Angeles', zip: '90012', floor: 1, hasElevator: false },
  destination: { city: 'Santa Clarita', zip: '91350', floor: 1, hasElevator: false },
  distanceMiles: 35, homeSize: '2br', largeItems: [], boxCountEst: 0, stairsFlights: 0,
  longCarry: false, packingService: false, preferredDate: '2026-08-10', specialNotes: '',
  customerName: '', contactEmail: '',
};

const realFetch = global.fetch;

beforeEach(() => {
  storeData.specs = [laSpec];
  delete process.env.GOOGLE_PLACES_API_KEY;
  delete process.env.GOOGLE_MAPS_API_KEY;
});

afterEach(() => {
  global.fetch = realFetch;
});

describe('/api/discovery', () => {
  test('no key → baked snapshot, live:false', async () => {
    const { GET } = await import('@/app/api/discovery/route');
    const j = await (await GET()).json();
    expect(j.live).toBe(false);
    expect(j.candidates.length).toBeGreaterThan(0);
  });

  test('with key → queries Places around the ACTIVE job origin', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test';
    let sentBody = '';
    global.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      sentBody = String(init?.body);
      return new Response(
        JSON.stringify({ places: [{ displayName: { text: 'LA Mover' }, rating: 4.9, userRatingCount: 10, nationalPhoneNumber: '(213) 555-0100' }] }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;

    const { GET } = await import('@/app/api/discovery/route');
    const j = await (await GET()).json();
    expect(sentBody).toContain('Los Angeles, 90012');
    expect(j.live).toBe(true);
    expect(j.candidates[0].name).toBe('LA Mover');
  });

  test('Places failure → falls back to snapshot instead of erroring', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test';
    global.fetch = vi.fn(async () => new Response('quota', { status: 429 })) as unknown as typeof fetch;
    const { GET } = await import('@/app/api/discovery/route');
    const j = await (await GET()).json();
    expect(j.live).toBe(false);
    expect(j.candidates.length).toBeGreaterThan(0);
  });
});
