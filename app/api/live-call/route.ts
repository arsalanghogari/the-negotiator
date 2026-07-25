import { extractQuote, bestBindingQuote } from '@/lib/calls';
import { activeJobData } from '@/lib/job-data';
import { upsert } from '@/lib/store';
import { stripDirections } from '@/lib/utils';
import { vertical } from '@/config/vertical';
import type { Transcript, TranscriptTurn } from '@/types';

export const maxDuration = 60;

// LIVE outbound calls via the ElevenLabs Twilio integration. Deliberately gated:
// LIVE_CALLS_ENABLED must be set, one call per request, target number is explicit.
// California is a two-party-consent state — the call opens with an AI + recording
// disclosure (see prompt addendum below); keep that intact.
const EL = 'https://api.elevenlabs.io/v1/convai';

const headers = () => ({
  'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '',
  'content-type': 'application/json',
});

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);

// Trigger a live call to one counterparty.
export async function POST(req: Request) {
  if (process.env.LIVE_CALLS_ENABLED !== 'true') {
    return Response.json({ error: 'live calls are disabled (set LIVE_CALLS_ENABLED=true)' }, { status: 403 });
  }
  const phoneNumberId = process.env.ELEVENLABS_PHONE_NUMBER_ID;
  if (!phoneNumberId) {
    return Response.json({ error: 'ELEVENLABS_PHONE_NUMBER_ID not configured' }, { status: 500 });
  }
  const { toNumber, providerName } = (await req.json()) as { toNumber?: string; providerName?: string };
  if (!toNumber || !providerName) {
    return Response.json({ error: 'toNumber and providerName required' }, { status: 400 });
  }
  const job = await activeJobData();
  if (!job) return Response.json({ error: 'no confirmed job spec' }, { status: 400 });

  const best = bestBindingQuote(job.quotes);
  const quoteState = best
    ? `You hold EXACTLY $${best.totalPrice.toLocaleString()} (binding, from ${best.providerName}).`
    : 'You hold none.';
  const liveAddendum = `

LIVE CALL — you are on a REAL phone call with ${providerName}, a real business. Rules that override everything else:
- OPEN the call by disclosing, in one natural sentence, that you are Parley, an AI assistant calling on behalf of a customer, and that the call may be recorded. Do this before anything else.
- Be respectful of the dispatcher's time; if they want to end the call, thank them and end it.
- Job spec (your only source of truth): ${JSON.stringify(vertical.specForCall(job.spec))}
- Competing-quote state: ${quoteState} Any other competing amount is a lie.`;

  // Overrides replace the whole prompt — fetch the agent's base prompt and append.
  const agentRes = await fetch(`${EL}/agents/${process.env.ELEVENLABS_AGENT_ID_NEGOTIATOR}`, { headers: headers() });
  if (!agentRes.ok) return Response.json({ error: 'could not read agent config' }, { status: 502 });
  const basePrompt = (await agentRes.json()).conversation_config.agent.prompt.prompt as string;

  const res = await fetch(`${EL}/twilio/outbound-call`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      agent_id: process.env.ELEVENLABS_AGENT_ID_NEGOTIATOR,
      agent_phone_number_id: phoneNumberId,
      to_number: toNumber,
      conversation_initiation_client_data: {
        conversation_config_override: {
          agent: { prompt: { prompt: `${basePrompt}${liveAddendum}` } },
        },
      },
    }),
  });
  const j = await res.json();
  if (!res.ok) return Response.json({ error: j.detail ?? JSON.stringify(j) }, { status: res.status });
  return Response.json({ conversationId: j.conversation_id, callSid: j.callSid, providerName });
}

// Poll a live call; when done, ingest the transcript through the normal pipeline.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const providerName = url.searchParams.get('provider') ?? 'Live call';
  if (!id) return Response.json({ error: 'missing id' }, { status: 400 });

  const res = await fetch(`${EL}/conversations/${id}`, { headers: headers() });
  if (!res.ok) return Response.json({ error: `upstream ${res.status}` }, { status: res.status });
  const conv = (await res.json()) as {
    status: string;
    transcript?: { role: string; message: string | null }[];
  };
  if (conv.status !== 'done' && conv.status !== 'failed') {
    return Response.json({ status: conv.status });
  }
  if (conv.status === 'failed') return Response.json({ status: 'failed' });

  const job = await activeJobData();
  if (!job) return Response.json({ error: 'no confirmed job spec' }, { status: 400 });
  const turns: TranscriptTurn[] = (conv.transcript ?? [])
    .filter((t) => t.message)
    .map((t) => ({
      speaker: t.role === 'agent' ? ('negotiator' as const) : ('seller' as const),
      text: stripDirections(t.message!),
    }));
  if (turns.length < 2) return Response.json({ status: 'done', quote: null, turns });

  const transcript: Transcript = {
    transcriptId: `tx-${job.spec.jobId}-live-${slug(providerName)}`,
    jobId: job.spec.jobId,
    persona: 'live',
    providerName,
    turns,
    conversationId: id, // recording player works for live calls too
  };
  await upsert('transcripts', 'transcriptId', transcript as unknown as Record<string, unknown>);
  const quote = await extractQuote(transcript);
  await upsert('quotes', 'quoteId', quote as unknown as Record<string, unknown>);
  return Response.json({ status: 'done', quote, turns });
}
