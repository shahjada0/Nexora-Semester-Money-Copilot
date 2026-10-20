/**
 * Months-left runway with a currency-shock scenario.
 *   Months left = Total balance (GBP, mid-market) ÷ Average monthly spending
 * The shock scenario values BDT holdings 10% lower. If either scenario cannot cover the next
 * tuition deadline, we suggest converting BDT now (locking today's rate) before the deadline.
 */
import { getDb } from './db';
import { now } from './clock';
import { getAccounts } from './ledger';
import { compareProviders } from './providers';
import { fmt } from './money';
import type { FxRates } from './fx';
import type { RunwayCard, RunwayScenario } from './cards';

const DAY = 86_400_000;
const AVG_MONTH_DAYS = 30.4375;
export const SPEND_WINDOW_DAYS = 90;
export const SHOCK = 0.1;
const TRANSFER_LEAD_DAYS = 10;
const EXCLUDED = new Set(['tuition', 'family transfer']);

export function monthlySpendMinor(at = now()): number {
  const rows = getDb()
    .prepare(`SELECT category, amount_minor FROM transactions WHERE account_id = 'acc_gbp' AND amount_minor < 0 AND ts > ?`)
    .all(at - SPEND_WINDOW_DAYS * DAY) as { category: string; amount_minor: number }[];
  const spent = rows.filter((r) => !EXCLUDED.has(r.category)).reduce((s, r) => s - r.amount_minor, 0);
  return Math.round(spent / (SPEND_WINDOW_DAYS / AVG_MONTH_DAYS));
}

export interface RunwayInputs {
  gbpMinor: number; // GBP + USD holdings, in GBP
  bdtMinor: number; // BDT holdings in taka minor units
  bdtPerGbp: number;
  monthlySpendMinor: number;
  deadline: { label: string; dueDate: string; amountMinor: number } | null;
  today: number;
}

function scenario(label: string, inp: RunwayInputs, shock: number): RunwayScenario {
  const bdtPerGbp = inp.bdtPerGbp / (1 - shock);
  const totalGbpMinor = inp.gbpMinor + Math.round(inp.bdtMinor / bdtPerGbp);
  const spend = Math.max(inp.monthlySpendMinor, 1);
  const monthsLeft = totalGbpMinor / spend;
  let fundsAtDeadlineMinor = totalGbpMinor;
  let shortfallMinor = 0;
  let afterTuition = monthsLeft;
  if (inp.deadline) {
    const months = Math.max(0, (Date.parse(`${inp.deadline.dueDate}T00:00:00Z`) - inp.today) / DAY / AVG_MONTH_DAYS);
    fundsAtDeadlineMinor = Math.round(totalGbpMinor - spend * months);
    shortfallMinor = Math.max(0, inp.deadline.amountMinor - fundsAtDeadlineMinor);
    afterTuition = (totalGbpMinor - inp.deadline.amountMinor) / spend;
  }
  return {
    label,
    bdtPerGbp,
    totalGbpMinor,
    monthsLeft: Number(monthsLeft.toFixed(2)),
    monthsLeftAfterTuition: Number(afterTuition.toFixed(2)),
    fundsAtDeadlineMinor,
    shortfallMinor,
    runsOutBeforeDeadline: shortfallMinor > 0,
  };
}

export function computeRunway(inp: RunwayInputs): Omit<RunwayCard, 'tier' | 'decision' | 'why' | 'type'> & { why: string } {
  const base = scenario('Today’s rate', inp, 0);
  const shock = scenario('Taka falls 10%', inp, SHOCK);
  const daysAway = inp.deadline ? Math.ceil((Date.parse(`${inp.deadline.dueDate}T00:00:00Z`) - inp.today) / DAY) : 0;
  let warning: string | null = null;
  let suggestion: RunwayCard['suggestion'] = null;

  if (inp.deadline && (base.runsOutBeforeDeadline || shock.runsOutBeforeDeadline)) {
    const which = base.runsOutBeforeDeadline ? 'even at today’s rate' : 'if the taka falls 10%';
    const worst = base.runsOutBeforeDeadline ? base : shock;
    warning = `${which[0].toUpperCase()}${which.slice(1)}, you would be ${fmt(worst.shortfallMinor, 'GBP')} short for ${inp.deadline.label} on ${inp.deadline.dueDate}.`;

    // Converting £P of BDT now removes it from the shock: each £1 converted saves £SHOCK of loss.
    const bdtValueGbp = Math.round(inp.bdtMinor / inp.bdtPerGbp);
    const protectGbp = Math.min(bdtValueGbp, Math.ceil(shock.shortfallMinor / SHOCK / 100) * 100);
    const freshGbp = base.shortfallMinor; // money the family must add on top, if any
    const sendGbp = protectGbp + freshGbp;
    const cheapest = compareProviders(sendGbp, inp.bdtPerGbp).cheapest;
    const byMs = Math.max(inp.today + 2 * DAY, Date.parse(`${inp.deadline.dueDate}T00:00:00Z`) - TRANSFER_LEAD_DAYS * DAY);
    const byDate = new Date(byMs).toISOString().slice(0, 10);
    const sendBdtMinor = Math.round((sendGbp / 100) * cheapest.offeredBdtPerGbp) * 100;
    suggestion = {
      sendBdtMinor,
      byDate,
      atRate: Number(inp.bdtPerGbp.toFixed(2)),
      text: `Send ${fmt(sendBdtMinor, 'BDT')} (≈ ${fmt(sendGbp, 'GBP')}) by ${byDate} while the rate is ৳${inp.bdtPerGbp.toFixed(2)} per £1, via ${cheapest.providerName} (cheapest true cost). ${
        freshGbp > 0 ? `This includes ${fmt(freshGbp, 'GBP')} of new money the family needs to add. ` : ''
      }Converting now locks in today's rate, so a 10% taka fall can no longer leave instalment money short.`,
    };
  }

  const why = warning
    ? `${warning} Monthly spending is ${fmt(inp.monthlySpendMinor, 'GBP')} (last ${SPEND_WINDOW_DAYS} days, excluding tuition).`
    : `Both scenarios cover ${inp.deadline ? `${inp.deadline.label} on ${inp.deadline.dueDate}` : 'your spending'}. Monthly spending is ${fmt(inp.monthlySpendMinor, 'GBP')} (last ${SPEND_WINDOW_DAYS} days, excluding tuition).`;

  return {
    monthlySpendMinor: inp.monthlySpendMinor,
    nextDeadline: inp.deadline ? { ...inp.deadline, daysAway } : null,
    base,
    shock,
    warning,
    suggestion,
    why,
  };
}

export function runwayInputs(fx: FxRates, at = now()): RunwayInputs {
  let gbpMinor = 0;
  let bdtMinor = 0;
  for (const a of getAccounts()) {
    if (a.currency === 'BDT') bdtMinor += a.balance_minor;
    else gbpMinor += Math.round(a.balance_minor / fx.rates[a.currency]);
  }
  const today = new Date(at).toISOString().slice(0, 10);
  const next = getDb()
    .prepare(`SELECT label, due_date, amount_minor FROM tuition_schedule WHERE status = 'due' AND due_date >= ? ORDER BY due_date LIMIT 1`)
    .get(today) as { label: string; due_date: string; amount_minor: number } | undefined;
  return {
    gbpMinor,
    bdtMinor,
    bdtPerGbp: fx.rates.BDT,
    monthlySpendMinor: monthlySpendMinor(at),
    deadline: next ? { label: next.label, dueDate: next.due_date, amountMinor: next.amount_minor } : null,
    today: at,
  };
}
