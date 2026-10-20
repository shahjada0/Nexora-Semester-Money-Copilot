/**
 * Semester planner: one timeline of tuition deadlines, suggested family transfers, rate-alert
 * targets and the runway warning. Transfers are split into two tranches (D−28 and D−14) and
 * finish 10 days before each deadline, so the family is never forced to convert everything on
 * one bad-rate day right before a deadline.
 */
import { getDb } from './db';
import { now } from './clock';
import { compareProviders } from './providers';
import { computeRunway, runwayInputs } from './runway';
import { fmt } from './money';
import type { FxRates } from './fx';

const DAY = 86_400_000;
const MONTH_DAYS = 30.4375;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export type PlanKind = 'tuition' | 'transfer' | 'alert' | 'warning' | 'today';

export interface PlanItem {
  date: string;
  kind: PlanKind;
  label: string;
  amountMinor?: number;
  currency?: 'GBP' | 'BDT';
  status?: string;
  why?: string;
}

export interface SemesterPlan {
  items: PlanItem[];
  summary: string;
  bdtPerGbp: number;
}

export function planSemester(fx: FxRates, at = now()): SemesterPlan {
  const db = getDb();
  const inp = runwayInputs(fx, at);
  const rw = computeRunway(inp);
  const mid = fx.rates.BDT;
  const today = iso(at);
  const items: PlanItem[] = [{ date: today, kind: 'today', label: 'Today', why: `£1 = ৳${mid.toFixed(2)} (mid-market).` }];

  const tuition = db.prepare('SELECT label, due_date, amount_minor, status FROM tuition_schedule ORDER BY due_date').all() as { label: string; due_date: string; amount_minor: number; status: string }[];

  // Walk forward through the due instalments, tracking GBP-side money and BDT still at home.
  let gbpSide = inp.gbpMinor; // GBP + USD (in GBP)
  let bdtHome = inp.bdtMinor;
  let cursor = at;
  let topUpNeeded = 0;
  for (const t of tuition) {
    items.push({ date: t.due_date, kind: 'tuition', label: t.label, amountMinor: t.amount_minor, currency: 'GBP', status: t.status });
    if (t.status !== 'due' || t.due_date < today) continue;

    const due = Date.parse(`${t.due_date}T00:00:00Z`);
    const months = Math.max(0, (due - cursor) / DAY / MONTH_DAYS);
    gbpSide -= Math.round(inp.monthlySpendMinor * months); // living costs until this deadline
    cursor = due;
    // If living costs already pushed the UK side negative, the transfer must cover that gap too.
    const needGbp = Math.max(0, t.amount_minor - gbpSide);
    if (needGbp === 0) {
      gbpSide -= t.amount_minor;
      continue;
    }
    const q = compareProviders(needGbp, mid).cheapest;
    const needBdt = Math.round((needGbp / 100) * q.offeredBdtPerGbp) * 100;
    const fromHome = Math.min(needBdt, bdtHome);
    const fresh = needBdt - fromHome;
    bdtHome -= fromHome;
    topUpNeeded += fresh;
    gbpSide = gbpSide + needGbp - t.amount_minor;

    const latest = due - 10 * DAY;
    const d1 = Math.max(at + 2 * DAY, due - 28 * DAY);
    const d2 = Math.max(d1 + 3 * DAY, Math.min(due - 14 * DAY, latest));
    const half = Math.round(needBdt / 2 / 100) * 100;
    const src = fresh > 0 ? `${fmt(fromHome, 'BDT')} from the student-file account + ${fmt(fresh, 'BDT')} new money from the family` : 'from the family student-file account';
    const why = `Covers ${t.label.toLowerCase()} (${fmt(needGbp, 'GBP')} not already in the UK) via ${q.providerName}, cheapest true cost today. Two dates instead of one halve the risk of converting everything on a bad-rate day; finishing 10 days early leaves time for the transfer. Source: ${src}.`;
    items.push({ date: iso(d1), kind: 'transfer', label: `Family sends part 1 of 2 for ${t.label.toLowerCase()}`, amountMinor: half, currency: 'BDT', status: 'suggested', why });
    items.push({ date: iso(d2), kind: 'transfer', label: `Family sends part 2 of 2 for ${t.label.toLowerCase()}`, amountMinor: needBdt - half, currency: 'BDT', status: 'suggested', why });
  }

  const alerts = db.prepare('SELECT direction, target, created_at, triggered_at FROM rate_alerts ORDER BY created_at').all() as { direction: string; target: number; created_at: number; triggered_at: number | null }[];
  for (const a of alerts) {
    items.push({
      date: iso(a.triggered_at ?? a.created_at),
      kind: 'alert',
      label: `Rate target: £1 ${a.direction === 'above' ? '≥' : '≤'} ৳${a.target}${a.triggered_at ? ' — hit' : ' (watching)'}`,
      status: a.triggered_at ? 'hit' : 'active',
      why: `If the rate reaches ৳${a.target} before a tranche date, send that tranche early.`,
    });
  }

  if (rw.warning && rw.nextDeadline) {
    items.push({ date: rw.nextDeadline.dueDate, kind: 'warning', label: 'Money may run short', why: `${rw.warning} ${rw.suggestion?.text ?? ''}` });
  }
  if (topUpNeeded > 0) {
    const last = tuition.filter((t) => t.status === 'due').pop();
    if (last) items.push({ date: last.due_date, kind: 'warning', label: `Family needs to add about ${fmt(topUpNeeded, 'BDT')} of new money before this deadline`, why: 'The student-file balance at home does not cover every remaining instalment plus living costs at today’s rate.' });
  }

  items.sort((a, b) => a.date.localeCompare(b.date) || order(a.kind) - order(b.kind));
  const transfers = items.filter((i) => i.kind === 'transfer');
  const summary = transfers.length
    ? `${transfers.length} transfer dates suggested, each at least 10 days before its deadline.${topUpNeeded > 0 ? ` New money needed from home: about ${fmt(topUpNeeded, 'BDT')}.` : ''}`
    : 'No transfers needed before the remaining deadlines.';
  return { items, summary, bdtPerGbp: mid };
}

const order = (k: PlanKind) => ['today', 'alert', 'transfer', 'warning', 'tuition'].indexOf(k);

/** Persist suggested transfers (replacing earlier suggestions) so the dashboard and schedule show them. */
export function savePlan(plan: SemesterPlan): number {
  const db = getDb();
  const transfers = plan.items.filter((i) => i.kind === 'transfer');
  db.transaction(() => {
    db.prepare(`DELETE FROM planned_transfers WHERE status = 'suggested'`).run();
    const ins = db.prepare('INSERT INTO planned_transfers(id, label, date, amount_minor, currency, status) VALUES (?,?,?,?,?,?)');
    transfers.forEach((t, i) => ins.run(`pt_${i + 1}`, t.label, t.date, t.amountMinor ?? 0, t.currency ?? 'BDT', 'suggested'));
  })();
  return transfers.length;
}
