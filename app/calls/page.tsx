'use client';

import { useEffect, useRef, useState } from 'react';
import { ConversationProvider, useConversation } from '@elevenlabs/react';
import { useSpeechGate } from '@/lib/use-speech-gate';
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
const idleAll = () =>
  Object.fromEntries(SELLERS.map((s) => [s.persona, idle()])) as Record<Persona, CallState>;

// Agents sometimes emit stage directions like "[Confidently]" despite the prompt — never
// display or speak them.
const stripDirections = (t: string) => t.replace(/\[[^\]]{0,60}\]\s*/g, '').trim();

// The listen-in call: the ElevenLabs negotiator agent speaks out loud; the simulated
// "tough" seller replies are generated server-side, spoken via TTS, then fed in as text.
// `auto` starts the call without a click (demo flow); `onSaved` fires once it's saved;
// `onResult` hands the finished turns+quote to the parent so the seller card populates.
function ShowcaseCall({
  auto = false,
  onSaved,
  onResult,
}: {
  auto?: boolean;
  onSaved?: () => void;
  onResult?: (turns: TranscriptTurn[], quote: Quote) => void;
}) {
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [phase, setPhase] = useState<'idle' | 'live' | 'saving' | 'done'>('idle');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState('');
  const [sellerSpeaking, setSellerSpeaking] = useState(false);
  const turnsRef = useRef<TranscriptTurn[]>([]);
  const convIdRef = useRef(''); // ElevenLabs conversation id — lets the report link the recording
  const specRef = useRef(''); // job-spec JSON, fetched before connect, injected in onConnect
  const sellerAudioRef = useRef<HTMLAudioElement | null>(null);
  const gate = useSpeechGate();
  const push = (t: TranscriptTurn) => {
    turnsRef.current = [...turnsRef.current, t];
    setTurns(turnsRef.current);
  };

  // Listen-in: the seller's reply is spoken aloud (TTS) BEFORE the text goes to the agent,
  // so the user hears the whole sequence and the two voices never overlap. Resolves when
  // the audio has finished (or immediately if TTS fails — garnish, never stall the call).
  function speakSeller(text: string): Promise<void> {
    return new Promise((resolve) => {
      const done = (audio?: HTMLAudioElement) => {
        if (audio) URL.revokeObjectURL(audio.src);
        sellerAudioRef.current = null;
        setSellerSpeaking(false);
        resolve();
      };
      (async () => {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error(`tts ${res.status}`);
        const audio = new Audio(URL.createObjectURL(await res.blob()));
        sellerAudioRef.current = audio;
        audio.onended = () => done(audio);
        audio.onerror = () => done(audio);
        setSellerSpeaking(true);
        await audio.play();
      })().catch(() => done());
    });
  }

  // One seller reply per agent TURN, generated at delivery time so it addresses everything
  // the agent said (agents split turns into multiple messages; per-message replies fork the
  // conversation). While the seller "thinks" and speaks, sendUserActivity pings keep the
  // agent from hitting its turn timeout and barging in over the audio.
  async function deliverSellerReply() {
    const ping = setInterval(() => {
      try { conversation.sendUserActivity(); } catch { /* session ended */ }
    }, 2000);
    try {
      const res = await fetch('/api/seller-reply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ turns: turnsRef.current }),
      });
      const { text } = await res.json();
      if (turnsRef.current.length === 0) return; // call was ended/reset meanwhile
      push({ speaker: 'seller', text });
      await speakSeller(text);
      conversation.sendUserMessage(text);
    } catch (e) {
      // A reply in flight when the call wraps up hits a dead session — that's not an error.
      if (!String(e).includes('No active conversation')) setError(String(e));
    } finally {
      clearInterval(ping);
    }
  }

  const conversation = useConversation({
    micMuted: true, // no human on this call; the seller feeds in as text
    // startSession() returns before the session is connected — anything that needs a live
    // conversation (id, contextual update) must wait for onConnect, or it throws.
    onConnect: ({ conversationId }: { conversationId: string }) => {
      convIdRef.current = conversationId;
      conversation.sendContextualUpdate(
        `Confirmed job spec for this call (your only source of truth): ${specRef.current}. You are calling the mover "Bay Area Van Lines".`
      );
      setPhase('live');
    },
    clientTools: {
      get_best_competing_quote: async () => JSON.stringify(await (await fetch('/api/best-quote')).json()),
      log_quote: (p: { quote_json: string }) => {
        void p; // the authoritative Quote comes from transcript extraction on save
        gate.clear(); // no reply after the goodbye
        setTimeout(finish, 6000); // let the goodbye line play out
        return 'logged';
      },
    },
    onModeChange: gate.onModeChange,
    onMessage: ({ source, message }: { source: string; message: string }) => {
      if (source !== 'ai' || !message) return;
      gate.noteAgentMessage();
      push({ speaker: 'negotiator', text: stripDirections(message) });
      // Queue (not fetch) — consecutive agent messages collapse into ONE seller reply,
      // generated only once the agent's audio has gone quiet.
      gate.queue(() => {
        if (turnsRef.current.length === 0) return; // call was ended/reset meanwhile
        void deliverSellerReply();
      });
    },
    onError: (e: unknown) => setError(String(e)),
  });

  async function start() {
    if (phase !== 'idle') return;
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
      const spec = (await (await fetch('/api/jobspec')).json()).at(-1);
      specRef.current = JSON.stringify(spec);
      // Fire-and-forget: onConnect takes it from here; failures surface via onError.
      conversation.startSession({ conversationToken: token });
    } catch (e) {
      setError(String(e));
    }
  }

  // Demo flow: auto-start the call once the fast text calls are done.
  useEffect(() => {
    if (auto) void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  async function finish() {
    if (turnsRef.current.length < 2) return;
    setPhase('saving');
    try {
      sellerAudioRef.current?.pause();
      conversation.endSession();
      const res = await fetch('/api/showcase-complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ turns: turnsRef.current, conversationId: convIdRef.current || undefined }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setQuote(j.quote);
      setPhase('done');
      onResult?.(turnsRef.current, j.quote);
      onSaved?.();
    } catch (e) {
      setError(String(e));
      setPhase('idle');
    }
  }

  return (
    <Card className="border-indigo-600">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>Listen in — Bay Area Van Lines, both sides live 🔊</span>
          <span className="flex items-center gap-2">
            {phase === 'live' && (
              <Badge variant="secondary">
                {conversation.isSpeaking
                  ? 'negotiator speaking…'
                  : sellerSpeaking
                    ? 'seller speaking…'
                    : 'on call'}
              </Badge>
            )}
            <Button
              size="sm"
              variant={phase === 'live' ? 'destructive' : 'default'}
              onClick={phase === 'live' ? finish : start}
              disabled={phase === 'saving'}
            >
              {phase === 'live' ? 'End & save' : phase === 'saving' ? 'Saving…' : 'Listen in live'}
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
  const [calls, setCalls] = useState<Record<Persona, CallState>>(idleAll);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [demoStep, setDemoStep] = useState('');
  const [voiceAuto, setVoiceAuto] = useState(false);
  const scrollRefs = useRef<Partial<Record<Persona, HTMLDivElement | null>>>({});

  // Run-demo flow: /calls?demo=1 auto-runs the calls, then generates the report and moves on.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('demo') === '1') {
      runDemo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Demo: fast text calls first (they arm the negotiator with leverage), then the audible
  // listen-in call against the tough seller; the report waits for that call to finish.
  async function runDemo() {
    setDemoStep(`Calling ${SELLERS.length - 1} movers…`);
    const ok = await run('tough');
    if (!ok) return setDemoStep('');
    setDemoStep('Now listen in — live voice negotiation with Bay Area Van Lines…');
    setVoiceAuto(true); // ShowcaseCall auto-starts; onVoiceDone continues the demo
  }

  async function onVoiceDone() {
    setDemoStep('Calls done — generating the ranked report…');
    const res = await fetch('/api/report', { method: 'POST' });
    if (!res.ok) {
      setError(await res.text());
      return setDemoStep('');
    }
    window.location.href = '/report';
  }

  async function run(exclude?: Persona): Promise<boolean> {
    setRunning(true);
    setError('');
    setCalls(idleAll());
    try {
      const res = await fetch('/api/calls/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(exclude ? { exclude } : {}),
      });
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
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Calls</h1>
        <span className="flex items-center gap-3">
          {demoStep && <span className="text-sm font-medium text-indigo-600">{demoStep}</span>}
          <Button onClick={() => run()} disabled={running}>{running ? 'Calling…' : `Run ${SELLERS.length} calls`}</Button>
        </span>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Call list — {vertical.discovery.candidates.length} movers found via {vertical.discovery.source}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Real listings: &ldquo;{vertical.discovery.query}&rdquo;, {vertical.discovery.source} (fetched{' '}
            {vertical.discovery.fetched}). Live mode dials these numbers via Twilio/SIP; demo mode
            role-plays the {SELLERS.length} on the call sheet with fictional stand-ins so no real
            business is misrepresented.
          </p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
            {vertical.discovery.candidates.map((c, i) => {
              const onSheet = i < SELLERS.length;
              return (
                <div key={c.name} className="flex items-center justify-between gap-2">
                  <span className={onSheet ? 'font-medium' : 'text-muted-foreground'}>
                    {c.name}{' '}
                    <span className="text-xs text-muted-foreground">★ {c.rating} ({c.reviews})</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-muted-foreground">{c.phone}</span>
                    {onSheet && <Badge variant="outline">on call sheet</Badge>}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <ConversationProvider>
        <ShowcaseCall
          auto={voiceAuto}
          onSaved={voiceAuto ? onVoiceDone : undefined}
          onResult={(turns, quote) =>
            setCalls((c) => ({ ...c, tough: { status: 'done', turns, quote } }))
          }
        />
      </ConversationProvider>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
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
                      <span>
                        {c.quote.callOutcome === 'quoted'
                          ? `$${c.quote.totalPrice.toLocaleString()}`
                          : 'no price given'}
                      </span>
                      <span className="flex gap-1">
                        {c.quote.negotiated && c.quote.priceBefore != null && (
                          <Badge>${c.quote.priceBefore.toLocaleString()} → ${c.quote.priceAfter?.toLocaleString()}</Badge>
                        )}
                        {c.quote.binding && <Badge variant="outline">binding</Badge>}
                        {c.quote.redFlag && <Badge variant="destructive">red flag</Badge>}
                        {c.quote.itemizationMismatch && <Badge variant="destructive">doesn&apos;t add up</Badge>}
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
