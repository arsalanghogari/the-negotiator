import { requestInvoiceCall } from '@/lib/calls';
import { readAll, upsert } from '@/lib/store';
import type { InvoiceRequest, JobSpec, Quote } from '@/types';

export const maxDuration = 60;

// Simulated follow-up (DEMO_MODE): the "invoice" is requested on a call with the
// simulated seller — no real email is ever sent.
export async function POST(req: Request) {
  const { quoteId, email } = await req.json();
  if (!quoteId || !email) return Response.json({ error: 'quoteId and email required' }, { status: 400 });

  const quote = (await readAll<Quote>('quotes')).find((q) => q.quoteId === quoteId);
  const spec = (await readAll<JobSpec>('jobspecs')).filter((s) => s.confirmedByUser).at(-1);
  if (!quote || !spec) return Response.json({ error: 'quote or job spec not found' }, { status: 404 });

  const turns = await requestInvoiceCall(spec, quote, email);
  const request: InvoiceRequest = {
    jobId: spec.jobId,
    quoteId,
    providerName: quote.providerName,
    email,
    turns,
    status: 'requested',
  };
  await upsert('actions', 'jobId', request as unknown as Record<string, unknown>);
  return Response.json(request);
}
