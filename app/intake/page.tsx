'use client';

import { useState } from 'react';
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
  confirmedByUser: false,
};

export default function IntakePage() {
  const [spec, setSpec] = useState<JobSpec>(empty);
  const [busy, setBusy] = useState<'extract' | 'save' | null>(null);
  const [message, setMessage] = useState('');

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
    setMessage(res.ok ? `Saved ${final.jobId}. Ready for calls.` : 'Save failed.');
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

      <Card>
        <CardHeader><CardTitle>Voice interview</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {/* Wired once ELEVENLABS_AGENT_ID_INTAKE is set (M2, voice half). */}
          Coming next — requires the ElevenLabs intake agent ID.
        </CardContent>
      </Card>

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

          <div className="space-y-1">
            <Label>Special notes</Label>
            <Input value={spec.specialNotes} onChange={(e) => set({ specialNotes: e.target.value })} />
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

function prune<T extends object>(o: T | null | undefined): Partial<T> {
  if (!o) return {};
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null)) as Partial<T>;
}
