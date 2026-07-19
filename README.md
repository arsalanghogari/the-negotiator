# The Negotiator

A voice-AI agent that shops and negotiates moving quotes by phone. Built solo for HackNation #6 (ElevenLabs Challenge).

The same 2BR move costs anywhere from **$1,158 to $6,506** (moveBuddha real-quote data). The Negotiator runs a voice intake to build one structured job spec, calls four movers with distinct negotiation styles — including one who refuses to quote over the phone, logged as a documented callback rather than a vague range — extracts itemized comparable quotes, uses competing bids as leverage so a price actually drops **during a call**, and delivers a ranked, evidence-backed recommendation with transcripts and the showcase-call recording — then calls the winner back to book and request the invoice.

## Quickstart

```bash
npm install
cp .env.example .env   # fill in the keys below
npm run seed           # demo job spec + fixture transcripts
npm run dev            # http://localhost:3000
```

Click **▶ Run demo** on the landing page: intake → 4 live negotiation calls (watch the transcripts stream) → ranked report, one click.

**Env vars** (`.env`): `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID_INTAKE`, `ELEVENLABS_AGENT_ID_NEGOTIATOR`, optional `SUPABASE_URL`/`SUPABASE_ANON_KEY`, `DEMO_MODE=true`. Verify keys at `/api/ping`.

## How it works

```
Intake (ElevenLabs voice interview OR document upload → gpt-4o vision)
   → JobSpec (confirmed by user, reused verbatim on every call)
   → Call list: real San Jose movers from an actual moveBuddha directory query
     (demo role-plays fictional stand-ins; live mode would dial these via Twilio/SIP)
   → Calls: negotiator ↔ 4 simulated seller personas
     (lowballer / stonewaller / upseller / tough)
       · sequential, so earlier binding quotes arm later calls with leverage
       · listen-in call is fully audible — negotiator over live ElevenLabs voice,
         seller replies spoken via TTS in sequence — with mid-call tools
         (get_best_competing_quote, log_quote) and the "are you a robot?" disclosure
   → Quotes: every transcript → structured, itemized Quote (strict JSON schema)
   → Report: ranked cards, negotiated deltas, red-flag badges, cited rationale,
     benchmark provenance, and the showcase-call audio recording
   → Take action: calls the winner back, books under the customer's name,
     requests the itemized invoice by email
```

- **Screens:** `/` landing · `/intake` · `/calls` (incl. the voice showcase call) · `/report`
- **Honesty guardrails:** the agent discloses it's an AI when asked, never invents a competing bid (citation discipline: only the exact tool-returned amount, at most once), and every call ends in a structured outcome. `npm run check` verifies the stored data against the deterministic rules.
- **Deterministic over model judgment:** red-flag rule (≥30% below the $2,400 market median — moveBuddha data, per FMCSA lowball guidance), negotiated-total override, and ranking are code; the model handles conversation and extraction only.
- **Graceful failure is a feature:** the stonewaller call ends with no number — the report records a callback commitment instead of pretending, and that call can never be recommended or booked.

## Design notes

- **Vertical is config, not code.** Everything moving-specific — job-spec fields aside, all benchmarks, red-flag rules, personas, provider names, and prompts — lives in [`config/vertical.ts`](config/vertical.ts). Switching to auto body shops means swapping that file (plus the `JobSpec` type), not rewriting agents.
- **Counterparty seam.** Sellers are OpenAI-driven personas today (`DEMO_MODE=true`, fully reproducible with zero phone/human input). The negotiator logic doesn't know or care — a human-mic or Twilio counterparty can slot in behind the same interface.
- **Persistence seam.** Local JSON store (`.data/`) behind `lib/store.ts`; Supabase swaps in via env vars without touching callers.
- Sequential calls are deliberate (leverage chain); parallelism would go in `/api/calls/run`.

## Scripts

| command | what |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run seed` | demo JobSpec + 4 fixture transcripts |
| `npm run check` | guardrail audit of stored quotes/transcripts |
