'use client';

import { useRef, useState } from 'react';
import { ConversationProvider, useConversation } from '@elevenlabs/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { vertical } from '@/config/vertical';
import type { Persona, Quote, TranscriptTurn } from '@/types';

const SELLERS = vertical.sellers.map((s) => ({ persona: s.persona, name: s.providerName }));

type CallState = {
  status: 'idle' | 'calling' | 'extracting' | 'done';
  turns: TranscriptTurn[];
  quote: Quote | null;
};

const idle = (): CallState => ({ status: 'idle', turns: [], quote: null });

// The showcased call: the ElevenLabs negotiator agent speaks out loud; the simulated
// "tough" seller replies are generated server-side and fed in as text.
function ShowcaseCall() {
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [phase, setPhase] = useState<'idle' | 'live' | 'saving' | 'done'>('idle');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState('');
  const turnsRef = useRef<TranscriptTurn[]>([]);
  // The gate: closed from the moment a negotiator message arrives until its audio has
  // started AND finished. "Finished" can't be the first silence — the SDK's mode signal
  // is a voice-activity detector that flickers during pauses inside a sentence — so the
  // gate opens only after SILENCE_MS of continuous silence.
  const SILENCE_MS = 1500;
  const speakingRef = useRef(false);
  const awaitingSpeechRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingReplyRef = useRef<string | null>(null);
  const push = (t: TranscriptTurn) => {
    turnsRef.current = [...turnsRef.current, t];
    setTurns(turnsRef.current);
  };

  function gateOpen() {
    return !speakingRef.current && !awaitingSpeechRef.current;
  }

  function flushReply() {
    const text = pendingReplyRef.current;
    if (!text || !gateOpen()) return;
    pendingReplyRef.current = null;
    if (turnsRef.current.length === 0) return; // call was ended/reset meanwhile
    push({ speaker: 'seller', text });
    conversation.sendUserMessage(text); // the silence window already provides the natural beat
  }

  const conversation = useConversation({
    micMuted: true, // no human on this call; the seller feeds in as text
    clientTools: {
      get_best_competing_quote: async () => JSON.stringify(await (await fetch('/api/best-quote')).json()),
      log_quote: (p: { quote_json: string }) => {
        void p; // the authoritative Quote comes from transcript extraction on save
        pendingReplyRef.current = null; // no reply after the goodbye
        setTimeout(finish, 6000); // let the goodbye line play out
        return 'logged';
      },
    },
    onModeChange: ({ mode }: { mode: string }) => {
      if (mode === 'speaking') {
        speakingRef.current = true;
        awaitingSpeechRef.current = false; // speech started — half the cycle done
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current); // a flicker, not the end of the turn
          silenceTimerRef.current = null;
        }
      } else if (speakingRef.current && !silenceTimerRef.current) {
        silenceTimerRef.current = setTimeout(() => {
          silenceTimerRef.current = null;
          speakingRef.current = false; // sustained silence — the turn is really over
          flushReply();
        }, SILENCE_MS);
      }
    },
    onMessage: async ({ source, message }: { source: string; message: string }) => {
      if (source !== 'ai' || !message) return;
      // Close the gate until this turn's audio has played (unless it's already playing).
      if (!speakingRef.current) {
        awaitingSpeechRef.current = true;
        // Failsafe: if no audio ever starts (shouldn't happen), don't deadlock the call.
        setTimeout(() => {
          if (awaitingSpeechRef.current) {
            awaitingSpeechRef.current = false;
            flushReply();
          }
        }, 8000);
      }
      push({ speaker: 'negotiator', text: message });
      try {
        const res = await fetch('/api/seller-reply', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ turns: turnsRef.current }),
        });
        const { text } = await res.json();
        pendingReplyRef.current = text;
        flushReply(); // no-op unless the gate is already open
      } catch (e) {
        setError(String(e));
      }
    },
    onError: (e: unknown) => setError(String(e)),
  });

  async function start() {
    setError('');
    setQuote(null);
    turnsRef.current = [];
    setTurns([]);
    try {
      // Mic is muted for this call anyway (seller feeds in as text) — don't block on denial.
      await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {});
      const res = await fetch('/api/voice-token?agent=negotiator');
      const { token, error } = await res.json();
      if (!res.ok) throw new Error(error);
      await conversation.startSession({ conversationToken: token });
      const spec = (await (await fetch('/api/jobspec')).json()).at(-1);
      conversation.sendContextualUpdate(
        `Confirmed job spec for this call (your only source of truth): ${JSON.stringify(spec)}. You are calling the mover "Bay Area Van Lines".`
      );
      setPhase('live');
    } catch (e) {
      setError(String(e));
    }
  }

  async function finish() {
    if (turnsRef.current.length < 2) return;
    setPhase('saving');
    try {
      conversation.endSession();
      const res = await fetch('/api/showcase-complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ turns: turnsRef.current }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setQuote(j.quote);
      setPhase('done');
    } catch (e) {
      setError(String(e));
      setPhase('idle');
    }
  }

  return (
    <Card className="border-indigo-600">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>Showcase call — Bay Area Van Lines, live ElevenLabs voice 🔊</span>
          <span className="flex items-center gap-2">
            {phase === 'live' && (
              <Badge variant="secondary">{conversation.isSpeaking ? 'negotiator speaking…' : 'on call'}</Badge>
            )}
            <Button
              size="sm"
              variant={phase === 'live' ? 'destructive' : 'default'}
              onClick={phase === 'live' ? finish : start}
              disabled={phase === 'saving'}
            >
              {phase === 'live' ? 'End & save' : phase === 'saving' ? 'Saving…' : 'Start voice call'}
            </Button>
          </span>
        </CardTitle>
      </CardHeader>
      {(turns.length > 0 || error) && (
        <CardContent className="space-y-3">
          {error && <p className="text-sm text-red-500">{error}</p>}
          {turns.length > 0 && (
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-3 text-sm">
              {turns.map((t, i) => (
                <p key={i}>
                  <span className={t.speaker === 'negotiator' ? 'font-semibold text-indigo-600' : 'font-semibold'}>
                    {t.speaker === 'negotiator' ? '🔊 Negotiator' : 'Seller'}:
                  </span>{' '}
                  {t.text}
                </p>
              ))}
            </div>
          )}
          {quote && (
            <p className="text-sm font-medium">
              Saved: ${quote.totalPrice.toLocaleString()} {quote.binding && '(binding)'}
              {quote.negotiated && quote.priceBefore != null &&
                ` — negotiated ${quote.priceBefore.toLocaleString()} → ${quote.priceAfter?.toLocaleString()}`}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function CallsPage() {
  const [calls, setCalls] = useState<Record<Persona, CallState>>({
    lowballer: idle(), upseller: idle(), tough: idle(),
  });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const scrollRefs = useRef<Partial<Record<Persona, HTMLDivElement | null>>>({});

  async function run() {
    setRunning(true);
    setError('');
    setCalls({ lowballer: idle(), upseller: idle(), tough: idle() });
    try {
      const res = await fetch('/api/calls/run', { method: 'POST' });
      if (!res.ok || !res.body) throw new Error((await res.text()) || `HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines.filter(Boolean)) {
          const ev = JSON.parse(line);
          if (ev.type === 'error') throw new Error(ev.message);
          if (!ev.persona) continue;
          setCalls((c) => {
            const cur = c[ev.persona as Persona];
            const next: CallState =
              ev.type === 'turn'
                ? { ...cur, turns: [...cur.turns, { speaker: ev.speaker, text: ev.text }] }
                : ev.type === 'quote'
                  ? { ...cur, quote: ev.quote, status: 'done' }
                  : { ...cur, status: ev.status };
            return { ...c, [ev.persona]: next };
          });
          const el = scrollRefs.current[ev.persona as Persona];
          if (el) requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight }));
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Calls</h1>
        <Button onClick={run} disabled={running}>{running ? 'Calling…' : 'Run 3 calls'}</Button>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}

      <ConversationProvider>
        <ShowcaseCall />
      </ConversationProvider>

      <div className="grid grid-cols-3 gap-4">
        {SELLERS.map(({ persona, name }) => {
          const c = calls[persona];
          return (
            <Card key={persona}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  {name}
                  <Badge variant={c.status === 'done' ? 'default' : 'secondary'}>
                    {c.status === 'calling' ? 'on call' : c.status}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div
                  ref={(el) => { scrollRefs.current[persona] = el; }}
                  className="h-64 space-y-2 overflow-y-auto rounded-md border p-3 text-xs"
                >
                  {c.turns.length === 0 && <p className="text-muted-foreground">No call yet.</p>}
                  {c.turns.map((t, i) => (
                    <p key={i}>
                      <span className={t.speaker === 'negotiator' ? 'font-semibold' : 'font-semibold text-muted-foreground'}>
                        {t.speaker === 'negotiator' ? 'Negotiator' : 'Seller'}:
                      </span>{' '}
                      {t.text}
                    </p>
                  ))}
                </div>

                {c.quote && (
                  <div className="space-y-1 rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between font-semibold">
                      <span>${c.quote.totalPrice.toLocaleString()}</span>
                      <span className="flex gap-1">
                        {c.quote.negotiated && c.quote.priceBefore != null && (
                          <Badge>${c.quote.priceBefore.toLocaleString()} → ${c.quote.priceAfter?.toLocaleString()}</Badge>
                        )}
                        {c.quote.binding && <Badge variant="outline">binding</Badge>}
                        {c.quote.redFlag && <Badge variant="destructive">red flag</Badge>}
                      </span>
                    </div>
                    {c.quote.lineItems.map((li, i) => (
                      <div key={i} className="flex justify-between text-muted-foreground">
                        <span>{li.label}</span>
                        <span>{li.amount == null ? '—' : `$${li.amount.toLocaleString()}`}</span>
                      </div>
                    ))}
                    <div className="text-xs text-muted-foreground">outcome: {c.quote.callOutcome}</div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
