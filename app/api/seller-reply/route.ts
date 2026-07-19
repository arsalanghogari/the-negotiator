import { showcaseSellerReply } from '@/lib/calls';
import type { TranscriptTurn } from '@/types';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { turns } = (await req.json()) as { turns: TranscriptTurn[] };
  if (!Array.isArray(turns) || turns.length === 0) {
    return Response.json({ error: 'turns required' }, { status: 400 });
  }
  return Response.json({ text: await showcaseSellerReply(turns) });
}
