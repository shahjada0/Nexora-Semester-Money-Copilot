/**
 * "How much money do I need this month?" — the next 30 days of spending (90-day average, by category)
 * plus any tuition due in that window, compared with money already in the UK.
 */
import { getDb } from './db';
import { now } from './clock';
import { getAccounts } from './ledger';
import { compareProviders } from './providers';
import type { FxRates } from './fx';

const DAY = 86_400_000;
const WINDOW_DAYS = 90;
const MONTH_DAYS = 30.4375;
const EXCLUDED = new Set(['tuition', 'family transfer']);

export interface MonthlyNeeds {
  periodEnd: string; // YYYY-MM-DD, 30 days from today
  categories: { category: string; monthlyMinor: number }[];
  livingMinor: number;
  tuitionDue: { label: string; dueDate: string; amountMinor: number }[];
  totalNeedMinor: number;
  inUkMinor: number; // GBP + USD in pounds
  shortfallMinor: number;
  send: { bdtMinor: number; providerName: string; byDate: string } | null;
}

export function monthlyNeeds(fx: FxRates, at = now()): MonthlyNeeds {
  const db = getDb();
  const rows = db
    .prepare(`SELECT category, amount_minor FROM transactions WHERE account_id = 'acc_gbp' AND amount_minor < 0 AND ts > ?`)
    .all(at - WINDOW_DAYS * DAY) as { category: string; amount_minor: number }[];
  const byCat = new Map<string, number>();
  for (const r of rows) if (!EXCLUDED.has(r.category)) byCat.set(r.category, (byCat.get(r.category) ?? 0) - r.amount_minor);
  const factor = WINDOW_DAYS / MONTH_DAYS;
  const categories = [...byCat.entries()].map(([category, total]) => ({ category, monthlyMinor: Math.round(total / factor) })).sort((a, b) => b.monthlyMinor - a.monthlyMinor);
  const livingMinor = categories.reduce((s, c) => s + c.monthlyMinor, 0);

  const today = new Date(at).toISOString().slice(0, 10);
  const end = new Date(at + 30 * DAY).toISOString().slice(0, 10);
  const tuitionDue = (db.prepare(`SELECT label, due_date, amount_minor FROM tuition_schedule WHERE status = 'due' AND due_date >= ? AND due_date <= ? ORDER BY due_date`).all(today, end) as { label: string; due_date: string; amount_minor: number }[]).map((t) => ({ label: t.label, dueDate: t.due_date, amountMinor: t.amount_minor }));

  let inUkMinor = 0;
  for (const a of getAccounts()) if (a.currency !== 'BDT') inUkMinor += Math.round(a.balance_minor / fx.rates[a.currency]);
  const totalNeedMinor = livingMinor + tuitionDue.reduce((s, t) => s + t.amountMinor, 0);
  const shortfallMinor = Math.max(0, totalNeedMinor - inUkMinor);

  let send: MonthlyNeeds['send'] = null;
  if (shortfallMinor > 0) {
    const q = compareProviders(shortfallMinor, fx.rates.BDT).cheapest;
    // Living costs start straight away, so send within a week (or 3 days before tuition, if sooner).
    const firstDue = tuitionDue[0]?.dueDate ? Date.parse(`${tuitionDue[0].dueDate}T00:00:00Z`) - 3 * DAY : Infinity;
    send = {
      bdtMinor: Math.ceil(((shortfallMinor / 100) * q.offeredBdtPerGbp) / 100) * 100 * 100,
      providerName: q.providerName,
      byDate: new Date(Math.max(at + 2 * DAY, Math.min(firstDue, at + 7 * DAY))).toISOString().slice(0, 10),
    };
  }
  return { periodEnd: end, categories, livingMinor, tuitionDue, totalNeedMinor, inUkMinor, shortfallMinor, send };
}
