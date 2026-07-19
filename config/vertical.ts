// Vertical selector — the config-swap seam. The whole engine (intake spec → calls →
// extraction → report → booking) reads only `vertical`; pointing it at another file is
// how the system changes markets. NEXT_PUBLIC_ so client components get it too (baked
// at build time — restart the dev server after switching).
//
//   NEXT_PUBLIC_VERTICAL=autobody npm run dev   # collision repair
//   npm run dev                                 # moving (default)
// .ts extensions so scripts/check.ts can import this under plain node (type stripping).
import { moving } from './moving.ts';
import { autobody } from './autobody.ts';

export const vertical = process.env.NEXT_PUBLIC_VERTICAL === 'autobody' ? autobody : moving;
