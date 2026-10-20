'use client';

import type { ReactNode } from 'react';
import { Check, X, AlertTriangle, Info, ShieldCheck, ShieldAlert, ShieldX, ChevronRight } from 'lucide-react';
import { useExpert } from './ViewMode';

export type DecisionKind = 'allowed' | 'needs_confirmation' | 'escalated' | 'blocked' | 'info';

const TIER_STYLE: Record<number, string> = {
  0: 'bg-slate-100 text-slate-700 ring-slate-200',
  1: 'bg-brand-50 text-brand-700 ring-brand-100',
  2: 'bg-violet-50 text-violet-700 ring-violet-200',
  3: 'bg-brand-900 text-white ring-brand-900',
};
const TIER_NAME: Record<number, string> = { 0: 'Read', 1: 'Suggest', 2: 'Small payment', 3: 'Big payment' };

export function TierBadge({ tier, compact = false }: { tier: number | null | undefined; compact?: boolean }) {
  if (tier === null || tier === undefined) return <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200">SYS</span>;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${TIER_STYLE[tier]}`} title={`Tier ${tier}: ${TIER_NAME[tier]}`}>
      Tier {tier}
      {!compact && <span className="font-medium normal-case tracking-normal opacity-80">· {TIER_NAME[tier]}</span>}
    </span>
  );
}

const DECISION: Record<DecisionKind, { label: string; cls: string; Icon: typeof Check }> = {
  allowed: { label: 'Allowed', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', Icon: ShieldCheck },
  needs_confirmation: { label: 'Needs your OK', cls: 'bg-amber-50 text-amber-800 ring-amber-200', Icon: ShieldAlert },
  escalated: { label: 'Escalated', cls: 'bg-amber-50 text-amber-800 ring-amber-200', Icon: ShieldAlert },
  blocked: { label: 'Blocked', cls: 'bg-red-50 text-red-700 ring-red-200', Icon: ShieldX },
  info: { label: 'Info', cls: 'bg-slate-50 text-slate-600 ring-slate-200', Icon: Info },
};

export function DecisionPill({ decision }: { decision: string }) {
  const d = DECISION[(decision as DecisionKind) in DECISION ? (decision as DecisionKind) : 'info'];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${d.cls}`}>
      <d.Icon className="h-3 w-3" aria-hidden />
      {d.label}
    </span>
  );
}

export function decisionBorder(decision: string): string {
  if (decision === 'blocked') return 'border-red-200';
  if (decision === 'escalated' || decision === 'needs_confirmation') return 'border-amber-200';
  if (decision === 'allowed') return 'border-emerald-200';
  return 'border-slate-200';
}

export function Why({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-700">
      <span className="font-semibold text-slate-900">Why: </span>
      {children}
    </p>
  );
}

/** Progressive disclosure: closed in Simple view, open in Expert view. */
export function Details({ label = 'How we checked this', children }: { label?: string; children: ReactNode }) {
  const expert = useExpert();
  return (
    <details className="group mt-3 rounded-xl border border-slate-200" open={expert || undefined}>
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ChevronRight className="h-4 w-4 transition-transform duration-200 group-open:rotate-90" aria-hidden />
        {label}
      </summary>
      <div className="border-t border-slate-100 px-3 py-2">{children}</div>
    </details>
  );
}

const PLAIN: Record<string, { label: string; cls: string }> = {
  allowed: { label: 'OK', cls: 'bg-emerald-50 text-emerald-700' },
  needs_confirmation: { label: 'Needs your OK', cls: 'bg-amber-50 text-amber-800' },
  escalated: { label: 'Heads up', cls: 'bg-amber-50 text-amber-800' },
  blocked: { label: 'Stopped', cls: 'bg-red-50 text-red-700' },
  info: { label: 'Info', cls: 'bg-slate-100 text-slate-600' },
};

export function CardShell({
  title,
  icon,
  tier,
  decision,
  auditSeq,
  children,
  className = '',
}: {
  title: ReactNode;
  icon?: ReactNode;
  tier: number;
  decision: string;
  auditSeq?: number;
  children: ReactNode;
  className?: string;
}) {
  const expert = useExpert();
  const plain = PLAIN[decision] ?? PLAIN.info;
  return (
    <div className={`card overflow-hidden border ${decisionBorder(decision)} ${className}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
        {icon}
        <div className="mr-auto text-base font-semibold text-slate-900">{title}</div>
        {expert ? (
          <>
            <TierBadge tier={tier} />
            <DecisionPill decision={decision} />
            {auditSeq !== undefined && (
              <a href={`/audit#seq-${auditSeq}`} className="text-[10px] font-medium text-slate-400 hover:text-brand-600" title="Open this event in the audit log">
                #{auditSeq}
              </a>
            )}
          </>
        ) : (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${plain.cls}`} title={`Safety level ${tier}`}>
            {plain.label}
          </span>
        )}
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

export function CheckRow({ passed, label, detail }: { passed: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-2 py-1 text-sm">
      {passed ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="passed" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-label="failed" />}
      <span className="font-medium text-slate-700">{label}</span>
      <span className="ml-auto text-right text-slate-500">{detail}</span>
    </li>
  );
}

export function Warn({ tone = 'amber', children }: { tone?: 'amber' | 'red'; children: ReactNode }) {
  const cls = tone === 'red' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900';
  return (
    <div className={`flex gap-2 rounded-xl border px-3 py-2 text-sm ${cls}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export const shortHash = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;
