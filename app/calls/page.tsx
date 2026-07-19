'use client';

import { useRef, useState } from 'react';
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
