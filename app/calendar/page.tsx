import { Header } from '@/components/Header';
import { getRates } from '@/lib/fx';
import { planSemester, type PlanItem } from '@/lib/semester';
import { computeRunway, runwayInputs } from '@/lib/runway';
import { fmt } from '@/lib/money';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Semester plan · Semester Money Copilot' };

const DOT: Record<PlanItem['kind'], string> = {
  today: 'bg-slate-400',
  tuition: 'bg-brand-700',
  transfer: 'bg-emerald-500',
  alert: 'bg-amber-400',
  warning: 'bg-red-500',
};
const LABEL: Record<PlanItem['kind'], string> = { today: 'Today', tuition: 'Tuition deadline', transfer: 'Suggested transfer', alert: 'Rate target', warning: 'Warning' };

export default async function CalendarPage() {
  const fx = await getRates();
  const plan = planSemester(fx);
  const rw = computeRunway(runwayInputs(fx));
  const byMonth = new Map<string, PlanItem[]>();
  for (const i of plan.items) {
    const k = i.date.slice(0, 7);
    byMonth.set(k, [...(byMonth.get(k) ?? []), i]);
  }
  return (
    <div>
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h1 className="text-xl font-bold">Semester plan</h1>
            <p className="text-sm text-slate-600">{plan.summary}</p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-slate-600">
            {(Object.keys(LABEL) as PlanItem['kind'][]).map((k) => (
              <span key={k} className="inline-flex items-center gap-1">
                <span className={`h-2.5 w-2.5 rounded-full ${DOT[k]}`} /> {LABEL[k]}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="card p-3">
            <div className="label">Months left today</div>
            <div className="text-2xl font-bold">{rw.base.monthsLeft.toFixed(1)}</div>
          </div>
          <div className={`card p-3 ${rw.shock.runsOutBeforeDeadline ? 'border-amber-300 bg-amber-50' : ''}`}>
            <div className="label">If the taka falls 10%</div>
            <div className="text-2xl font-bold">{rw.shock.monthsLeft.toFixed(1)}</div>
          </div>
          <div className="card p-3">
            <div className="label">Rate now</div>
            <div className="text-2xl font-bold">৳{plan.bdtPerGbp.toFixed(2)}</div>
            <div className="text-[11px] text-slate-500">per £1 · {fx.live ? 'live' : 'snapshot'}</div>
          </div>
        </div>

        <ol className="relative mt-6 border-l-2 border-slate-200 pl-6">
          {[...byMonth.entries()].map(([month, items]) => (
            <li key={month} className="mb-6">
              <div className="-ml-6 mb-2 inline-block rounded-lg bg-slate-800 px-2 py-0.5 text-xs font-bold text-white">
                {new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
              </div>
              <ul className="space-y-2">
                {items.map((i, idx) => (
                  <li key={idx} className="relative">
                    <span className={`absolute -left-[31px] top-3 h-3 w-3 rounded-full ring-4 ring-slate-50 ${DOT[i.kind]}`} />
                    <div className={`card px-4 py-2.5 ${i.kind === 'warning' ? 'border-red-200 bg-red-50' : i.kind === 'today' ? 'bg-slate-50' : ''}`}>
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="w-24 text-xs tabular-nums text-slate-500">{i.date}</span>
                        <span className="font-semibold text-slate-800">{i.label}</span>
                        {i.amountMinor !== undefined && <span className="ml-auto font-semibold tabular-nums">{fmt(i.amountMinor, i.currency ?? 'GBP', { decimals: 0 })}</span>}
                        {i.status && <span className={`text-[10px] font-bold uppercase ${i.status === 'paid' || i.status === 'hit' ? 'text-emerald-600' : 'text-amber-700'}`}>{i.status}</span>}
                      </div>
                      {i.why && i.kind !== 'today' && (
                        <details className="mt-1 text-sm text-slate-600">
                          <summary className="min-h-[32px] cursor-pointer text-xs font-medium text-brand-600">Why?</summary>
                          <p className="mt-1">{i.why}</p>
                        </details>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
        <p className="text-xs text-slate-500">Sandbox plan. Transfer amounts use today&apos;s mid-market rate and the cheapest licensed sandbox provider; ask the agent “plan my semester” to save it.</p>
      </main>
    </div>
  );
}
