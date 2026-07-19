import OpenAI from 'openai';
import { vertical } from '@/config/vertical';
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
  const negotiatorSystem = vertical.negotiatorPrompt(JSON.stringify(spec), best);
  // Deterministic opener: identical job intro on every call, and no first-turn monologues.
  const spokenDate = new Date(`${spec.preferredDate}T00:00:00`).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
  const spokenSize = { studio: 'studio', '1br': 'one-bedroom', '2br': 'two-bedroom', '3br+': 'three-plus-bedroom' }[spec.homeSize];
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
