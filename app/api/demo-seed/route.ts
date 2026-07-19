import { demoJobSpec } from '@/lib/demo';
import { upsert } from '@/lib/store';

// Arms the Run-demo flow: confirms the demo job spec without touching other data.
export async function POST() {
  await upsert('jobspecs', 'jobId', demoJobSpec as unknown as Record<string, unknown>);
  return Response.json({ ok: true, jobId: demoJobSpec.jobId });
}
