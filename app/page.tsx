'use client';

import { useState } from 'react';

export default function Home() {
  const [busy, setBusy] = useState(false);

  async function runDemo() {
    setBusy(true);
    await fetch('/api/demo-seed', { method: 'POST' }); // fallback spec if the voice intake is skipped
    window.location.href = '/intake?demo=1';
  }

  return (
    <main className="flex min-h-[80vh] flex-col items-center justify-center gap-6 px-8 text-center">
      <h1 className="text-5xl font-bold tracking-tight">The Negotiator</h1>
      <p className="max-w-xl text-lg text-muted-foreground">
        The same move costs anywhere from $1,158 to $6,506. An AI agent that calls the movers,
        compares itemized quotes, and negotiates the price down for you.
      </p>
      <div className="flex gap-4">
        <a
          href="/intake"
          className="rounded-md bg-foreground px-6 py-2.5 font-medium text-background hover:opacity-90"
        >
          Start intake
        </a>
        <button
          onClick={runDemo}
          disabled={busy}
          className="rounded-md border border-indigo-600 px-6 py-2.5 font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 dark:hover:bg-indigo-950"
        >
          {busy ? 'Setting up…' : '▶ Run demo'}
        </button>
      </div>
      <p className="text-sm text-muted-foreground">
        Run demo plays the whole loop: voice intake with a synthetic customer → 3 negotiation calls → ranked report.
      </p>
    </main>
  );
}
