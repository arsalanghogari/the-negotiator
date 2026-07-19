import { runCall, extractQuote } from '@/lib/calls';
import { readAll, upsert } from '@/lib/store';
import { vertical } from '@/config/vertical';
import type { JobSpec, Quote } from '@/types';

export const maxDuration = 300; // sequential gpt-4o calls take a while

// Streams NDJSON events: {type:'status'|'turn'|'quote'|'error', ...}
// Sequential by design (spec §1); parallelism would go here if ever needed.
export async function POST(req: Request) {
  // Demo mode excludes 'tough' — that call runs audibly as the listen-in voice call instead.
  const body = (await req.json().catch(() => ({}))) as { exclude?: string };
  const sellers = vertical.sellers.filter((s) => s.persona !== body.exclude);
  const specs = await readAll<JobSpec>('jobspecs');
  const spec = specs.filter((s) => s.confirmedByUser).at(-1);
  if (!spec) return Response.json({ error: 'no confirmed job spec — run intake first' }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (o: object) => controller.enqueue(encoder.encode(JSON.stringify(o) + '\n'));
      try {
        let best: Quote | null = null;
        for (const seller of sellers) {
          emit({ type: 'status', persona: seller.persona, status: 'calling' });
          const transcript = await runCall(spec, seller, best, (turn) =>
            emit({ type: 'turn', persona: seller.persona, ...turn })
          );
          await upsert('transcripts', 'transcriptId', transcript as unknown as Record<string, unknown>);

          emit({ type: 'status', persona: seller.persona, status: 'extracting' });
          const quote = await extractQuote(transcript);
          await upsert('quotes', 'quoteId', quote as unknown as Record<string, unknown>);
          emit({ type: 'quote', persona: seller.persona, quote });

          // Leverage for the next call: lowest binding total so far.
          if (quote.binding && quote.callOutcome === 'quoted' && (!best || quote.totalPrice < best.totalPrice)) {
            best = quote;
          }
        }
        emit({ type: 'status', status: 'done' });
      } catch (e) {
        emit({ type: 'error', message: String(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson' } });
}
