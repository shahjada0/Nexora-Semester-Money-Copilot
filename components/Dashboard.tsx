'use client';

import Link from 'next/link';
import { Wallet, Hourglass, CalendarClock, ScrollText, ShieldBan, Bell } from 'lucide-react';
import { fmt, type Currency } from '@/lib/money';
import type { Dashboard as D } from '@/lib/dashboard';
import { DecisionPill, TierBadge } from './ui';
import { useExpert } from './ViewMode';

function Panel({ title, icon, children, action }: { title: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        <div className="ml-auto">{action}</div>
      </div>
      {children}
    </section>
  );
}

const daysUntil = (iso: string, now: number) => Math.ceil((Date.parse(`${iso}T00:00:00Z`) - now) / 86_400_000);

export function Dashboard({ data }: { data: D | null }) {
  const expert = useExpert();
  if (!data) return <div className="card p-6 text-sm text-slate-500">Loading…</div>;
  const r = data.runway;
  const ic = 'h-5 w-5 text-brand-600';
  const due = data.deadlines.filter((d) => d.status === 'due');
  return (
    <div className="space-y-3">
      {data.triggered.map((a) => (
        <div key={a.id} className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <Bell className="h-4 w-4" aria-hidden /> Good news: £1 = ৳{data.fx.bdtPerGbp.toFixed(2)}, which beats your target of ৳{a.target}. A good day for your family to send money.
        </div>
      ))}

      <Panel title="Your money" icon={<Wallet className={ic} />}>
        <div className="text-3xl font-bold tabular-nums">{fmt(data.totalGbpMinor, 'GBP', { decimals: 0 })}</div>
        <div className="text-xs text-slate-500">all accounts together, in pounds</div>
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {data.accounts.map((a) => (
            <li key={a.id} className="flex items-center py-2">
              <span className="truncate text-slate-600">{a.label}</span>
              <span className="ml-auto pl-2 font-semibold tabular-nums">{fmt(a.balanceMinor, a.currency as Currency)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 text-xs text-slate-500">
          Today £1 = ৳{data.fx.bdtPerGbp.toFixed(2)}
          {expert && (
            <>
              {' '}= ${data.fx.usdPerGbp.toFixed(4)} · <b>{data.fx.live ? 'live' : 'snapshot'}</b> · {data.fx.source.split(' (')[0]} · {new Date(data.fx.asOf).toUTCString().slice(5, 22)} UTC
            </>
          )}
          {data.fx.note && <div className="text-amber-700">{data.fx.note}</div>}
        </div>
      </Panel>

      <Panel title="How long it lasts" icon={<Hourglass className={ic} />}>
        <div className="text-3xl font-bold tabular-nums">
          {r.base.monthsLeft.toFixed(1)} <span className="text-base font-medium text-slate-500">months</span>
        </div>
        <div className="text-sm text-slate-600">{r.shock.monthsLeft.toFixed(1)} months if the taka falls 10%</div>
        {r.warning ? (
          <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{r.warning}</div>
        ) : (
          <div className="mt-2 text-sm text-emerald-700">You’re covered for your next payment.</div>
        )}
        {expert && r.suggestion && <div className="mt-1 text-xs text-slate-600">{r.suggestion.text}</div>}
      </Panel>

      <Panel title="Coming up" icon={<CalendarClock className={ic} />} action={<Link href="/calendar" className="text-sm font-medium text-brand-600">See plan →</Link>}>
        <ul className="space-y-2 text-sm">
          {(expert ? data.deadlines : due).map((d) => (
            <li key={d.label} className="flex items-center gap-2">
              <span className="truncate">{d.label}</span>
              <span className="ml-auto whitespace-nowrap font-semibold tabular-nums">{fmt(d.amountMinor, d.currency as Currency, { decimals: 0 })}</span>
              <span className={`w-20 text-right text-xs ${d.status === 'paid' ? 'text-emerald-600' : 'text-slate-500'}`}>
                {d.status === 'paid' ? 'Paid' : `in ${daysUntil(d.date, data.now)} days`}
              </span>
            </li>
          ))}
          {due.length === 0 && <li className="text-emerald-700">All tuition paid.</li>}
        </ul>
      </Panel>

      {data.blocks.length > 0 && (
        <Panel title="Protecting you" icon={<ShieldBan className="h-5 w-5 text-red-600" />}>
          <p className="text-sm text-slate-700">Payments linked to a scam message are blocked for 24 hours.</p>
          {expert &&
            data.blocks.map((b, i) => (
              <div key={i} className="mt-1 text-xs text-red-700">
                {b.kind.replace('_', ' ')}: <b>{b.value}</b> until {new Date(b.expiresAt).toLocaleString('en-GB')}
              </div>
            ))}
        </Panel>
      )}
      {data.alerts.length > 0 && (
        <Panel title="Rate alerts" icon={<Bell className={ic} />}>
          {data.alerts.map((a) => (
            <div key={a.id} className="text-sm text-slate-700">Tell me when £1 is {a.direction === 'above' ? 'more' : 'less'} than ৳{a.target}</div>
          ))}
        </Panel>
      )}

      {expert && (
        <Panel title="Recent audit events" icon={<ScrollText className={ic} />} action={<Link href="/audit" className="text-xs font-medium text-brand-600">Open log →</Link>}>
          <ul className="space-y-1.5">
            {data.recent.map((e) => (
              <li key={e.seq} className="flex items-center gap-1.5 text-xs">
                <span className="w-7 text-slate-400">#{e.seq}</span>
                <span className="truncate font-medium text-slate-700">{e.action}</span>
                <span className="ml-auto flex items-center gap-1">
                  <TierBadge tier={e.tier} compact />
                  <DecisionPill decision={e.decision} />
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 font-mono text-[10px] text-slate-400">head {data.recent[0]?.hash.slice(0, 16)}…</div>
        </Panel>
      )}
    </div>
  );
}
