'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { Download, ShieldCheck, ShieldX, Loader2 } from 'lucide-react';
import { Header } from '@/components/Header';
import { DecisionPill, TierBadge } from '@/components/ui';
import { useExpert } from '@/components/ViewMode';

interface Rec {
  seq: number;
  ts: string;
  actor: string;
  action: string;
  tier: number | null;
  decision: string;
  reason: string;
  data: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

interface Verify {
  ok: boolean;
  count: number;
  headHash: string;
  firstBadSeq: number | null;
  problem: string | null;
  jsonl: { present: boolean; count: number; matchesDb: boolean };
}

const FILTERS = ['all', 'blocked', 'escalated', 'needs_confirmation', 'allowed'] as const;

export default function AuditPage() {
  const [records, setRecords] = useState<Rec[] | null>(null);
  const [verify, setVerify] = useState<Verify | null>(null);
  const [checking, setChecking] = useState(false);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const [openSeq, setOpenSeq] = useState<number | null>(null);
  const expert = useExpert();

  const load = useCallback(async () => {
    const r = await fetch('/api/audit', { cache: 'no-store' });
    setRecords((await r.json()).records);
  }, []);
  useEffect(() => {
    load();
    const m = window.location.hash.match(/seq-(\d+)/);
    if (m) setOpenSeq(Number(m[1]));
    if (new URLSearchParams(window.location.search).get('verify') === '1') runVerify();
  }, [load]);
  useEffect(() => {
    if (openSeq && records) document.getElementById(`seq-${openSeq}`)?.scrollIntoView({ block: 'center' });
  }, [openSeq, records]);

  async function runVerify() {
    setChecking(true);
    const r = await fetch('/api/audit?verify=1', { cache: 'no-store' });
    setVerify(await r.json());
    setChecking(false);
  }

  const shown = (records ?? []).filter((r) => filter === 'all' || r.decision === filter);
  const counts = (records ?? []).reduce<Record<string, number>>((acc, r) => ((acc[r.decision] = (acc[r.decision] ?? 0) + 1), acc), {});

  return (
    <div>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h1 className="text-xl font-bold">{expert ? 'Audit log' : 'Activity'}</h1>
            {expert ? (
              <p className="text-sm text-slate-600">
                Every tool call and its result, append-only and hash-chained: <code className="text-xs">hash = sha256(prevHash + canonicalJSON(entry))</code>. This is our execution evidence.
              </p>
            ) : (
              <p className="text-sm text-slate-600">Everything the app did, in order, including what it stopped. Tap “Verify integrity” to prove nothing has been changed.</p>
            )}
          </div>
          <button className="btn-primary" onClick={runVerify} disabled={checking}>
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Verify integrity
          </button>
          <a className="btn-ghost" href="/api/audit?export=1">
            <Download className="h-4 w-4" /> Export audit log (.jsonl)
          </a>
        </div>

        {verify && (
          <div className={`mt-4 flex items-start gap-3 rounded-2xl border p-4 ${verify.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'}`}>
            {verify.ok ? <ShieldCheck className="h-6 w-6 shrink-0" /> : <ShieldX className="h-6 w-6 shrink-0" />}
            <div className="text-sm">
              <div className="font-bold">{verify.ok ? `Chain verified: ${verify.count} entries, no gaps, no edits.` : `Chain FAILED at entry #${verify.firstBadSeq}: ${verify.problem}`}</div>
              <div className="mt-0.5">
                SQLite and JSONL mirror {verify.jsonl.present ? (verify.jsonl.matchesDb ? `match (${verify.jsonl.count} lines)` : `differ (${verify.jsonl.count} lines)`) : 'mirror not used (in-memory)'}. Head hash <code className="break-all text-xs">{verify.headHash}</code>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${filter === f ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200'}`}>
              {f.replace('_', ' ')} {f !== 'all' && counts[f] ? `(${counts[f]})` : f === 'all' && records ? `(${records.length})` : ''}
            </button>
          ))}
        </div>

        <div className="card mt-3 overflow-x-auto">
          {!records ? (
            <div className="p-6 text-sm text-slate-500">Loading…</div>
          ) : (
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Time (UTC)</th>
                  <th className="px-3 py-2">Actor</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Tier</th>
                  <th className="px-3 py-2">Decision</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2">Hash</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <Fragment key={r.seq}>
                    <tr
                      id={`seq-${r.seq}`}
                      onClick={() => setOpenSeq(openSeq === r.seq ? null : r.seq)}
                      className={`cursor-pointer border-t border-slate-100 align-top hover:bg-slate-50 ${openSeq === r.seq ? 'bg-brand-50/50' : ''}`}
                    >
                      <td className="px-3 py-2 text-slate-400">{r.seq}</td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-500">{r.ts.slice(0, 19).replace('T', ' ')}</td>
                      <td className="px-3 py-2">{r.actor}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.action}</td>
                      <td className="px-3 py-2"><TierBadge tier={r.tier} compact /></td>
                      <td className="px-3 py-2"><DecisionPill decision={r.decision} /></td>
                      <td className="max-w-md px-3 py-2 text-slate-700"><div className="line-clamp-2">{r.reason}</div></td>
                      <td className="px-3 py-2 font-mono text-[11px] text-slate-500">{r.hash.slice(0, 12)}…</td>
                    </tr>
                    {openSeq === r.seq && (
                      <tr className="bg-slate-50">
                        <td colSpan={8} className="px-3 py-3">
                          <div className="text-xs text-slate-600">{r.reason}</div>
                          <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] text-slate-100">{JSON.stringify(r, null, 2)}</pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
