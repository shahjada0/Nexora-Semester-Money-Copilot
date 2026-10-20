'use client';

import { FileText, BarChart3, Wallet, Receipt, OctagonX, Bell, CalendarDays, Users, ShieldAlert, Hourglass, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { fmt, type Currency } from '@/lib/money';
import type {
  AlertCard,
  BalancesCard,
  BlockedCard,
  InvoiceCard,
  MonthlyCard,
  PayeesCard,
  QuotesCard,
  ReceiptCard,
  RunwayCard,
  ScamCard,
  ScheduleCard,
} from '@/lib/cards';
import { CardShell, CheckRow, Details, Warn, Why, shortHash } from '../ui';
import { useExpert } from '../ViewMode';
import { plainStop } from '@/lib/plain';

const ic = 'h-5 w-5 text-brand-600';

/** One big plain-language verdict line. */
function Verdict({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex items-start gap-2 rounded-xl px-3 py-3 text-base font-semibold ${ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
      {ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />}
      <span>{children}</span>
    </div>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-slate-500">{k}</dt>
          <dd className="font-semibold text-slate-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function InvoiceView({ c }: { c: InvoiceCard }) {
  const f = c.fields;
  const safe = c.payeeCheck.ok && c.suspicious.length === 0;
  return (
    <CardShell title="Invoice checked" icon={<FileText className={ic} />} tier={c.tier} decision={c.decision} auditSeq={c.auditSeq}>
      <Verdict ok={safe}>
        {safe
          ? `Safe to pay: the bank details match ${f.payeeName ?? 'the university'}'s official record.`
          : c.suspicious.length > 0
            ? 'Don’t pay this invoice. It contains hidden text trying to trick the app.'
            : 'Don’t pay this invoice. The bank details don’t match the official record.'}
      </Verdict>
      <Facts
        rows={[
          ['Pay to', f.payeeName ?? '—'],
          ['Amount', f.amount !== null ? fmt(Math.round(f.amount * 100), (f.currency ?? 'GBP') as Currency) : '—'],
          ['Due by', f.dueDate ?? '—'],
          ['Account', f.accountNumber ? `ending ${f.accountNumber.slice(-4)}` : f.iban ? `IBAN ending ${f.iban.slice(-4)}` : '—'],
        ]}
      />
      {c.suspicious.length > 0 && (
        <div className="mt-3">
          <Warn tone="red">
            <div className="font-semibold">We found {c.suspicious.length} hidden message{c.suspicious.length > 1 ? 's' : ''} and ignored {c.suspicious.length > 1 ? 'them' : 'it'}:</div>
            <div className="mt-1 italic">“{c.suspicious[0]}”</div>
            <div className="mt-1">Get a clean copy of the invoice from your university portal.</div>
          </Warn>
        </div>
      )}
      <Details>
        <ul>{c.payeeCheck.lines.map((l, i) => <CheckRow key={i} passed={l.passed} label={l.label} detail={l.detail} />)}</ul>
        {c.suspicious.length > 1 && (
          <ul className="mt-2 space-y-1">
            {c.suspicious.map((s, i) => <li key={i} className="rounded bg-red-50 px-2 py-1 font-mono text-xs text-red-900">“{s}”</li>)}
          </ul>
        )}
        <div className="mt-2 space-y-0.5 text-xs text-slate-500">
          <div>Sort code {f.sortCode ?? '—'} · Student ID {f.studentId ?? '—'} · Invoice {f.invoiceNumber ?? '—'}</div>
          <div>Read by: {c.extractor === 'llm' ? 'AI (validated)' : 'offline reader'} · Fingerprint {shortHash(c.fieldsHash)}</div>
        </div>
      </Details>
    </CardShell>
  );
}

export function QuotesView({ c }: { c: QuotesCard }) {
  const expert = useExpert();
  const cmp = c.comparison;
  const max = Math.max(...cmp.quotes.map((q) => q.trueCostMinor), 1);
  const shown = expert ? cmp.quotes : [cmp.cheapest, ...cmp.quotes.filter((q) => q.providerId !== cmp.cheapest.providerId && q.kind === 'bank')];
  return (
    <CardShell title="Cheapest way to send money" icon={<BarChart3 className={ic} />} tier={c.tier} decision={c.decision} auditSeq={c.auditSeq}>
      <div className="text-sm text-slate-600">{c.purpose}</div>
      <div className="mt-2 rounded-xl bg-emerald-50 px-3 py-3 text-base text-emerald-900">
        Use <b>{cmp.cheapest.providerName}</b> and save <b>{fmt(cmp.savingVsBankMinor, 'GBP')}</b> compared with a normal bank.
      </div>
      <ul className="mt-3 space-y-3">
        {shown.map((q) => (
          <li key={q.providerId}>
            <div className="flex items-baseline gap-2 text-sm">
              <span className="font-semibold text-slate-900">{q.providerName}</span>
              <span className="text-xs text-slate-500">{q.speed}</span>
              <span className="ml-auto font-semibold tabular-nums">{fmt(q.trueCostMinor, 'GBP')} total cost</span>
            </div>
            <div className="mt-1 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`Fee ${fmt(q.feeMinor, 'GBP')}, hidden exchange-rate cost ${fmt(q.fxMarkupCostMinor, 'GBP')}`}>
              <div className="h-full bg-brand-700" style={{ width: `${(q.feeMinor / max) * 100}%` }} />
              <div className="h-full bg-amber-400" style={{ width: `${(q.fxMarkupCostMinor / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded bg-brand-700" /> Fee</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded bg-amber-400" /> Hidden cost in the exchange rate</span>
      </div>
      <Why>{cmp.why}</Why>
      <Details label="See every provider and the numbers">
        <ul className="space-y-1 text-xs text-slate-600">
          {cmp.quotes.map((q) => (
            <li key={q.providerId}>
              <b>{q.providerName}</b>: fee {fmt(q.feeMinor, 'GBP')} + rate {(q.markupBps / 100).toFixed(1)}% worse than mid-market ({fmt(q.fxMarkupCostMinor, 'GBP')}) = {fmt(q.trueCostMinor, 'GBP')}. Family pays {fmt(q.bdtPayMinor, 'BDT')}.
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          Real rate £1 = ৳{cmp.midBdtPerGbp.toFixed(2)} ({c.fx.live ? 'live' : 'saved'}, {new Date(c.fx.asOf).toUTCString().slice(5, 22)} UTC). Only licensed services are shown — never hundi.
        </p>
      </Details>
    </CardShell>
  );
}

export function ReceiptView({ c }: { c: ReceiptCard }) {
  return (
    <CardShell title="Payment sent" icon={<Receipt className="h-5 w-5 text-emerald-600" />} tier={c.tier} decision={c.decision} auditSeq={c.auditSeq}>
      <Verdict ok>
        {fmt(c.amountMinor, 'GBP')} paid to {c.payeeName}.
      </Verdict>
      <Facts rows={[['Reference', c.sandboxTxId], ['Date', new Date(c.executedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })]]} />
      {c.funding.source === 'acc_bdt' && <p className="mt-3 text-sm text-slate-600">Your family paid {fmt(c.funding.bdtPayMinor, 'BDT')} through {c.funding.providerName}.</p>}
      <Details label="Technical receipt">
        <div className="text-xs text-slate-500">Confirmation fingerprint {shortHash(c.bindingHash)} · sandbox transaction, no real money moved</div>
      </Details>
    </CardShell>
  );
}

export function BlockedView({ c }: { c: BlockedCard }) {
  return (
    <CardShell title="Payment stopped" icon={<OctagonX className="h-5 w-5 text-red-600" />} tier={c.tier} decision={c.decision} auditSeq={c.auditSeq}>
      <Verdict ok={false}>{plainStop(c.reasons)}</Verdict>
      <p className="mt-2 text-sm text-slate-600">Our safety rules stopped this, not the AI. Nothing was paid.</p>
      {(c.reasons.length > 1 || c.checks.length > 0) && (
        <Details label="Full details">
          <ul className="space-y-1 text-sm text-slate-700">{c.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
          {c.checks.length > 0 && <ul className="mt-2">{c.checks.map((l, i) => <CheckRow key={i} passed={l.passed} label={l.label} detail={l.detail} />)}</ul>}
        </Details>
      )}
    </CardShell>
  );
}

export function ScamView({ c }: { c: ScamCard }) {
  const head = c.risk === 'high' ? 'This looks like a scam.' : c.risk === 'medium' ? 'Be careful — some warning signs.' : 'No scam signs found.';
  const tone = c.risk === 'high' ? 'bg-red-50 text-red-800' : c.risk === 'medium' ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-800';
  return (
    <CardShell title="Scam check" icon={<ShieldAlert className={ic} />} tier={c.tier} decision={c.decision} auditSeq={c.auditSeq}>
      <div className={`flex items-center gap-2 rounded-xl px-3 py-3 text-base font-semibold ${tone}`}>
        {c.risk === 'low' ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : <AlertTriangle className="h-5 w-5" aria-hidden />}
        {head}
      </div>
      {c.redFlags.length > 0 && (
        <>
          <div className="mt-3 text-sm font-semibold text-slate-900">Warning signs</div>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">{c.redFlags.slice(0, 3).map((f, i) => <li key={i}>{f}</li>)}</ul>
        </>
      )}
      <div className="mt-3 text-sm font-semibold text-slate-900">What to do</div>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">{c.doInstead.map((f, i) => <li key={i}>{f}</li>)}</ul>
      {c.blocksPlaced.length > 0 && (
        <p className="mt-3 rounded-xl bg-slate-900 px-3 py-2 text-sm text-white">We’ve blocked payments to this person and account for 24 hours to protect you.</p>
      )}
      {(c.redFlags.length > 3 || c.blocksPlaced.length > 0) && (
        <Details label="Full details">
          {c.redFlags.length > 3 && <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{c.redFlags.slice(3).map((f, i) => <li key={i}>{f}</li>)}</ul>}
          {c.blocksPlaced.map((b, i) => (
            <div key={i} className="text-xs text-slate-600">Blocked {b.kind}: {b.value}</div>
          ))}
          <div className="mt-1 text-xs text-slate-500">Type: {c.category} · checked by {c.classifier === 'llm+rules' ? 'AI + rules (higher risk wins)' : 'rules'}</div>
        </Details>
      )}
    </CardShell>
  );
}

export function RunwayView({ c }: { c: RunwayCard }) {
  const d = c.nextDeadline;
  return (
    <CardShell title="How long your money lasts" icon={<Hourglass className={ic} />} tier={c.tier} decision={c.decision} auditSeq={c.auditSeq}>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-xs text-slate-500">Today</div>
          <div className="text-3xl font-bold tabular-nums">{c.base.monthsLeft.toFixed(1)}</div>
          <div className="text-xs text-slate-500">months</div>
        </div>
        <div className={`rounded-xl p-3 ${c.shock.runsOutBeforeDeadline ? 'bg-amber-50' : 'bg-slate-50'}`}>
          <div className="text-xs text-slate-500">If the taka falls 10%</div>
          <div className="text-3xl font-bold tabular-nums">{c.shock.monthsLeft.toFixed(1)}</div>
          <div className="text-xs text-slate-500">months</div>
        </div>
      </div>
      {c.warning ? (
        <div className="mt-3">
          <Warn>
            <div className="font-semibold">{c.warning}</div>
            {c.suggestion && <div className="mt-1">Tip: ask your family to send {fmt(c.suggestion.sendBdtMinor, 'BDT')} by {c.suggestion.byDate}, while the rate is good.</div>}
          </Warn>
        </div>
      ) : (
        d && <Verdict ok>You have enough for {d.label.toLowerCase()} on {d.dueDate}.</Verdict>
      )}
      <Details label="How we worked this out">
        <p className="text-sm text-slate-600">
          You spend about {fmt(c.monthlySpendMinor, 'GBP', { decimals: 0 })} a month (last 90 days, not counting tuition). All your money together is {fmt(c.base.totalGbpMinor, 'GBP', { decimals: 0 })} today, or {fmt(c.shock.totalGbpMinor, 'GBP', { decimals: 0 })} if the taka falls 10%.
          {d && ` Next payment: ${fmt(d.amountMinor, 'GBP', { decimals: 0 })} on ${d.dueDate} (${d.daysAway} days).`}
        </p>
        {c.suggestion && <p className="mt-2 text-sm text-slate-600">{c.suggestion.text}</p>}
      </Details>
    </CardShell>
  );
}

export function MonthlyView({ c }: { c: MonthlyCard }) {
  const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return (
    <CardShell title="Money you need this month" icon={<Wallet className={ic} />} tier={c.tier} decision={c.decision} auditSeq={c.auditSeq}>
      <div className="text-sm text-slate-500">Next 30 days, until {c.periodEnd}</div>
      <div className="text-3xl font-bold tabular-nums">{fmt(c.totalNeedMinor, 'GBP', { decimals: 0 })}</div>
      <ul className="mt-3 divide-y divide-slate-100 text-sm">
        {c.categories.map((x) => (
          <li key={x.category} className="flex py-1.5">
            <span className="text-slate-700">{label(x.category)}</span>
            <span className="ml-auto tabular-nums">{fmt(x.monthlyMinor, 'GBP', { decimals: 0 })}</span>
          </li>
        ))}
        {c.tuitionDue.map((t) => (
          <li key={t.label} className="flex py-1.5 font-semibold">
            <span>{t.label} (due {t.dueDate})</span>
            <span className="ml-auto tabular-nums">{fmt(t.amountMinor, 'GBP', { decimals: 0 })}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
        <span>Already in the UK</span>
        <b className="tabular-nums">{fmt(c.inUkMinor, 'GBP', { decimals: 0 })}</b>
      </div>
      <div className="mt-3">
        {c.send ? (
          <Warn>
            <div className="font-semibold">You’re about {fmt(c.shortfallMinor, 'GBP', { decimals: 0 })} short.</div>
            <div className="mt-1">Ask your family to send about {fmt(c.send.bdtMinor, 'BDT')} through {c.send.providerName} (cheapest licensed route) by {c.send.byDate}.</div>
          </Warn>
        ) : (
          <Verdict ok>You have enough for the next 30 days.</Verdict>
        )}
      </div>
      <Details label="How we worked this out">
        <p className="text-sm text-slate-600">
          Each line is your average monthly spending from the last 90 days. Tuition is added if it’s due in the next 30 days. “Already in the UK” is your UK account plus US dollar savings in pounds; money in the family account in Dhaka still needs to be sent.
        </p>
      </Details>
    </CardShell>
  );
}

export function BalancesView({ c }: { c: BalancesCard }) {
  return (
    <CardShell title="Your money" icon={<Wallet className={ic} />} tier={c.tier} decision={c.decision} auditSeq={c.auditSeq}>
      <div className="text-3xl font-bold tabular-nums">{fmt(c.totalGbpMinor, 'GBP')}</div>
      <div className="text-xs text-slate-500">in total, in pounds</div>
      <ul className="mt-3 divide-y divide-slate-100 text-sm">
        {c.accounts.map((a) => (
          <li key={a.id} className="flex items-center gap-2 py-2">
            <span className="text-slate-700">{a.label}</span>
            <span className="ml-auto font-semibold tabular-nums">{fmt(a.balanceMinor, a.currency as Currency)}</span>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

export function AlertView({ c }: { c: AlertCard }) {
  return (
    <CardShell title="Rate alert on" icon={<Bell className={ic} />} tier={c.tier} decision={c.decision} auditSeq={c.auditSeq}>
      <p className="text-base">
        We’ll tell you when £1 is worth {c.direction === 'above' ? 'more' : 'less'} than <b>৳{c.target}</b>. Today it’s ৳{c.current.toFixed(2)}.
      </p>
    </CardShell>
  );
}

export function ScheduleView({ c }: { c: ScheduleCard }) {
  return (
    <CardShell title="Your semester plan" icon={<CalendarDays className={ic} />} tier={c.tier} decision={c.decision} auditSeq={c.auditSeq}>
      <p className="mb-3 text-sm text-slate-600">{c.why}</p>
      <ul className="space-y-2 text-sm">
        {c.items.map((i, k) => (
          <li key={k} className="flex gap-3">
            <span className="w-24 shrink-0 tabular-nums text-slate-500">{i.date}</span>
            <span className={i.kind === 'warning' ? 'font-semibold text-red-700' : 'text-slate-800'}>{i.label}</span>
            {i.amountMinor !== undefined && <span className="ml-auto whitespace-nowrap tabular-nums">{fmt(i.amountMinor, (i.currency ?? 'GBP') as Currency, { decimals: 0 })}</span>}
          </li>
        ))}
      </ul>
      <a href="/calendar" className="mt-3 inline-flex min-h-[44px] items-center text-sm font-semibold text-brand-600">Open the full plan →</a>
    </CardShell>
  );
}

export function PayeesView({ c }: { c: PayeesCard }) {
  return (
    <CardShell title="People you can pay" icon={<Users className={ic} />} tier={c.tier} decision={c.decision} auditSeq={c.auditSeq}>
      <ul className="divide-y divide-slate-100 text-sm">
        {c.payees.map((p) => (
          <li key={p.id} className="flex items-center gap-2 py-2">
            <span className="font-medium text-slate-800">{p.name}</span>
            {p.kind === 'institution' && <span className="rounded bg-emerald-50 px-1.5 text-[11px] font-semibold text-emerald-700">Verified</span>}
            {p.isNew && <span className="rounded bg-amber-50 px-1.5 text-[11px] font-semibold text-amber-800">New</span>}
            <span className="ml-auto text-xs text-slate-500">{p.category}</span>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}
