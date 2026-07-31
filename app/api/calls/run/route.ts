import { runCall, extractQuote } from '@/lib/calls';
import { researchMarketRate } from '@/lib/research';
import { readAll, upsert, writeAll } from '@/lib/store';
import { vertical } from '@/config/vertical';
import type { JobSpec, Quote, Report, Transcript } from '@/types';

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

  // Fresh run = fresh evidence: purge this job's previous transcripts/quotes/report, or a
  // stale quote from a prior run leaks in as "competing leverage" (the agent once cited a
  // seller's own last-run price back at them as a rival bid).
  const txAll = await readAll<Transcript>('transcripts');
  const stale = new Set(txAll.filter((t) => t.jobId === spec.jobId).map((t) => t.transcriptId));
  await writeAll('transcripts', txAll.filter((t) => !stale.has(t.transcriptId)));
  await writeAll('quotes', (await readAll<Quote>('quotes')).filter((q) => !stale.has(q.transcriptRef)));
  await writeAll('reports', (await readAll<Report>('reports')).filter((r) => r.jobId !== spec.jobId));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (o: object) => controller.enqueue(encoder.encode(JSON.stringify(o) + '\n'));
      try {
        // Anchor leverage for call #1: web-searched market rate for this exact job.
        // null on failure — the run proceeds exactly as before, without it.
        emit({ type: 'status', status: 'researching' });
        const research = await researchMarketRate(spec);
        if (research) await upsert('research', 'jobId', research as unknown as Record<string, unknown>);

        let best: Quote | null = null;
        for (const seller of sellers) {
          emit({ type: 'status', persona: seller.persona, status: 'calling' });
          const transcript = await runCall(spec, seller, best, research, (turn) =>
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
