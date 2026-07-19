import OpenAI from 'openai';
import { vertical } from '@/config/vertical';
import type { JobSpec, Quote, Transcript, TranscriptTurn } from '@/types';

const openai = new OpenAI();
const MODEL = 'gpt-4o';
const MAX_NEGOTIATOR_TURNS = 16; // drip-fed details + dispatcher questions need more back-and-forth

type SellerCfg = (typeof vertical.sellers)[number];

const SPOKEN_SIZE = { studio: 'studio', '1br': 'one-bedroom', '2br': 'two-bedroom', '3br+': 'three-plus-bedroom' } as const;

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
  const negotiatorSystem = vertical.negotiatorPrompt(JSON.stringify(spec), best);
  // Deterministic opener: identical job intro on every call, and no first-turn monologues.
  const spokenDate = new Date(`${spec.preferredDate}T00:00:00`).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
  const spokenSize = SPOKEN_SIZE[spec.homeSize];
  const opener: TranscriptTurn = {
    speaker: 'negotiator',
    text: `Hi, I'm calling to get a quote for a move on ${spokenDate}: a ${spokenSize} from ${spec.origin.city} to ${spec.destination.city}. Could you help me with that?`,
  };
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

// One seller reply for the showcased voice call (the ElevenLabs agent is the negotiator).
export async function showcaseSellerReply(turns: TranscriptTurn[]): Promise<string> {
  const seller = vertical.sellers.find((s) => s.persona === 'tough')!;
  const system = `${seller.systemPrompt}\nThis is the showcased call: at a natural early moment — only once, and only if you have not already asked — ask suspiciously "Wait — am I talking to a robot?" and react naturally to the answer, then continue the negotiation.`;
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
  const context = `${seller.systemPrompt}\nEarlier today you quoted this caller $${quote.totalPrice}${quote.binding ? ' (binding)' : ''} for their move, and you have all the job details on file. They are calling back to accept. Do not ask any questions — happily confirm the booking and that you will email the itemized invoice to the address they give, repeating the address back.`;
  const turns: TranscriptTurn[] = [
    {
      speaker: 'negotiator',
      text: `Hi, I'm calling back about the ${SPOKEN_SIZE[spec.homeSize]} move from ${spec.origin.city} to ${spec.destination.city} we discussed — the booking is for ${spec.customerName || 'my client'}, and we'd like to go ahead with your quote of $${quote.totalPrice.toLocaleString()}. Could you email the itemized invoice to ${email}?`,
    },
  ];
  const sel = await chat(context, turns, 'seller');
  turns.push({ speaker: 'seller', text: (sel.choices[0].message.content ?? '').trim() });
  turns.push({ speaker: 'negotiator', text: 'Perfect, thank you. We look forward to the invoice and to moving day. Goodbye!' });
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
  const threshold = vertical.marketMedian * (1 - vertical.redFlagBelowMedianPct);
  const redFlag = ex.totalPrice > 0 && ex.totalPrice <= threshold;
  return {
    ...ex,
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
