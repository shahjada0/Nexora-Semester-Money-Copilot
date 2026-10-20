'use client';

import { useEffect, useMemo, useState } from 'react';
import { Lock, ShieldCheck, Timer, KeyRound, Users } from 'lucide-react';
import { fmt } from '@/lib/money';
import type { Card, ProposalCard } from '@/lib/cards';
import { CardShell, CheckRow, Details, Why, shortHash } from '../ui';
import { useExpert } from '../ViewMode';

export interface ConfirmResult {
  decision: string;
  reasons: string[];
  cards: Card[];
}

export function ProposalView({ c, onResult }: { c: ProposalCard; onResult: (r: ConfirmResult) => void }) {
  const [status, setStatus] = useState<'open' | 'busy' | 'done' | 'cancelled'>('open');
  const [typedAmount, setTypedAmount] = useState('');
  const [typedPayee, setTypedPayee] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string[] | null>(null);
  const [familyLink, setFamilyLink] = useState<string | null>(null);

  // Cooling-off countdown, measured from when this card arrived (avoids client/server clock skew).
  const coolMs = useMemo(() => (c.coolingUntil ? c.coolingUntil - (c.expiresAt - 15 * 60 * 1000) : 0), [c.coolingUntil, c.expiresAt]);
  const [arrived] = useState(() => Date.now());
  const [tick, setTick] = useState(Date.now());
  useEffect(() => {
    if (!coolMs) return;
    const t = setInterval(() => setTick(Date.now()), 250);
    return () => clearInterval(t);
  }, [coolMs]);
  const remaining = Math.max(0, Math.ceil((arrived + coolMs - tick) / 1000));

  // Once a parent link exists, poll the proposal so the student sees the parent's decision live.
  const [familyStatus, setFamilyStatus] = useState<string | null>(c.familyStatus);
  useEffect(() => {
    if (!familyLink || familyStatus === 'approved' || familyStatus === 'rejected') return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/proposal/${c.proposalId}`, { cache: 'no-store' });
      if (r.ok) setFamilyStatus(((await r.json()) as { familyStatus: string | null }).familyStatus);
    }, 2500);
    return () => clearInterval(t);
  }, [familyLink, familyStatus, c.proposalId]);
  const strong = c.requirement.kind === 'strong';
  const expert = useExpert();

  async function confirm() {
    setStatus('busy');
    setError(null);
    const res = await fetch('/api/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ proposalId: c.proposalId, bindingHash: c.bindingHash, ...(strong ? { typedAmount, typedPayeeName: typedPayee, otp } : {}) }),
    });
    const r = (await res.json()) as ConfirmResult;
    if (r.decision === 'allowed') {
      setStatus('done');
      onResult(r);
      return;
    }
    setStatus('open');
    setError(r.reasons);
    // Typos and the waiting timer stay inline; serious stops (tampering, scam blocks, expiry, escalation) also get a card.
    const serious = r.decision === 'escalated' || r.reasons.some((x) => /not what you confirmed|changed after|scam check|registry|expired|already used|cancelled|parent/i.test(x));
    if (serious) onResult(r);
  }

  async function cancel() {
    await fetch('/api/cancel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ proposalId: c.proposalId }) });
    setStatus('cancelled');
    onResult({ decision: 'info', reasons: ['Cancelled'], cards: [] });
  }

  async function askFamily() {
    const res = await fetch('/api/family', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ proposalId: c.proposalId }) });
    const r = (await res.json()) as { link?: string; error?: string; cards?: Card[] };
    if (r.link) {
      setFamilyLink(r.link);
      setFamilyStatus('pending');
    } else if (r.error) setError([r.error]);
  }

  const f = c.funding;
  const closed = status === 'done' || status === 'cancelled';

  return (
    <CardShell
      title={strong ? 'Check and pay' : 'Confirm payment'}
      icon={<Lock className="h-4 w-4 text-brand-600" />}
      tier={c.tier}
      decision={closed ? (status === 'done' ? 'allowed' : 'info') : c.decision}
      auditSeq={c.auditSeq}
    >
      <div className="text-3xl font-bold tabular-nums">{fmt(c.amountMinor, 'GBP')}</div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-base text-slate-700">
        to <b>{c.payee.name}</b>
        {c.payee.verified && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Verified
          </span>
        )}
      </div>
      {f.source === 'acc_bdt' ? (
        <p className="mt-2 text-sm text-slate-600">
          Your family pays <b>{fmt(f.bdtPayMinor, 'BDT')}</b> through {f.providerName}, the cheapest licensed route. That saves {fmt(f.savingVsBankMinor, 'GBP')} compared with a bank.
        </p>
      ) : (
        <p className="mt-2 text-sm text-slate-600">Paid from your {f.label}.</p>
      )}

      <Details label={`Safety checks (${c.checks.filter((x) => x.passed).length} passed)`}>
        {c.checks.length > 0 && <ul>{c.checks.map((l, i) => <CheckRow key={i} passed={l.passed} label={l.label} detail={l.detail} />)}</ul>}
        <p className="mt-2 text-xs text-slate-500">
          {c.payee.sortCode ?? ''} · {c.payee.accountMasked} · ref {c.memo}. This confirmation is locked to fingerprint <code>{shortHash(c.bindingHash)}</code>: if the amount or account changes, the payment stops.
        </p>
      </Details>

      {!closed && strong && (
        <div className="mt-4 space-y-4 rounded-2xl bg-slate-50 p-4">
          <div className="text-sm font-semibold text-slate-900">Big payment: please confirm it’s really you</div>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">1. Type the amount</span>
            <input className="input mt-1 min-h-[44px] text-base" inputMode="decimal" placeholder={(c.amountMinor / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })} value={typedAmount} onChange={(e) => setTypedAmount(e.target.value)} autoComplete="off" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">2. Type who you’re paying</span>
            <input className="input mt-1 min-h-[44px] text-base" placeholder={c.payee.name} value={typedPayee} onChange={(e) => setTypedPayee(e.target.value)} autoComplete="off" />
          </label>
          <label className="block">
            <span className="flex items-center gap-1 text-sm font-medium text-slate-700"><KeyRound className="h-4 w-4" aria-hidden /> 3. Enter the 6-digit code</span>
            <input className="input mt-1 min-h-[44px] font-mono text-base tracking-[0.3em]" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} autoComplete="one-time-code" />
            {c.sandboxOtp && (
              <span className="mt-1 block text-xs text-slate-500">
                Practice code: <b className="font-mono">{c.sandboxOtp}</b> (a real app would text this to your phone)
              </span>
            )}
          </label>
          <div className="flex items-center gap-2 text-sm" aria-live="polite">
            <Timer className="h-4 w-4 text-brand-600" aria-hidden />
            {remaining > 0 ? (
              <span>
                Please wait <b className="tabular-nums">{remaining} s</b>. A short pause protects you from being rushed.
              </span>
            ) : (
              <span className="text-emerald-700">Ready. You can pay now.</span>
            )}
          </div>
          {coolMs > 0 && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div className="h-full bg-brand-600 transition-all" style={{ width: `${100 - (remaining * 1000 * 100) / coolMs}%` }} />
            </div>
          )}
        </div>
      )}

      {(familyLink || c.familyRequired) && !closed && (
        <div
          className={`mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
            familyStatus === 'approved' ? 'bg-emerald-50 text-emerald-800' : familyStatus === 'rejected' ? 'bg-red-50 text-red-800' : 'bg-violet-50 text-violet-900'
          }`}
        >
          <Users className="h-4 w-4 shrink-0" />
          {familyStatus === 'approved'
            ? 'Abbu approved ✓ — you can now complete your confirmation.'
            : familyStatus === 'rejected'
              ? 'Abbu rejected this payment. It has been cancelled.'
              : 'Waiting for Abbu to approve. The payment needs both of you.'}
        </div>
      )}
      {familyLink && familyStatus !== 'approved' && familyStatus !== 'rejected' && (
        <div className="mt-2 rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs">
          Single-use link for Abbu (expires in 24 h):{' '}
          <a href={familyLink} target="_blank" rel="noreferrer" className="break-all font-medium text-violet-800 underline">{familyLink}</a>
        </div>
      )}

      {error && (
        <ul className="mt-3 space-y-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}

      {!closed ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-primary min-h-[44px] px-5 text-base" disabled={status === 'busy' || (strong && (remaining > 0 || !typedAmount || !typedPayee || otp.length < 6))} onClick={confirm}>
            {status === 'busy' ? 'Paying…' : `Pay ${fmt(c.amountMinor, 'GBP')}`}
          </button>
          {strong && c.payee.category === 'tuition' && (
            <button className="btn-ghost min-h-[44px]" onClick={askFamily} disabled={!!familyLink}>
              <Users className="h-4 w-4" aria-hidden /> Ask Abbu to approve
            </button>
          )}
          <button className="btn-ghost min-h-[44px]" onClick={cancel}>Cancel</button>
        </div>
      ) : (
        <div className="mt-3 text-sm font-semibold text-slate-600">{status === 'done' ? 'Paid. Your receipt is below.' : 'Cancelled. Nothing was paid.'}</div>
      )}
      {expert && <Why>{c.why}</Why>}
    </CardShell>
  );
}
