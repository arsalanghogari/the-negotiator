'use client';

import { useEffect, useRef, useState } from 'react';
import { ConversationProvider, useConversation } from '@elevenlabs/react';
import { useSpeechGate } from '@/lib/use-speech-gate';
import { stripDirections } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import type { JobSpec } from '@/types';

const empty: JobSpec = {
  jobId: '',
  vertical: 'moving',
  origin: { city: '', zip: '', floor: 1, hasElevator: false },
  destination: { city: '', zip: '', floor: 1, hasElevator: false },
  distanceMiles: 0,
  homeSize: '2br',
  largeItems: [],
  boxCountEst: 0,
  stairsFlights: 0,
  longCarry: false,
  packingService: false,
  preferredDate: '',
  specialNotes: '',
  customerName: '',
  contactEmail: '',
  confirmedByUser: false,
};

export default function IntakePage() {
  const [spec, setSpec] = useState<JobSpec>(empty);
  const [busy, setBusy] = useState<'extract' | 'save' | null>(null);
  const [message, setMessage] = useState('');
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    setDemo(new URLSearchParams(window.location.search).get('demo') === '1');
  }, []);


  const set = (patch: Partial<JobSpec>) => setSpec((s) => ({ ...s, ...patch }));

  async function extract(file: File) {
    setBusy('extract');
    setMessage('');
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/extract', { method: 'POST', body });
      if (!res.ok) throw new Error(await res.text());
      const ex = await res.json();
      // Merge extracted fields; nulls keep current values.
      setSpec((s) => ({
        ...s,
        origin: { ...s.origin, ...prune(ex.origin) },
        destination: { ...s.destination, ...prune(ex.destination) },
        ...prune({
          distanceMiles: ex.distanceMiles,
          homeSize: ex.homeSize,
          boxCountEst: ex.boxCountEst,
          stairsFlights: ex.stairsFlights,
          longCarry: ex.longCarry,
          packingService: ex.packingService,
          preferredDate: ex.preferredDate,
          specialNotes: ex.specialNotes,
        }),
        largeItems: ex.largeItems?.length ? ex.largeItems : s.largeItems,
      }));
      setMessage('Extracted — review and confirm below.');
    } catch (e) {
      setMessage(`Extraction failed: ${e}`);
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    setBusy('save');
    setMessage('');
    const final = { ...spec, jobId: spec.jobId || `job-${crypto.randomUUID().slice(0, 8)}`, confirmedByUser: true };
    const res = await fetch('/api/jobspec', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(final),
    });
    setSpec(final);
    if (res.ok) {
      setMessage('Spec confirmed — starting the negotiation calls…');
      setTimeout(() => { window.location.href = demo ? '/calls?demo=1' : '/calls'; }, 1200);
    } else {
      setMessage('Save failed.');
    }
    setBusy(null);
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="space-y-1.5">
        <h1 className="text-3xl font-bold tracking-tight">Job intake</h1>
        <p className="max-w-2xl text-muted-foreground">
          Start with the voice interview — it builds the job spec Parley reads to every mover it
          calls.
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <VoiceIntake
          demo={demo}
          onSpec={(ex) => {
            // The agent may return null for fields it didn't collect — nulls keep current
            // values (same rule as document extraction), else inputs get value={null}.
            setSpec((s) => ({
              ...s,
              ...prune(ex),
              origin: { ...s.origin, ...prune(ex.origin) },
              destination: { ...s.destination, ...prune(ex.destination) },
              jobId: demo ? 'job-demo-1' : s.jobId,
            }));
            setMessage(
              demo
                ? 'Voice intake captured — verify the details, then click Confirm to start the calls.'
                : 'Voice intake captured — review and confirm on the right.'
            );
          }}
        />

        <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Have a quote or photos already?</CardTitle>
          <p className="text-sm text-muted-foreground">
            Optional — Parley pulls the details from an existing quote, bill, or photos.
          </p>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Input
            type="file"
            accept="image/*,application/pdf"
            disabled={busy !== null}
            onChange={(e) => e.target.files?.[0] && extract(e.target.files[0])}
          />
          {busy === 'extract' && <span className="text-sm text-muted-foreground">Extracting…</span>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your job spec</CardTitle>
          <p className="text-sm text-muted-foreground">
            Fills itself from the voice interview — review, tweak, confirm.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {(['origin', 'destination'] as const).map((k) => (
            <fieldset key={k} className="grid grid-cols-2 items-end gap-3">
              <div className="space-y-1">
                <Label className="capitalize">{k} city</Label>
                <Input value={spec[k].city} onChange={(e) => set({ [k]: { ...spec[k], city: e.target.value } })} />
              </div>
              <div className="space-y-1">
                <Label>Zip</Label>
                <Input value={spec[k].zip} onChange={(e) => set({ [k]: { ...spec[k], zip: e.target.value } })} />
              </div>
              <div className="space-y-1">
                <Label>Floor</Label>
                <Input type="number" value={spec[k].floor} onChange={(e) => set({ [k]: { ...spec[k], floor: +e.target.value } })} />
              </div>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <Checkbox checked={spec[k].hasElevator} onCheckedChange={(v) => set({ [k]: { ...spec[k], hasElevator: v === true } })} />
                Elevator
              </label>
            </fieldset>
          ))}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Distance (mi)</Label>
              <Input type="number" value={spec.distanceMiles} onChange={(e) => set({ distanceMiles: +e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Home size</Label>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={spec.homeSize}
                onChange={(e) => set({ homeSize: e.target.value as JobSpec['homeSize'] })}
              >
                {['studio', '1br', '2br', '3br+'].map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Boxes (est.)</Label>
              <Input type="number" value={spec.boxCountEst} onChange={(e) => set({ boxCountEst: +e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Stairs (flights)</Label>
              <Input type="number" value={spec.stairsFlights} onChange={(e) => set({ stairsFlights: +e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Large items (comma-separated)</Label>
              <Input
                value={spec.largeItems.join(', ')}
                onChange={(e) => set({ largeItems: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
              />
            </div>
            <div className="space-y-1">
              <Label>Preferred date</Label>
              <Input type="date" value={spec.preferredDate} onChange={(e) => set({ preferredDate: e.target.value })} />
            </div>
          </div>

          <div className="flex gap-6 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox checked={spec.longCarry} onCheckedChange={(v) => set({ longCarry: v === true })} /> Long carry
            </label>
            <label className="flex items-center gap-2">
              <Checkbox checked={spec.packingService} onCheckedChange={(v) => set({ packingService: v === true })} /> Packing service
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Special notes</Label>
              <Input value={spec.specialNotes} onChange={(e) => set({ specialNotes: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Your name (for the booking)</Label>
              <Input value={spec.customerName} onChange={(e) => set({ customerName: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Email (for the winning seller&apos;s invoice)</Label>
              <Input type="email" value={spec.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button onClick={confirm} disabled={busy !== null}>
              {busy === 'save' ? 'Saving…' : 'Confirm job spec'}
            </Button>
            {message && <span className="text-sm text-muted-foreground">{message}</span>}
          </div>
        </CardContent>
      </Card>
        </div>
      </div>
    </main>
  );
}

function VoiceIntake(props: { demo: boolean; onSpec: (spec: Partial<JobSpec>) => void }) {
  return (
    <ConversationProvider>
      <VoiceIntakeInner {...props} />
    </ConversationProvider>
  );
}

function VoiceIntakeInner({ demo, onSpec }: { demo: boolean; onSpec: (spec: Partial<JobSpec>) => void }) {
  const [turns, setTurns] = useState<{ source: string; message: string }[]>([]);
  const [error, setError] = useState('');
  const gate = useSpeechGate();
  const doneRef = useRef(false); // spec saved — stop the reply loop or the goodbyes never end
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns]);
  const turnsLive = useRef<{ source: string; message: string }[]>([]);
  const addTurn = (t: { source: string; message: string }) => {
    turnsLive.current = [...turnsLive.current, t];
    setTurns(turnsLive.current);
  };
  const conversation = useConversation({
    micMuted: demo, // demo: a synthetic customer answers as text; no human mic
    clientTools: {
      // The intake agent calls this after the user confirms the spec verbally.
      save_job_spec: (params: { job_spec_json: string }) => {
        try {
          onSpec(JSON.parse(params.job_spec_json));
          if (demo) {
            doneRef.current = true;
            gate.clear();
            setTimeout(() => conversation.endSession(), 8000); // let the goodbye play, then hang up
          }
          return 'saved';
        } catch {
          return 'invalid JSON, please retry with valid JSON';
        }
      },
    },
    onModeChange: gate.onModeChange,
    onMessage: async ({ source, message }: { source: string; message: string }) => {
      addTurn({ source, message: stripDirections(message) });
      if (!demo || source !== 'ai' || !message || doneRef.current) return;
      gate.noteAgentMessage();
      try {
        // Turn mapping for the customer model: agent = 'negotiator', customer = 'seller'.
        const history = turnsLive.current.map((t) => ({
          speaker: t.source === 'ai' ? 'negotiator' : 'seller',
          text: t.message,
        }));
        const res = await fetch('/api/customer-reply', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ turns: history }),
        });
        const { text } = await res.json();
        gate.queue(() => {
          addTurn({ source: 'user', message: text });
          conversation.sendUserMessage(text);
        });
      } catch (e) {
        setError(String(e));
      }
    },
    onError: (e: unknown) => setError(String(e)),
  });

  async function start() {
    setError('');
    doneRef.current = false;
    turnsLive.current = [];
    setTurns([]);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {
        if (!demo) throw new Error('microphone required for the live interview');
      });
      const res = await fetch('/api/voice-token?agent=intake');
      const { token, error } = await res.json();
      if (!res.ok) throw new Error(error);
      await conversation.startSession({ conversationToken: token });
    } catch (e) {
      setError(String(e));
    }
  }

  const live = conversation.status === 'connected';
  return (
    <Card className={demo ? 'border-signal-deep lg:sticky lg:top-6' : 'lg:sticky lg:top-6'}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{demo ? 'Voice interview — demo customer 🔊' : 'Voice interview'}</span>
          {live && (
            <Badge className="gap-1.5 bg-signal/20 font-mono text-xs text-foreground">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal-deep" />
              {conversation.isSpeaking ? 'agent speaking…' : 'listening…'}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {turns.length === 0 ? (
          <div className="flex min-h-[340px] flex-col items-center justify-center gap-4 rounded-md border border-dashed p-8 text-center">
            <span className="text-4xl">🎙️</span>
            <Button size="lg" onClick={start} disabled={live}>
              {demo ? '▶ Start demo interview' : 'Start voice interview'}
            </Button>
            <p className="max-w-xs text-sm text-muted-foreground">
              {demo
                ? 'A synthetic customer answers out loud, then the calls start.'
                : 'About two minutes — answer a few questions and the form fills itself.'}
            </p>
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="max-h-[440px] min-h-[340px] space-y-2 overflow-y-auto rounded-md border p-3">
              {turns.map((t, i) => (
                <div key={i} className={`flex ${t.source === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                      t.source === 'user' ? 'bg-ink text-white' : 'bg-secondary'
                    }`}
                  >
                    {t.message}
                  </div>
                </div>
              ))}
            </div>
            <Button variant={live ? 'destructive' : 'outline'} onClick={live ? () => conversation.endSession() : start}>
              {live ? 'End interview' : 'Restart interview'}
            </Button>
          </>
        )}
        {error && <p className="text-sm text-red-brand">{error}</p>}
      </CardContent>
    </Card>
  );
}

function prune<T extends object>(o: T | null | undefined): Partial<T> {
  if (!o) return {};
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null)) as Partial<T>;
}
