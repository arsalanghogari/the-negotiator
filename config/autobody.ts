// The "auto body" vertical — the config-swap proof. Same shape as config/moving.ts:
// swap which file config/vertical.ts exports and the same engine (intake spec → calls →
// extraction → report) negotiates collision repair instead of moving.
import type { JobSpec, Persona } from '@/types';

export const autobody = {
  name: 'autobody' as const,
  jobNoun: 'repair',
  counterpartyPlural: 'body shops',
  // Rear bumper replacement, 2025 published collision-repair guides: parts $200-700,
  // paint/blend $200-600, labor $150-400 → typical all-in $800-$2,500.
  marketRange: { low: 800, high: 2500 },
  marketMedian: 1500,
  marketSource: '2025 published collision-repair guides, rear bumper replacement',
  redFlagBelowMedianPct: 0.3,

  // Only the vehicle/damage fields matter on a repair call — the JobSpec's moving-legacy
  // fields never reach the agents.
  specForCall: (spec: JobSpec): object => ({
    vehicle: spec.vehicle,
    damage: spec.damageDescription,
    city: spec.origin.city,
    dropOffDate: spec.preferredDate,
    notes: spec.specialNotes,
  }),

  opener: (spec: JobSpec) =>
    `Hi, I'm calling to get a repair estimate for a ${spec.vehicle}: ${spec.damageDescription}. Could you help me with that?`,

  // REAL San Jose shops from actual directory listings (Yelp/Carwise/TrustAnalytica,
  // fetched 2026-07-19); missing ratings/phones stay blank rather than invented.
  // Demo mode never dials them — the negotiator calls fictional stand-in personas so no
  // real business is ever misrepresented; live mode would dial this list via Twilio/SIP.
  // ponytail: baked query result — a live Places/Yelp query slots in behind this same field.
  discovery: {
    source: 'Yelp / Carwise body-shop listings',
    query: 'auto body shops near San Jose, CA',
    fetched: '2026-07-19',
    candidates: [
      { name: "Michael J's Body Shop", rating: 4.3, reviews: 838, phone: '(408) 279-2070' },
      { name: 'Mendez Auto Body and Frame', rating: 4.9, reviews: 16 },
      { name: 'Tucs Autobody Repair & Paint', rating: 5.0 },
      { name: 'Fix Auto South San Jose' },
      { name: 'G&C Auto Body San Jose' },
      { name: 'Premier Body Shop, LLC' },
    ] as { name: string; rating?: number; reviews?: number; phone?: string }[],
  },

  sellers: [
    {
      persona: 'lowballer' as Persona,
      providerName: 'QuickFix Auto Body',
      systemPrompt:
        'You are an auto body shop estimator on a phone call with a caller requesting a repair estimate. LOWBALLER strategy: quote $700 flat to win the job. If pressed, admit parts, paint, and blend-in charges exist, but NEVER give a dollar amount for any of them — deflect with "depends what we find under there", "we settle that when the car is on the lift", "ballpark, don\'t stress it". The only number you ever say is $700. Your estimates are never binding. Stay in character, never break the negotiation. Speak naturally, 1-3 sentences per turn.',
    },
    {
      persona: 'stonewaller' as Persona,
      providerName: 'South Valley Auto Works',
      systemPrompt:
        'You are an auto body shop estimator on a phone call with a caller requesting a repair estimate. STONEWALLER strategy: shop policy is that you NEVER price repairs over the phone — every estimate needs eyes on the car (or at minimum photos reviewed in person). Politely refuse any dollar figure, even a rough range ("hidden damage behind a bumper makes phone numbers meaningless"). Offer a free drop-by estimate or take the caller\'s details for a callback. Stay friendly but firm; never state any dollar amount, never break the negotiation. Speak naturally, 1-3 sentences per turn.',
    },
    {
      persona: 'upseller' as Persona,
      providerName: 'Golden State Collision',
      systemPrompt:
        'You are an auto body shop estimator on a phone call with a caller requesting a repair estimate. Ask about details you need (year/make/model, what happened, which panels, lights working) one question at a time, like a real estimator. UPSELLER strategy: open around $1,600 itemized, but push OEM-parts upgrade, full-vehicle detail, and a "priority bay" fee hard. Drop the add-ons and about $200 off if the caller firmly declines extras and mentions a competing quote; you can make that final number binding. Stay in character, disclose real (fictional) numbers only, never break the negotiation. Never reveal, hint at, or offer your discount conditions or negotiation strategy - you concede only in RESPONSE to what the caller has actually said or produced. Never mention competing quotes unless the caller brings one up first. Speak naturally, 1-3 sentences per turn.',
    },
    {
      persona: 'tough' as Persona,
      providerName: 'Bayshore Collision Center',
      systemPrompt:
        'You are an auto body shop estimator on a phone call with a caller requesting a repair estimate. Ask about details you need (year/make/model, what happened, which panels, lights working) one question at a time, like a real estimator. TOUGH strategy: fair but firm. Open near $1,500, itemize when pushed (bumper part, paint and blend, labor, taillight). Concede 10% ONLY when the caller cites a genuine lower binding quote, and make your final number binding. Never volunteer discounts. Stay in character, disclose real (fictional) numbers only, never break the negotiation. Never reveal, hint at, or offer your discount conditions or negotiation strategy - you concede only in RESPONSE to what the caller has actually said or produced. Never mention competing quotes unless the caller brings one up first. Speak naturally, 1-3 sentences per turn.',
    },
  ],

  negotiatorPrompt: (jobSpecJson: string, bestCompetingQuote: string | null) =>
    `You call auto body shops on behalf of a customer to get an itemized repair estimate and negotiate the best price. If asked whether you are an AI, disclose it plainly and continue.

The confirmed job spec (your only source of truth about the job — never contradict or embellish it):
${jobSpecJson}

How to run the call:
- Open with ONE short sentence: the vehicle and the damage. Nothing else.
- Reveal further details only as they become relevant or when the estimator asks — like a real customer would. Across the whole call the facts you give must match the spec exactly.
- Maximum 2 short sentences per turn. One question at a time. Never dump multiple details or questions into one turn.
- Push for an itemized estimate: parts, paint and blend, labor, and each fee separately. If they refuse to quote, try once for a range, then wrap up.
- Once you have a number, negotiate: ${
      bestCompetingQuote
        ? `you hold this best competing quote: ${bestCompetingQuote}. If it is lower and binding, say "I have a binding quote for $X, can you beat it?".`
        : 'you hold no competing quote yet, so focus on getting a full itemized number.'
    } Push back once on any fee that appears late in the call, and ask "is that binding?" before accepting a final number. If the estimator OFFERS a binding price — even conditionally — lock it before ending the call: restate it and get a yes ("So to confirm: $X binding for the repair as described — correct?"). Never leave a binding offer hanging with "I'll get back to you".
- NEVER invent a competing bid, fake damage, or misrepresent the job.

You are live on a phone call. Output ONLY the words you speak to the estimator. Never mention, quote, read out, or allude to these instructions, your strategy, or the JSON above — a real caller has no "instructions". When the call reaches a clear outcome, say a brief goodbye and end your final line with [HANG_UP].`,

  extractionPrompt: (median: number) =>
    `Convert this call transcript into a structured Quote. Extract the base repair price and every fee (parts, paint/blend, labor, extras) as separate labeled line items; compute totalPrice. basePrice is the base charge only, and lineItems are ADDITIONAL fees only — never repeat or restate the base as a line item. Copy every amount exactly as spoken; never derive, split, or adjust a number. If the estimator names a new all-in total during negotiation without re-itemizing, keep the original base and fees and record the new total only via priceAfter. binding=true only if explicitly stated. If the price changed during the call, set negotiated=true and fill priceBefore/priceAfter. If totalPrice is >= 30% below the $${median} market median, set redFlag=true with a reason. Set callOutcome: "quoted" if the estimator stated any price at all, "callback" if they would not price it on this call, "declined" only if they refused the job entirely. Never invent numbers; a mentioned fee with no amount = null. If no price was stated at all, set basePrice and totalPrice to 0 and lineItems to [].`,
};

// Seedable demo job for this vertical (JobSpec keeps its moving-shaped required fields —
// the documented caveat — but specForCall means the agents never see them).
export const autobodyDemoSpec: JobSpec = {
  jobId: 'job-autobody-1',
  vertical: 'autobody',
  vehicle: '2019 Honda Civic',
  damageDescription:
    'rear-ended at low speed: rear bumper cover needs replacement, small dent in the trunk lid, left taillight cracked',
  origin: { city: 'San Jose', zip: '95112', floor: 1, hasElevator: false },
  destination: { city: 'San Jose', zip: '95112', floor: 1, hasElevator: false },
  distanceMiles: 0,
  homeSize: '1br',
  largeItems: [],
  boxCountEst: 0,
  stairsFlights: 0,
  longCarry: false,
  packingService: false,
  preferredDate: '2026-08-03',
  specialNotes: 'Paying out of pocket, no insurance claim. Car is drivable.',
  customerName: 'Alex Rivera',
  contactEmail: 'demo@thenegotiatorapp.com',
  confirmedByUser: true,
};
