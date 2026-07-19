// Arms the auto body vertical demo: confirms the autobody job spec (making it the active
// job). Run with the matching vertical: NEXT_PUBLIC_VERTICAL=autobody npm run dev
// Usage: npm run seed:autobody
import { upsert, readAll } from '../lib/store.ts';
import { autobodyDemoSpec } from '../config/autobody.ts';
import type { JobSpec } from '../types.ts';

await upsert('jobspecs', 'jobId', autobodyDemoSpec as unknown as Record<string, unknown>);
const active = (await readAll<JobSpec>('jobspecs')).filter((s) => s.confirmedByUser).at(-1);
if (active?.jobId !== 'job-autobody-1') throw new Error('seed failed: autobody spec is not active');
console.log(`Seeded + activated ${active.jobId} (${active.vehicle})`);
