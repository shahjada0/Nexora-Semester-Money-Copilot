'use client';

import { useEffect, useState } from 'react';
import { FlaskConical, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import type { Card } from '@/lib/cards';
import type { Msg } from './CopilotApp';

type Send = (text: string, documentId?: string | null, attachmentName?: string) => Promise<void>;

const uid = () => Math.random().toString(36).slice(2);

async function post<T>(body: unknown): Promise<T> {
  const r = await fetch('/api/demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}

export function DemoPanel({ send, push, refresh, reset }: { send: Send; push: (m: Msg) => void; refresh: () => void; reset: () => void }) {
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (window.innerWidth < 1024) setOpen(false); // don't cover the chat on phones
  }, []);

  const run = (key: string, fn: () => Promise<void>) => async () => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const invoice = (file: string, prompt = 'Please pay my tuition invoice') => async () => {
    const r = await post<{ documentId: string; filename: string }>({ scenario: 'load-invoice', file });
    await send(prompt, r.documentId, r.filename);
  };

  const scenarios: { key: string; label: string; hint: string; fn: () => Promise<void> }[] = [
    { key: 'happy', label: '1 · Happy-path tuition', hint: 'Verified payee → Tier 3', fn: invoice('legit-01-tuition-instalment-2.pdf') },
    { key: 'inject', label: '2 · Injected invoice', hint: 'White-text instructions → blocked', fn: invoice('mal-01-white-text-injection.pdf') },
    { key: 'swap', label: '3 · Account swap', hint: 'Real name, other account → blocked', fn: invoice('mal-02-account-swap.txt') },
    {
      key: 'tamper',
      label: '4 · Amount tamper',
      hint: 'Run 1 first, then this, then confirm',
      fn: async () => {
        const r = await post<{ from?: number; to?: number; error?: string }>({ scenario: 'tamper' });
        push({
          id: uid(),
          role: 'system',
          text: r.error ?? `DEMO ATTACK: the stored invoice amount was changed from £${r.from?.toLocaleString('en-GB')} to £${r.to?.toLocaleString('en-GB')} after it was read. Now try to confirm the payment above.`,
        });
      },
    },
    {
      key: 'split',
      label: '5 · Split payment',
      hint: '10 × £99 → rolling limit → Tier 3',
      fn: async () => {
        const r = await post<{ steps: { i: number; tier: number; decision: string; executed: boolean }[]; card: Card | null }>({ scenario: 'split' });
        const line = r.steps.map((s) => `#${s.i}: Tier ${s.tier} ${s.executed ? '✓ paid' : s.decision}`).join('  ·  ');
        const paid = r.steps.filter((s) => s.executed).length;
        push({
          id: uid(),
          role: 'assistant',
          text: `DEMO ATTACK: 10 × £99 to Tom Ellis, each one clicked through.\n${line}\n\nOnly ${paid} went through as one-click Tier 2 payments. After that, the rolling 24 h limits (£250 per payee, £500 in total) escalated every payment to Tier 3: re-type, OTP and cooling-off.`,
          cards: r.card ? [r.card] : [],
        });
      },
    },
    {
      key: 'scam',
      label: '6 · Scam message',
      hint: 'Fake visa fee → high risk + 24 h block',
      fn: async () => {
        const r = await post<{ text: string }>({ scenario: 'message', id: 'scam-01-visa-fee' });
        await send(`Is this a scam? "${r.text}"`);
      },
    },
    { key: 'scampay', label: '6b · …then pay them', hint: 'Related payment → blocked', fn: () => send('Pay Visa Compliance Services Ltd £450') },
    { key: 'shock', label: '7 · Taka −10% shock', hint: 'Runway base vs shock', fn: () => send('How many months will my money last if the taka falls 10%?') },
  ];

  // ?demo=1&run=<key> runs one scenario on load (used for screenshots and recordings).
  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get('run');
    const s = scenarios.find((x) => x.key === key);
    const w = window as unknown as { __demoRan?: boolean };
    if (s && !w.__demoRan) {
      w.__demoRan = true; // StrictMode runs effects twice in dev

      setOpen(false);
      run(s.key, s.fn)();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed bottom-3 left-3 z-40 w-[min(340px,calc(100vw-24px))]">
      <div className="card overflow-hidden border-2 border-dashed border-brand-200 shadow-lg">
        <button className="flex w-full items-center gap-2 bg-brand-50 px-3 py-2 text-left text-sm font-bold text-brand-800" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <FlaskConical className="h-4 w-4" /> Demo mode
          <span className="ml-auto">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}</span>
        </button>
        {open && (
          <div className="max-h-[60vh] space-y-1 overflow-y-auto p-2">
            {scenarios.map((s) => (
              <button key={s.key} disabled={!!busy} onClick={run(s.key, s.fn)} className="flex w-full flex-col rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 disabled:opacity-50">
                <span className="text-sm font-semibold text-slate-800">{busy === s.key ? '…' : s.label}</span>
                <span className="text-[11px] text-slate-500">{s.hint}</span>
              </button>
            ))}
            <button
              disabled={!!busy}
              onClick={run('reset', async () => {
                await post({ scenario: 'reset' });
                reset();
              })}
              className="mt-1 flex w-full items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw className="h-4 w-4" /> Reset sandbox (fresh seed)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
