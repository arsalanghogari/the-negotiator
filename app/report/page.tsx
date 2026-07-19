'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Quote, Report, Transcript } from '@/types';

type Bundle = { report: Report | null; transcripts: Transcript[] };

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
          </div>

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
                      <span className="text-xl font-bold">${q.totalPrice.toLocaleString()}</span>
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {q.binding ? <Badge variant="outline">binding</Badge> : <Badge variant="secondary">non-binding</Badge>}
                    {q.negotiated && <Badge className="bg-indigo-600">price dropped on call</Badge>}
                    {q.redFlag && <Badge variant="destructive">red flag</Badge>}
                    <Badge variant="secondary">{q.callOutcome}</Badge>
                  </div>
                  {q.redFlag && q.redFlagReason && <p className="text-sm text-red-600">{q.redFlagReason}</p>}
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
        </>
      )}
    </main>
  );
}
