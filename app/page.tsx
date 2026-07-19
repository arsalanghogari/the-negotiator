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
    <main
      className="flex min-h-[85vh] flex-col items-center justify-center gap-7 bg-ink px-8 text-center text-white"
      style={{
        backgroundImage:
          'radial-gradient(640px 420px at 82% 0%, rgba(198,240,77,0.16), transparent)',
      }}
    >
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-signal">
        Never overpay again
      </p>
      <h1 className="max-w-3xl font-display text-5xl font-bold leading-[1.08] tracking-[-0.02em] md:text-6xl">
        The voice that haggles for you.
      </h1>
      <p className="max-w-xl text-lg leading-relaxed text-white/70">
        The same 45-mile move quotes anywhere from{' '}
        <span className="font-mono font-medium text-signal">$1,158</span> to{' '}
        <span className="font-mono font-medium text-signal">$6,506</span>. Parley calls the
        movers, compares itemized quotes, and negotiates the price down — with receipts.
      </p>
      <div className="flex gap-4">
        <button
          onClick={runDemo}
          disabled={busy}
          className="rounded-xl bg-signal px-6 py-3 font-semibold text-ink hover:brightness-105 disabled:opacity-50"
        >
          {busy ? 'Setting up…' : '▶ Run demo'}
        </button>
        <a
          href="/intake"
          className="rounded-xl border-[1.5px] border-white/30 px-6 py-3 font-semibold text-white hover:border-white/60"
        >
          Start intake
        </a>
      </div>
      <p className="text-sm text-white/50">
        Run demo plays the whole loop: voice intake with a synthetic customer → negotiation
        calls with one you can listen in on → ranked report.
      </p>
    </main>
  );
}
