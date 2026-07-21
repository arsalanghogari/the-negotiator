# Submission videos — scripts & shot lists

Recording setup (once): browser at ~1400px wide, deployed site, fresh state (`npm run seed`
or just Run demo — it purges the job's old calls automatically). **Record the demo run
FIRST without narration** — live calls have variable timing — then narrate over the edit.
Speaking pace: these scripts are ~140 words each ≈ 55–58s at a natural pace.

---

## 1 · Demo video (UI/UX, 60s)

| time | on screen | narration |
|---|---|---|
| 0–8 | Landing hero (ink, lime). Cursor hovers the spread figures. | "The same 45-mile move quotes anywhere from $1,158 to $6,506. The only fix is calling five companies and haggling — so nobody does it. Parley is the voice that haggles for you." |
| 8–18 | Click **Run demo** → intake. Chat bubbles fill; form populates itself on the right. | "One click. Parley interviews you like a professional estimator — and the job spec fills itself. Confirm it once; every mover hears the identical job." |
| 18–26 | Calls page: **live Google Places list**, then three transcript cards streaming. | "It pulls the real market live from Google Places, then works the phones: a lowballer, a stonewaller, an upseller — every fee extracted, itemized, compared." |
| 26–42 | **Listen-in call, audio ON.** Cut to the leverage line + concession. Card populates. | "And this call you can hear. [let the audio play: 'I have a binding quote for $X — can you beat it?' … seller concedes] The price just dropped — because Parley had real leverage." |
| 42–54 | Report: ink banner, negotiated strikethrough, ⚑ amber flag, recording player, transcript. | "The ranked report, with receipts: every quote itemized, the suspicious lowball flagged, recordings and transcripts attached, and a recommendation in plain language." |
| 54–60 | Take Action → booking call turns land → "✓ Booked". | "Then Parley calls the winner back and books it. Never overpay again." |

**Edit notes:** the listen-in segment is the money shot — give the audio 8–10 clean seconds
with no narration. If a run produces a mid-call price drop badge ($2,400 → $2,160), freeze
on it for a beat.

---

## 2 · Tech video (60s)

| time | on screen | narration |
|---|---|---|
| 0–8 | Repo tree / architecture sketch: intake → calls → extraction → report. | "Parley is Next.js on Netlify with Supabase — one pipeline: intake, calls, extraction, report. Two model providers doing different jobs." |
| 8–20 | Split: ElevenLabs agent config + a seller persona prompt in `config/moving.ts`. | "The negotiator is an ElevenLabs voice agent with mid-call tools; the market is simulated by GPT-4o seller personas with hidden pricing policies — so negotiations are contingent, never scripted. Calls run sequentially: each binding quote becomes leverage for the next." |
| 20–34 | `lib/quote-rules.ts` + the amber tripwire notice in the UI. | "Everything that matters is deterministic code, not model judgment: strict-JSON quote extraction, a red-flag rule on real market benchmarks, itemization reconciliation — and an honesty tripwire that parses every spoken amount, even in words, and corrects the agent live if it ever cites a quote that doesn't exist." |
| 34–48 | The swap: `config/moving.ts` vs `config/autobody.ts`, then `NEXT_PUBLIC_VERTICAL=autobody npm run dev` → body shops page. | "Verticals are config, not code. Swap one file — same engine now negotiates collision repair: real body shops, repair benchmarks, new personas. Moving is just the beachhead." |
| 48–60 | Live Places badge; `npm run check` output in a terminal. | "Discovery is live Google Places with a baked fallback, and a guardrail audit checks every stored quote against the deterministic rules. Software that can finally pick up the phone — and prove what it heard." |

---

## 3 · Team video (60s)

*(solo build — fill the [brackets] with your details)*

| time | on screen | narration |
|---|---|---|
| 0–10 | You, on camera. | "Hi, I'm Arsalan — I built Parley solo for the ElevenLabs challenge. [One line about you: background / what you work on.]" |
| 10–25 | B-roll: commit log scrolling, BUILD_LOG.md. | "One person, every role: product, conversation design, the voice pipeline, the deterministic guardrails, the brand. The commit history is the story — every fix in there came from catching the agent doing something a real customer would fire it for." |
| 25–45 | The listen-in call playing muted behind you. | "The thing I cared most about was honesty under pressure. A negotiator that bluffs wins a demo and loses the market — so Parley's leverage is enforced by code: it can only cite quotes that exist, and when a seller won't price the job, the report says so instead of pretending." |
| 45–60 | Landing page. | "Phone-priced markets are a $20B blind spot — moving, auto body, contractors, medical bills. Parley is how software finally picks up the phone. Thanks for watching." |

---

**Pre-flight checklist before recording the demo run**
- [ ] Deployed site, mic permission granted, sound on
- [ ] Run demo once as a warm-up (variance check), then record the second run
- [ ] Listen-in: confirm the leverage number matches the Golden Gate card
- [ ] Report: recording player has audio; booking call with 🔊 Listen on
