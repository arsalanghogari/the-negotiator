import OpenAI from 'openai';
import { vertical } from '@/config/vertical';
import { itemizationMismatch } from '@/lib/quote-rules';
import type { JobSpec, Quote, Transcript, TranscriptTurn } from '@/types';

const openai = new OpenAI();
const MODEL = 'gpt-4o';
const MAX_NEGOTIATOR_TURNS = 16; // drip-fed details + dispatcher questions need more back-and-forth

type SellerCfg = (typeof vertical.sellers)[number];

function chat(system: string, turns: TranscriptTurn[], speakAs: 'negotiator' | 'seller') {
  return openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system' as const, content: system },
      ...turns.map((t) => ({
        role: t.speaker === speakAs ? ('assistant' as const) : ('user' as const),
        content: t.text,
      })),
    ],
  });
}

// Runs one negotiator↔seller call; onTurn fires per line for live UI streaming.
export async function runCall(
  spec: JobSpec,
  seller: SellerCfg,
  bestCompetingQuote: Quote | null,
  onTurn: (turn: TranscriptTurn) => void
): Promise<Transcript> {
  const best = bestCompetingQuote
    ? JSON.stringify({
        provider: bestCompetingQuote.providerName,
        total: bestCompetingQuote.totalPrice,
        binding: bestCompetingQuote.binding,
      })
    : null;
  // specForCall: the vertical decides which spec fields the agents see.
  const negotiatorSystem = vertical.negotiatorPrompt(JSON.stringify(vertical.specForCall(spec)), best);
  // Deterministic opener: identical job intro on every call, and no first-turn monologues.
  const opener: TranscriptTurn = { speaker: 'negotiator', text: vertical.opener(spec) };
  const turns: TranscriptTurn[] = [opener];
  onTurn(opener);

  for (let i = 0; i < MAX_NEGOTIATOR_TURNS; i++) {
    const sel = await chat(seller.systemPrompt, turns, 'seller');
    const selTurn: TranscriptTurn = { speaker: 'seller', text: (sel.choices[0].message.content ?? '').trim() };
    turns.push(selTurn);
    onTurn(selTurn);

    const neg = await chat(negotiatorSystem, turns, 'negotiator');
    const negText = neg.choices[0].message.content ?? '';
    const hangUp = negText.includes('[HANG_UP]');
    const turn: TranscriptTurn = { speaker: 'negotiator', text: negText.replace('[HANG_UP]', '').trim() };
    turns.push(turn);
    onTurn(turn);
    if (hangUp) break;
  }

  return {
    transcriptId: `tx-${spec.jobId}-${seller.persona}`,
    jobId: spec.jobId,
    persona: seller.persona,
    providerName: seller.providerName,
    turns,
  };
}

// Synthetic customer for the demo voice intake (the ElevenLabs intake agent asks; this answers).
// Turn mapping: 'negotiator' = the intake agent, 'seller' = the customer.
export async function demoCustomerReply(turns: TranscriptTurn[]): Promise<string> {
  const { demoJobSpec: s } = await import('@/lib/demo');
  const system = `You are ${s.customerName}, a customer on a phone call with a moving-company intake assistant. The facts of your move:
- Moving ${s.preferredDate} from ${s.origin.city} ${s.origin.zip} (floor ${s.origin.floor}, ${s.origin.hasElevator ? 'has' : 'no'} elevator) to ${s.destination.city} ${s.destination.zip} (floor ${s.destination.floor}, ${s.destination.hasElevator ? 'has' : 'no'} elevator), about ${s.distanceMiles} miles.
- ${s.homeSize} home, roughly ${s.boxCountEst} boxes, large items: ${s.largeItems.join(', ')}.
- ${s.stairsFlights} flights of stairs, ${s.longCarry ? 'long carry from street parking' : 'no long carry'}, ${s.packingService ? 'packing service wanted' : 'no packing service needed'}.
- Notes: ${s.specialNotes}
- Your email: ${s.contactEmail}
Answer the assistant's questions naturally and briefly — 1-2 short sentences, only what was asked, don't volunteer everything at once. When the assistant reads the spec back, confirm it's correct. When the conversation is wrapping up, say ONE brief goodbye and nothing else — never respond to a goodbye with another goodbye. Never break character; output only your spoken words.`;
  const res = await chat(system, turns, 'seller');
  return (res.choices[0].message.content ?? '').trim();
}

// One seller reply for the showcased voice call (the ElevenLabs agent is the negotiator).
// phantomCited: the caller just cited a competing quote that does NOT exist — a real
// dispatcher wouldn't swallow that, and neither does the simulation.
export async function showcaseSellerReply(turns: TranscriptTurn[], phantomCited: number | null = null): Promise<string> {
  const seller = vertical.sellers.find((s) => s.persona === 'tough')!;
  const system = `${seller.systemPrompt}\nThis is the showcased call: at a natural early moment — only once, and only if you have not already asked — ask suspiciously "Wait — am I talking to a robot?" and react naturally to the answer, then continue the negotiation.${
    phantomCited != null
      ? `\nIMPORTANT: the caller just claimed a competing quote of $${phantomCited.toLocaleString()}. In this negotiation that claim is unsubstantiated — react as a sharp dispatcher would: be openly skeptical, say you'll only consider matching a competing quote sent to you in writing, and do NOT lower your price based on the claim.`
      : ''
  }`;
  const res = await chat(system, turns, 'seller');
  return (res.choices[0].message.content ?? '').trim();
}

export function bestBindingQuote(quotes: Quote[]): Quote | null {
  return quotes
    .filter((q) => q.binding && q.callOutcome === 'quoted')
    .sort((a, b) => a.totalPrice - b.totalPrice)[0] ?? null;
}

// Short follow-up call: accept the quote and ask for an itemized invoice by email.
export async function requestInvoiceCall(spec: JobSpec, quote: Quote, email: string): Promise<TranscriptTurn[]> {
  const seller = vertical.sellers.find((s) => s.persona === quote.persona);
  if (!seller) throw new Error(`unknown persona ${quote.persona}`);
  const context = `${seller.systemPrompt}\nEarlier today you quoted this caller $${quote.totalPrice}${quote.binding ? ' (binding)' : ''} for their ${vertical.jobNoun}, and you have all the job details on file. They are calling back to accept. Do not ask any questions — happily confirm the booking and that you will email the itemized invoice to the address they give, repeating the address back.`;
  const turns: TranscriptTurn[] = [
    {
      speaker: 'negotiator',
      text: `Hi, I'm calling back about the ${vertical.jobNoun} we discussed — the booking is for ${spec.customerName || 'my client'}, and we'd like to go ahead with your quote of $${quote.totalPrice.toLocaleString()}. Could you email the itemized invoice to ${email}?`,
    },
  ];
  const sel = await chat(context, turns, 'seller');
  turns.push({ speaker: 'seller', text: (sel.choices[0].message.content ?? '').trim() });
  turns.push({ speaker: 'negotiator', text: 'Perfect, thank you. We look forward to the invoice. Goodbye!' });
  return turns;
}

const quoteSchema = {
  type: 'object',
  properties: {
    basePrice: { type: 'number' },
    lineItems: {
      type: 'array',
      items: {
        type: 'object',
        properties: { label: { type: 'string' }, amount: { type: ['number', 'null'] } },
        required: ['label', 'amount'],
        additionalProperties: false,
      },
    },
    totalPrice: { type: 'number' },
    binding: { type: 'boolean' },
    negotiated: { type: 'boolean' },
    priceBefore: { type: ['number', 'null'] },
    priceAfter: { type: ['number', 'null'] },
    redFlag: { type: 'boolean' },
    redFlagReason: { type: ['string', 'null'] },
    callOutcome: { type: 'string', enum: ['quoted', 'callback', 'declined'] },
  },
  required: [
    'basePrice', 'lineItems', 'totalPrice', 'binding', 'negotiated',
    'priceBefore', 'priceAfter', 'redFlag', 'redFlagReason', 'callOutcome',
  ],
  additionalProperties: false,
};

export async function extractQuote(transcript: Transcript): Promise<Quote> {
  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: vertical.extractionPrompt(vertical.marketMedian) },
      {
        role: 'user',
        content: transcript.turns.map((t) => `${t.speaker.toUpperCase()}: ${t.text}`).join('\n'),
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'quote_extraction', strict: true, schema: quoteSchema },
    },
  });
  const ex = JSON.parse(res.choices[0].message.content ?? '{}');

  // Deterministic guards: these rules are code, not model judgment.
  // A negotiated price means the final total IS the negotiated price.
  if (ex.negotiated && ex.priceAfter != null) ex.totalPrice = ex.priceAfter;

  const mismatch = itemizationMismatch(ex);
  const threshold = vertical.marketMedian * (1 - vertical.redFlagBelowMedianPct);
  const redFlag = ex.totalPrice > 0 && ex.totalPrice <= threshold;
  return {
    ...ex,
    itemizationMismatch: mismatch,
    quoteId: `q-${transcript.jobId}-${transcript.persona}`,
    providerName: transcript.providerName,
    persona: transcript.persona,
    transcriptRef: transcript.transcriptId,
    redFlag,
    redFlagReason: redFlag
      ? ex.redFlagReason ?? `Total is ≥30% below the $${vertical.marketMedian} market median`
      : null,
  };
}
