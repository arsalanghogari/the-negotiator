'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { vertical } from '@/config/vertical';
import type { InvoiceRequest, JobSpec, Quote, Report, Transcript } from '@/types';

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

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
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
        <>
          <div className="rounded-xl border-2 border-indigo-600 bg-indigo-50 p-6 dark:bg-indigo-950">
            <p className="text-sm font-medium uppercase tracking-wide text-indigo-600">Our recommendation</p>
            <div className="mt-1 flex items-baseline justify-between">
              <h2 className="text-2xl font-bold">{recommended.providerName}</h2>
              <p className="text-3xl font-bold text-indigo-600">${recommended.totalPrice.toLocaleString()}</p>
            </div>
            <div className="mt-2 flex gap-2">
              {recommended.binding && <Badge>binding quote</Badge>}
              {recommended.negotiated && recommended.priceBefore != null && (
                <Badge variant="secondary">
                  negotiated down: ${recommended.priceBefore.toLocaleString()} → ${recommended.priceAfter?.toLocaleString()}
                </Badge>
              )}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
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
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950">
                  <p className="font-medium text-red-600">Red flags</p>
                  <ul className="mt-1 list-disc pl-5 text-red-600/90">
                    {report.redFlags.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <TakeAction report={report} defaultEmail={data?.spec.contactEmail ?? ''} />

          <AskAnything />

          <div className="space-y-4">
            {report.ranked.map((q, i) => (
              <Card key={q.quoteId} className={q.quoteId === report.recommendedQuoteId ? 'border-indigo-600' : ''}>
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
                        <span className="text-sm text-muted-foreground line-through">${q.priceBefore.toLocaleString()}</span>
                      )}
                      {q.callOutcome === 'quoted' ? (
                        <span className="text-xl font-bold">${q.totalPrice.toLocaleString()}</span>
                      ) : (
                        <span className="text-sm font-medium text-muted-foreground">no price given</span>
                      )}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {q.binding ? <Badge variant="outline">binding</Badge> : <Badge variant="secondary">non-binding</Badge>}
                    {q.negotiated && <Badge className="bg-indigo-600">price dropped on call</Badge>}
                    {q.redFlag && <Badge variant="destructive">red flag</Badge>}
                    {q.itemizationMismatch && <Badge variant="destructive">itemization doesn&apos;t add up</Badge>}
                    <Badge variant="secondary">{q.callOutcome}</Badge>
                  </div>
                  {q.redFlag && q.redFlagReason && <p className="text-sm text-red-600">{q.redFlagReason}</p>}
                  {q.callOutcome === 'quoted' ? (
                    <div className="rounded-md border p-3 text-sm">
                      <div className="flex justify-between font-medium">
                        <span>Base price</span><span>${q.basePrice.toLocaleString()}</span>
                      </div>
                      {q.lineItems.map((li, j) => (
                        <div key={j} className="flex justify-between text-muted-foreground">
                          <span>{li.label}</span>
                          <span>{li.amount == null ? 'undisclosed' : `$${li.amount.toLocaleString()}`}</span>
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

        </>
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
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InvoiceRequest | null>(null);
  const [error, setError] = useState('');

  async function go() {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/take-action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quoteId, email }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setResult(j);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Take action</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Book the move: the negotiator calls the seller back and asks for an itemized invoice by email.
          {/* ponytail: DEMO_MODE — the seller is simulated, so no real email is sent. */}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="h-9 rounded-md border bg-transparent px-2 text-sm"
            value={quoteId}
            onChange={(e) => { setQuoteId(e.target.value); setResult(null); }}
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
            className="w-64"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button onClick={go} disabled={busy || !email.includes('@')}>
            {busy ? 'Calling seller…' : 'Request invoice'}
          </Button>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        {result && (
          <div className="space-y-2 rounded-md border p-3 text-sm">
            <p className="font-medium text-indigo-600">
              Invoice requested from {result.providerName} → {result.email}
            </p>
            {result.turns.map((t, i) => (
              <p key={i}>
                <span className="font-semibold">{t.speaker === 'negotiator' ? 'Negotiator' : 'Seller'}:</span> {t.text}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
