import { vertical } from '@/config/vertical';
import { readAll } from '@/lib/store';
import type { JobSpec } from '@/types';

export const maxDuration = 15;

// Live business discovery via Google Places Text Search (New): the call list fetched
// programmatically, per the brief — searched around the ACTIVE job's origin, not a fixed
// city. Falls back to the baked directory snapshot in config when no key is set or the
// request fails — a quota hiccup can never break the demo.
export async function GET() {
  const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  const { discovery } = vertical;
  const spec = (await readAll<JobSpec>('jobspecs')).filter((s) => s.confirmedByUser).at(-1);
  const query = spec ? vertical.discoveryQuery(spec) : discovery.query;
  if (key) {
    try {
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask':
            'places.displayName,places.rating,places.userRatingCount,places.nationalPhoneNumber',
        },
        body: JSON.stringify({ textQuery: query, maxResultCount: 8 }),
      });
      if (!res.ok) throw new Error(`places ${res.status}`);
      const j = (await res.json()) as {
        places?: {
          displayName?: { text?: string };
          rating?: number;
          userRatingCount?: number;
          nationalPhoneNumber?: string;
        }[];
      };
      const candidates = (j.places ?? [])
        .filter((p) => p.displayName?.text)
        .map((p) => ({
          name: p.displayName!.text!,
          rating: p.rating,
          reviews: p.userRatingCount,
          phone: p.nationalPhoneNumber,
        }));
      if (candidates.length) {
        return Response.json({ source: 'Google Places', query, candidates, live: true });
      }
    } catch {
      // fall through to the snapshot
    }
  }
  return Response.json({
    source: discovery.source,
    query: discovery.query,
    candidates: discovery.candidates,
    live: false,
  });
}
