'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { vertical } from '@/config/vertical';
import type { InvoiceRequest, JobSpec, Quote, Report, Transcript, TranscriptTurn } from '@/types';

type Bundle = { report: Report | null; transcripts: Transcript[]; spec: JobSpec };

export default function ReportPage() {
  const [data, setData] = useState<Bundle | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load(method: 'GET' | 'POST') {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/report', { method });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setData(j);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { load('GET'); }, []);

  const report = data?.report;
  const recommended = report?.ranked.find((q) => q.quoteId === report.recommendedQuoteId);
  const txOf = (q: Quote) => data?.transcripts.find((t) => t.transcriptId === q.transcriptRef);
  // Brand role: the highest quoted price renders in Overpay Red. If that happens to be
  // the recommended pick, its Signal role wins and nothing is red — the red never
  // shifts onto a cheaper quote.
  const highest = report?.ranked
    .filter((q) => q.callOutcome === 'quoted')
    .sort((a, b) => b.totalPrice - a.totalPrice)[0]?.quoteId;
  const highestQuoteId = highest === report?.recommendedQuoteId ? undefined : highest;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Report</h1>
        <Button onClick={() => load('POST')} disabled={busy}>
          {busy ? 'Working…' : report ? 'Regenerate report' : 'Generate report'}
        </Button>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {!report && !error && (
        <p className="text-muted-foreground">{busy ? 'Generating…' : 'No report yet — generate one from the completed calls.'}</p>
      )}

      {report && recommended && (
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_400px]">
          <div className="space-y-6">
          <div
            className="rounded-[18px] bg-ink p-6 text-white"
            style={{
              backgroundImage:
                'radial-gradient(420px 260px at 85% 0%, rgba(198,240,77,0.16), transparent)',
            }}
          >
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-signal">Our recommendation</p>
            <div className="mt-1 flex items-baseline justify-between">
              <h2 className="font-display text-2xl font-bold">{recommended.providerName}</h2>
              <p className="font-mono text-3xl font-bold text-signal">${recommended.totalPrice.toLocaleString()}</p>
            </div>
            <div className="mt-2 flex gap-2">
              {recommended.binding && <Badge>binding quote</Badge>}
              {recommended.negotiated && recommended.priceBefore != null && (
                <Badge className="bg-white/10 font-mono text-white">
                  negotiated down: ${recommended.priceBefore.toLocaleString()} → ${recommended.priceAfter?.toLocaleString()}
                </Badge>
              )}
            </div>
            <p className="mt-3 text-xs text-white/60">
              Market benchmark: ${vertical.marketMedian.toLocaleString()} median, observed range $
              {vertical.marketRange.low.toLocaleString()}–${vertical.marketRange.high.toLocaleString()} (
              {vertical.marketSource}). Red-flag rule: any quote ≥
              {vertical.redFlagBelowMedianPct * 100}% below median is treated as a lowball warning, not a win.
            </p>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-lg">Why this pick</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{report.rationale}</p>
              {report.redFlags.length > 0 && (
                <div className="rounded-md border border-amber/50 bg-amber/10 p-3 text-sm">
                  <p className="font-medium">⚑ Red flags</p>
                  <ul className="mt-1 list-disc pl-5 text-foreground/80">
                    {report.redFlags.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            {report.ranked.map((q, i) => (
              <Card key={q.quoteId} className={q.quoteId === report.recommendedQuoteId ? 'border-signal-deep' : ''}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-lg">
                    <span className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted font-mono text-sm">
                        {i + 1}
                      </span>
                      {q.providerName}
                    </span>
                    <span className="flex items-center gap-2">
                      {q.negotiated && q.priceBefore != null && (
                        <span className="font-mono text-sm text-muted-foreground line-through">${q.priceBefore.toLocaleString()}</span>
                      )}
                      {q.callOutcome === 'quoted' ? (
                        <span className={`font-mono text-xl font-bold ${q.quoteId === highestQuoteId ? 'text-red-brand' : ''}`}>
                          ${q.totalPrice.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-sm font-medium text-muted-foreground">no price given</span>
                      )}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {q.binding ? <Badge variant="outline">binding</Badge> : <Badge variant="secondary">non-binding</Badge>}
                    {q.negotiated && <Badge>price dropped on call</Badge>}
                    {q.redFlag && <Badge className="border-amber bg-amber/15 text-foreground">⚑ red flag</Badge>}
                    {q.itemizationMismatch && <Badge className="border-amber bg-amber/15 text-foreground">⚑ doesn&apos;t add up</Badge>}
                    <Badge variant="secondary">{q.callOutcome}</Badge>
                  </div>
                  {q.redFlag && q.redFlagReason && <p className="text-sm text-foreground/80">⚑ {q.redFlagReason}</p>}
                  {q.callOutcome === 'quoted' ? (
                    <div className="rounded-md border p-3 text-sm">
                      <div className="flex justify-between font-medium">
                        <span>Base price</span><span className="font-mono">${q.basePrice.toLocaleString()}</span>
                      </div>
                      {q.lineItems.map((li, j) => (
                        <div key={j} className="flex justify-between text-muted-foreground">
                          <span>{li.label}</span>
                          <span className="font-mono">{li.amount == null ? 'undisclosed' : `$${li.amount.toLocaleString()}`}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Wouldn&apos;t price it over the phone — logged as a{' '}
                      {q.callOutcome === 'callback' ? 'callback commitment' : 'documented decline'}, not a
                      vague range.
                    </p>
                  )}
                  {txOf(q)?.conversationId && (
                    <div className="text-sm">
                      <p className="mb-1 text-muted-foreground">Call recording</p>
                      <audio
                        controls
                        preload="none"
                        className="w-full"
                        src={`/api/recording?id=${txOf(q)!.conversationId}`}
                        onError={(e) => { (e.currentTarget.parentElement as HTMLElement).hidden = true; }}
                      />
                    </div>
                  )}
                  {txOf(q) && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        Call transcript ({txOf(q)!.turns.length} turns)
                      </summary>
                      <div className="mt-2 max-h-64 space-y-2 overflow-y-auto rounded-md border p-3">
                        {txOf(q)!.turns.map((t, j) => (
                          <p key={j}>
                            <span className="font-semibold">{t.speaker === 'negotiator' ? 'Negotiator' : 'Seller'}:</span> {t.text}
                          </p>
                        ))}
                      </div>
                    </details>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          </div>

          <div className="space-y-6 lg:sticky lg:top-6">
            <TakeAction report={report} defaultEmail={data?.spec.contactEmail ?? ''} />
            <AskAnything />
          </div>
        </div>
      )}
    </main>
  );
}

type ChatMsg = { role: 'user' | 'assistant'; content: string };

function AskAnything() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    const q = input.trim();
    if (!q || busy) return;
    const next: ChatMsg[] = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });
      const j = await res.json();
      setMessages([...next, { role: 'assistant', content: res.ok ? j.text : `Error: ${j.error}` }]);
    } catch (e) {
      setMessages([...next, { role: 'assistant', content: `Error: ${e}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Questions about these quotes?</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Ask anything grounded in your calls — e.g. &ldquo;why is the cheapest quote risky?&rdquo; or
            &ldquo;what did Golden Gate say about insurance?&rdquo;
          </p>
        )}
        {messages.length > 0 && (
          <div className="max-h-72 space-y-3 overflow-y-auto rounded-md border p-3 text-sm">
            {messages.map((m, i) => (
              <p key={i} className={m.role === 'user' ? 'font-medium' : 'text-muted-foreground'}>
                <span className="font-semibold">{m.role === 'user' ? 'You: ' : 'Negotiator: '}</span>
                {m.content}
              </p>
            ))}
            {busy && <p className="text-muted-foreground">Thinking…</p>}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            placeholder="Ask a question about your quotes…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            disabled={busy}
          />
          <Button onClick={send} disabled={busy || !input.trim()}>Ask</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TakeAction({ report, defaultEmail }: { report: Report; defaultEmail: string }) {
  const quotable = report.ranked.filter((q) => q.callOutcome === 'quoted');
  const [quoteId, setQuoteId] = useState(report.recommendedQuoteId);
  const [email, setEmail] = useState(defaultEmail);
  const [phase, setPhase] = useState<'idle' | 'calling' | 'done'>('idle');
  const [visible, setVisible] = useState<TranscriptTurn[]>([]);
  const [listening, setListening] = useState(false);
  const [result, setResult] = useState<InvoiceRequest | null>(null);
  const [error, setError] = useState('');
  // Ref so flipping the toggle mid-call affects the NEXT turn — joining/leaving live.
  const listenRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function toggleListen() {
    listenRef.current = !listenRef.current;
    setListening(listenRef.current);
    if (!listenRef.current) audioRef.current?.pause();
  }

  // Voice one turn via TTS (negotiator voice matches the live agent); resolve when played.
  function speak(t: TranscriptTurn): Promise<void> {
    return new Promise((resolve) => {
      const done = (a?: HTMLAudioElement) => {
        if (a) URL.revokeObjectURL(a.src);
        audioRef.current = null;
        resolve();
      };
      (async () => {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: t.text, voice: t.speaker }),
        });
        if (!res.ok) throw new Error();
        const audio = new Audio(URL.createObjectURL(await res.blob()));
        audioRef.current = audio;
        audio.onended = () => done(audio);
        audio.onerror = () => done(audio);
        await audio.play();
      })().catch(() => done());
    });
  }

  async function go() {
    setPhase('calling');
    setError('');
    setResult(null);
    setVisible([]);
    try {
      const res = await fetch('/api/take-action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quoteId, email }),
      });
      const j = (await res.json()) as InvoiceRequest & { error?: string };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      // The call proceeds on its own; if the user has joined, each turn plays out loud
      // before the next lands, otherwise turns land at a natural reading pace.
      for (const t of j.turns) {
        setVisible((v) => [...v, t]);
        if (listenRef.current) await speak(t);
        else await new Promise((r) => setTimeout(r, 900));
      }
      setResult(j);
      setPhase('done');
    } catch (e) {
      setError(String(e));
      setPhase('idle');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-lg">
          <span>Take action</span>
          {phase === 'calling' && (
            <Badge className="gap-1.5 bg-signal/20 font-mono text-xs text-foreground">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal-deep" />
              on call
            </Badge>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Parley calls the seller back to book and request the itemized invoice by email. It
          works on its own — join in and listen whenever you like.
          {/* ponytail: DEMO_MODE — the seller is simulated, so no real email is sent. */}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <select
          className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
          value={quoteId}
          onChange={(e) => { setQuoteId(e.target.value); setResult(null); }}
          disabled={phase === 'calling'}
        >
          {quotable.map((q) => (
            <option key={q.quoteId} value={q.quoteId}>
              {q.providerName} — ${q.totalPrice.toLocaleString()}{q.quoteId === report.recommendedQuoteId ? ' (recommended)' : ''}
            </option>
          ))}
        </select>
        <Input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={phase === 'calling'}
        />
        <div className="flex items-center gap-2">
          <Button onClick={go} disabled={phase === 'calling' || !email.includes('@')}>
            {phase === 'calling' ? 'Calling seller…' : 'Book & request invoice'}
          </Button>
          <Button
            variant="outline"
            onClick={toggleListen}
            className={listening ? 'border-signal-deep text-signal-deep' : ''}
          >
            {listening ? '🔊 Listening' : '🔇 Listen in'}
          </Button>
        </div>
        {error && <p className="text-sm text-red-brand">{error}</p>}
        {visible.length > 0 && (
          <div className="space-y-2 rounded-md border p-3 text-sm">
            {visible.map((t, i) => (
              <p key={i}>
                <span className={t.speaker === 'negotiator' ? 'font-semibold text-signal-deep' : 'font-semibold'}>
                  {t.speaker === 'negotiator' ? 'Negotiator' : 'Seller'}:
                </span>{' '}
                {t.text}
              </p>
            ))}
            {result && (
              <p className="pt-1 font-medium text-signal-deep">
                ✓ Booked with {result.providerName} — invoice to {result.email}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
