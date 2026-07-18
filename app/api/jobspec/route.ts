import { readAll, upsert } from '@/lib/store';
import type { JobSpec } from '@/types';

export async function GET() {
  return Response.json(await readAll<JobSpec>('jobspecs'));
}

export async function POST(req: Request) {
  const spec = (await req.json()) as JobSpec;
  if (!spec.jobId || !spec.confirmedByUser) {
    return Response.json({ error: 'jobId and confirmedByUser required' }, { status: 400 });
  }
  await upsert('jobspecs', 'jobId', spec as unknown as Record<string, unknown>);
  return Response.json({ ok: true });
}
