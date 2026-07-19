'use client';

import { useEffect, useRef, useState } from 'react';
import { ConversationProvider, useConversation } from '@elevenlabs/react';
import { useSpeechGate } from '@/lib/use-speech-gate';
import { stripDirections } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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
    if (res.ok && demo) {
      setMessage('Spec confirmed — starting the negotiation calls…');
      setTimeout(() => { window.location.href = '/calls?demo=1'; }, 1200);
    } else {
      setMessage(res.ok ? `Saved ${final.jobId}. Ready for calls.` : 'Save failed.');
    }
    setBusy(null);
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <h1 className="text-3xl font-bold tracking-tight">Job intake</h1>

      <Card>
        <CardHeader><CardTitle>Upload an existing quote or room photos</CardTitle></CardHeader>
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
              ? 'Voice intake captured — verify the details below, then click Confirm to start the calls.'
              : 'Voice intake captured — review and confirm below.'
          );
        }}
      />

      <Card>
        <CardHeader><CardTitle>Confirm the job spec</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {(['origin', 'destination'] as const).map((k) => (
            <fieldset key={k} className="grid grid-cols-4 items-end gap-3">
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

          <div className="grid grid-cols-4 gap-3">
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
    <Card className={demo ? 'border-signal-deep' : ''}>
      <CardHeader>
        <CardTitle>{demo ? 'Voice interview — demo customer 🔊' : 'Voice interview'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <Button onClick={live ? () => conversation.endSession() : start} variant={live ? 'destructive' : 'default'}>
            {live ? 'End interview' : demo ? '▶ Start demo interview' : 'Start voice interview'}
          </Button>
          <span className="text-sm text-muted-foreground">
            {live
              ? conversation.isSpeaking ? 'Agent speaking…' : 'Listening…'
              : demo
                ? 'A synthetic customer answers the intake agent out loud; the form fills itself, then the calls start.'
                : 'Answer a few questions, confirm, and the form fills itself.'}
          </span>
        </div>
        {turns.length > 0 && (
          <div ref={scrollRef} className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-3 text-sm">
            {turns.map((t, i) => (
              <p key={i}>
                <span className="font-medium">{t.source === 'user' ? 'You' : 'Agent'}:</span> {t.message}
              </p>
            ))}
          </div>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
      </CardContent>
    </Card>
  );
}

function prune<T extends object>(o: T | null | undefined): Partial<T> {
  if (!o) return {};
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null)) as Partial<T>;
}
