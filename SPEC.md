# BUILD SPEC — "The Negotiator" (HackNation #6, ElevenLabs Challenge)

## 0. MISSION

Build a **working end-to-end voice-AI agent that shops and negotiates prices by phone** for a
single vertical (**moving**). The system: (1) runs a voice intake to build one structured job
spec, (2) "calls" multiple sellers and extracts itemized, comparable quotes, (3) negotiates
using competing bids as leverage so a price actually moves, and (4) returns a ranked,
evidence-backed recommendation with transcripts.

**The single most important outcome:** a demonstrable moment where a seller's quoted price
drops *during a call* because the agent cited a competing bid. Every decision serves that
moment and the closed loop around it.

This is a solo hackathon build with a hard deadline. **Optimize for a reliable, polished,
end-to-end demo over feature completeness.** A working thin slice beats a broad half-built system.

## 1. HARD CONSTRAINTS & NON-GOALS

**Constraints**
- Time-boxed. Ship incrementally; the app must be runnable and deployable after every milestone.
- Solo maintainer. Favor simple, well-known patterns over clever abstractions.
- The demo must be reproducible on command (seeded data + a "Run demo" path), not dependent on
  live external phone calls.

**Non-goals (do NOT build these unless explicitly told later)**
- Real telephony (Twilio/SIP) for the core loop. Provide a clean seam for it but keep it OFF by default.
- User auth, accounts, multi-tenant, payments.
- Multiple verticals. Build **moving only**, but keep vertical-specific values (job-spec fields,
  price benchmarks, red-flag rules, seller personas) in a single `config/vertical.ts` so it's
  obvious the system generalizes by swapping config.
- Batch/parallel calling at scale. Sequential is fine; mention where parallelism would go.
- Mobile-first responsiveness. Desktop demo is the target.

## 2. TECH STACK (locked — do not re-litigate)

- **Framework:** Next.js (App Router) + TypeScript.
- **Styling/UI:** Tailwind CSS + shadcn/ui. Clean, modern, high-contrast. This UI is a judged
  differentiator — it must look finished.
- **Voice:** ElevenLabs Agents (Conversational AI). Use the official ElevenLabs JS/React SDK for
  browser voice sessions. **Check the current ElevenLabs docs for exact SDK names/usage before
  coding the integration — do not guess API shapes.**
- **LLM:** OpenAI `gpt-4o` via the official `openai` SDK. Use **structured outputs**
  (`response_format` with a JSON schema) for all extraction so results always match our types.
- **Persistence:** Supabase (Postgres) if `SUPABASE_URL` / `SUPABASE_ANON_KEY` are present; otherwise
  fall back to a local JSON store (`/.data/*.json`) so the app runs with zero external DB setup.
  Abstract this behind a `store` module so swapping is trivial.
- **Deploy:** Vercel. Deploy a hello-world in Milestone 0 and after each milestone.

**Env vars** (create `.env.example` and read from `process.env`):

```
OPENAI_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_ID_INTAKE=
ELEVENLABS_AGENT_ID_NEGOTIATOR=
SUPABASE_URL=            # optional
SUPABASE_ANON_KEY=       # optional
DEMO_MODE=true           # when true, sellers are simulated (no human/phone needed)
```

## 3. ARCHITECTURE & DATA FLOW

```
Intake (voice OR doc)  ─→  JobSpec (confirmed by user)
                                 │
                                 ▼
        For each seller persona:  Call session
        negotiator agent  ←──→  seller (simulated persona | human mic | [Twilio later])
                                 │  transcript
                                 ▼
              OpenAI extraction ─→ Quote (itemized, red-flag, negotiated?)
                                 │
                                 ▼
        All quotes ─→ OpenAI ranking ─→ Report (ranked, cited, plain-language)
```

**Counterparty strategy (important for a reliable build):**
- Default (`DEMO_MODE=true`): **simulated sellers.** Each persona is an OpenAI-driven agent with a
  fixed strategy (below). The negotiator talks to them agent-to-agent. For the showcased call, drive
  it through ElevenLabs voice so it's audibly a real conversation; the others can run
  voice-or-text. This makes the full loop runnable and testable without a human.
- Optional (`DEMO_MODE=false`): **human-in-the-loop** — a human answers via mic as each persona.
- Later/stretch: real outbound call via Twilio (leave a `caller` interface seam; don't implement now).

Implement sellers behind a `Counterparty` interface with a `simulated` implementation now, so
`human` and `twilio` can slot in later without touching the negotiator.

## 4. DATA MODELS (create in `types.ts`)

```ts
type HomeSize = 'studio' | '1br' | '2br' | '3br+';
type Persona = 'tough' | 'lowballer' | 'upseller';
type CallOutcome = 'quoted' | 'callback' | 'declined';

interface JobSpec {
  jobId: string;
  vertical: 'moving';
  origin: { city: string; zip: string; floor: number; hasElevator: boolean };
  destination: { city: string; zip: string; floor: number; hasElevator: boolean };
  distanceMiles: number;
  homeSize: HomeSize;
  largeItems: string[];          // e.g. ["piano","sofa","fridge"]
  boxCountEst: number;
  stairsFlights: number;
  longCarry: boolean;
  packingService: boolean;
  preferredDate: string;         // YYYY-MM-DD
  specialNotes: string;
  confirmedByUser: boolean;
}

interface LineItem { label: string; amount: number | null }

interface Quote {
  quoteId: string;
  providerName: string;
  persona: Persona;
  basePrice: number;
  lineItems: LineItem[];
  totalPrice: number;
  binding: boolean;
  redFlag: boolean;              // true if totalPrice >= 30% below market median
  redFlagReason: string | null;
  negotiated: boolean;           // true if price moved during the call
  priceBefore: number | null;
  priceAfter: number | null;
  transcriptRef: string;         // id into stored transcript
  callOutcome: CallOutcome;
}

interface Report {
  jobId: string;
  ranked: Quote[];               // sorted by true total cost
  recommendedQuoteId: string;
  rationale: string;             // plain-language, cites fees + transcript moments
  redFlags: string[];
}
```

**Market anchor (moving, in `config/vertical.ts`):** real range for a 45-mi 2BR move is
$1,158–$6,506; use median **$2,400**. Red-flag any total **≥30% below** median (< ~$1,680).

## 5. MODULES & ACCEPTANCE CRITERIA

### Module 1 — Estimator (intake → one JobSpec)

Two paths, same output:
- **Voice interview:** an ElevenLabs intake agent asks estimator questions one at a time, reads the
  spec back, and the user confirms. On confirm, persist the `JobSpec`.
- **Document intake:** user uploads an existing quote (PDF/image) or room photos; gpt-4o vision
  extracts into the **same** `JobSpec` schema (missing fields = null, never guessed).
- A confirm/edit UI lets the user correct any field before `confirmedByUser = true`.

✅ Done when: both paths produce a valid `JobSpec`, the user can edit+confirm, and it's persisted.

### Module 2 — Caller (JobSpec → 3 Quotes)

- For each of 3 personas, run a call session where the negotiator describes the job **identically**
  from the confirmed spec, handles friction, and drives to an itemized quote.
- Store the full transcript; extract a structured `Quote` from it (Module 3 prompt).
- Show the call happening in the UI (live/streamed transcript) and the quote landing in a table.

✅ Done when: 3 calls run against 3 distinct personas and produce 3 itemized `Quote`s with transcripts.

### Module 3 — Closer (Quotes → negotiation + Report)

- During at least one call, the negotiator cites the current best competing quote and the seller's
  price **measurably changes** (`negotiated=true`, `priceBefore/After` set).
- Apply the red-flag rule to every quote.
- Generate the `Report`: rank by true total cost, recommend one, explain in plain language citing
  specific fees and transcript moments, and list red flags.
- Report UI is the showcase screen: ranked cards, itemized fee breakdowns, the negotiated delta
  highlighted, transcript links, and the recommendation up top.

✅ Done when: the report ranks all quotes, at least one shows a real negotiated price drop, red flags
are surfaced, and the rationale cites evidence.

## 6. INTEGRATION NOTES

**ElevenLabs Agents**
- Create agents in the ElevenLabs dashboard; reference them by ID via env vars. Two agents minimum:
  `INTAKE` and `NEGOTIATOR`. (Personas can be OpenAI-driven counterparties, not separate EL agents.)
- Give the negotiator agent **tools** (function calling) it can invoke mid-call:
  `getBestCompetingQuote()` and `logQuote(Quote)`. Wire these to backend routes.
- Use low-latency conversational settings; the agent must disclose it's an AI when asked and never
  invent a competing bid. Put these rules in the agent's system prompt (Section 7).
- **Verify current SDK/usage against ElevenLabs docs before writing the client — do not assume method
  names.** If browser voice is fiddly, ship a text-driven negotiation for non-showcase personas and
  reserve ElevenLabs voice for the one showcased call.

**OpenAI**
- Use `gpt-4o` with structured outputs (JSON schema) for: document→JobSpec, transcript→Quote, and
  the ranking→Report. Never accept free-text where a typed object is expected.
- Simulated seller personas are also gpt-4o calls with the persona system prompts (Section 7),
  constrained to their pricing strategy.

## 7. PROMPTS (use verbatim; tune as needed)

**Intake agent (ElevenLabs system prompt):**

```
You are a professional moving estimator running a short voice intake. Ask ONE question at a time,
conversationally. Cover origin and destination (city/zip, floor, elevator), distance, home size,
large or special items, rough box count, stairs, long carry, packing needs, and preferred date.
If an answer is vague, ask a quick follow-up. Never give a price. When complete, read the spec back
in plain language, ask the customer to confirm or correct, then call save_job_spec with the JSON.
Be warm and efficient.
```

**Negotiator agent (ElevenLabs system prompt):**

```
You call moving companies on behalf of a customer to get an itemized quote and negotiate the best
price. If asked whether you are an AI, disclose it plainly and continue. Describe the job using ONLY
the confirmed job spec provided, identically on every call. Push for an itemized quote: base price
plus each fee (stairs, long carry, packing, materials). If they refuse to quote, try once for a range,
then log the outcome. Once you have a number, negotiate: call get_best_competing_quote and, if you
hold a lower binding quote, say "I have a binding quote for $X, can you beat it?"; question suspicious
fees; ask for price matching or extras. NEVER invent a competing bid, fake inventory, or misrepresent
the job. End every call with a structured outcome, then call log_quote before hanging up.
```

**Seller personas (OpenAI system prompts, one per persona):**

```
TOUGH: Fair but firm mover. Open near $2,400. Itemize fees when pushed. Concede ~10–15% only when the
caller cites a genuine lower binding quote. Never volunteer discounts.

LOWBALLER: Quote a low base (~$1,500) to win, then reveal stairs, long-carry, and materials fees that
bring the true total to ~$2,600. Resist itemizing until pressed. (This is the red-flag demo.)

UPSELLER: Open ~$2,300 but push premium packing, insurance, and "priority crew" add-ons. Drop the
add-ons and ~$300 if the caller firmly declines extras and mentions a competing quote.
```

All personas: stay in character, disclose real (fictional) numbers only, never break the negotiation.

**Document → JobSpec (gpt-4o vision):**

```
Extract a moving job spec from this document (existing quote, bill, or room photos). Populate only
JobSpec fields. For anything not present, use null — never guess. Return JSON matching the JobSpec schema.
```

**Transcript → Quote (gpt-4o structured output):**

```
Convert this call transcript into a structured Quote. Extract base price and every fee as separate
labeled line items; compute totalPrice. binding=true only if explicitly stated. If the price changed
during the call, set negotiated=true and fill priceBefore/priceAfter. If totalPrice is >= 30% below the
$2,400 market median, set redFlag=true with a reason. Set callOutcome to quoted|callback|declined.
Never invent numbers; a mentioned fee with no amount = null. Return JSON matching the Quote schema.
```

**Ranking → Report (gpt-4o):**

```
You are advising a customer choosing a mover. Given the confirmed job spec and all structured quotes
with transcripts, rank by TRUE total cost (not headline price), recommend one, and explain in plain
language why — citing specific fees and transcript moments. Flag any too-cheap (red-flag) quotes and
why they're risky. Note where a price was negotiated down. Be concrete and honest. Return a Report.
```

## 8. UI / SCREENS

1. **Landing / Start** — one line on the problem ("same move, $1,158–$6,506"), a "Start intake" CTA.
2. **Intake** — voice-interview panel (mic + live transcript) and a document-upload alternative;
   then a **confirm/edit spec** card.
3. **Calls** — a row per seller: status, live/streamed transcript, and the extracted quote appearing
   with itemized fees. A visible marker when a price changes mid-call.
4. **Report (showcase)** — recommendation banner up top; ranked quote cards with fee breakdowns;
   the negotiated delta highlighted (was → now); red-flag badges; transcript links; plain-language
   rationale. This screen must look polished.
   Design: clean, modern, generous spacing, high contrast, one accent color, real numbers everywhere.

## 9. THE 7 SUCCESS CRITERIA (build the whole thing to pass these)

1. Closed loop: intake → calls → negotiation → ranked recommendation with transcript evidence.
2. One JobSpec from a voice interview AND at least one document type, confirmed by the user, reused
   verbatim across every call.
3. Calls against ≥3 distinct negotiation styles; every quote structured and itemized.
4. ≥1 negotiation where the price/terms measurably change because of leverage the agent gathered.
5. AI disclosure + honesty hold: discloses it's AI when asked, never invents a bid, handles friction.
6. Every call ends in a structured outcome (quoted | callback | declined).
7. The report ranks all quotes, cites transcripts, and explains the pick in plain language.

## 10. MILESTONES (deploy after each; keep it runnable)

- **M0 (setup):** Next.js + TS + Tailwind + shadcn scaffold; `.env.example`; `store` abstraction;
  `config/vertical.ts`; deploy hello-world to Vercel. Verify OpenAI + ElevenLabs keys with a ping route.
- **M1 (spec spine):** `types.ts`; store read/write for JobSpec/Quote/Report; a seed script with a
  demo JobSpec and 3 seeded transcripts so later stages can be built/tested without live voice.
- **M2 (intake):** document→JobSpec (vision) + confirm/edit UI. Then wire the ElevenLabs voice intake
  agent to produce the same JobSpec. Persist on confirm.
- **M3 (calls, simulated):** 3 seller persona agents + negotiator loop in `DEMO_MODE`, producing 3
  transcripts → 3 Quotes via extraction. Calls screen renders live.
- **M4 (negotiation + red flags):** make at least one call show a real price drop from leverage; apply
  red-flag rule; store priceBefore/After.
- **M5 (report):** ranking→Report + the showcase Report UI.
- **M6 (voice on the showcase call):** route the one showcased negotiation through ElevenLabs voice so
  it's audibly real. Add the "are you a robot?" disclosure beat.
- **M7 (polish + demo):** honesty/guardrail checks, empty/error states, seed the exact demo, a "Run
  demo" button that plays the full loop reliably. Write a short README.

Stop and confirm with the user before: adding real Twilio, adding auth, or any dependency not in Section 2.

## 11. WORKING AGREEMENT (how to build)

- Work milestone by milestone. After each: ensure the app builds, runs (`npm run dev`), and deploys.
  Commit with a clear message per milestone.
- Keep everything typed to `types.ts`. All model output goes through structured outputs — no unparsed
  free text into typed objects.
- Prefer the simplest thing that satisfies the acceptance criteria. Do not add abstractions,
  libraries, or config beyond Section 2 without asking.
- When integrating an external SDK (ElevenLabs especially), **read the current official docs first**
  and verify method names; do not invent APIs. If blocked on live voice, degrade gracefully to text
  for non-showcase paths and keep the loop closed.
- Always keep a working `DEMO_MODE=true` path that runs the entire loop with zero human/phone input,
  so the demo is reproducible.
- If a choice is ambiguous, make the reasonable call that best serves the "price drops on a call"
  moment and the polish of the Report screen, and note the assumption in a comment.

## 12. DEFINITION OF DONE

`DEMO_MODE=true`, click "Run demo": the app runs intake → 3 calls → a visible negotiated price drop →
a polished ranked report with itemized fees, red-flag badges, and a plain-language recommendation, with
the showcased call in real ElevenLabs voice and the agent disclosing it's an AI when asked. Deployed and
reproducible. That is a winning submission.
