import { z } from 'zod';
import { getRates } from '../fx';
import { computeRunway, runwayInputs } from '../runway';
import { fmt } from '../money';
import type { MonthlyCard, RunwayCard } from '../cards';
import { monthlyNeeds as calcMonthly } from '../monthly';
import { defineTool } from './types';

export const monthlyNeeds = defineTool({
  name: 'monthlyNeeds',
  description:
    'How much money the student needs over the next 30 days (living costs by category + any tuition due), what is already in the UK, and how much the family should send and by when. Use for "how much do I need this month / at the end of the month / my budget".',
  schema: z.object({}).passthrough(),
  parameters: { type: 'object', properties: {} },
  agentCallable: true,
  async run() {
    const fx = await getRates();
    const m = calcMonthly(fx);
    const why = m.shortfallMinor > 0
      ? `Over the next 30 days you need about ${fmt(m.totalNeedMinor, 'GBP', { decimals: 0 })}, but only ${fmt(m.inUkMinor, 'GBP', { decimals: 0 })} is in the UK.`
      : `Your ${fmt(m.inUkMinor, 'GBP', { decimals: 0 })} in the UK covers the next 30 days (${fmt(m.totalNeedMinor, 'GBP', { decimals: 0 })}).`;
    const card: MonthlyCard = { type: 'monthly', tier: 0, decision: m.shortfallMinor > 0 ? 'escalated' : 'allowed', why, ...m };
    return {
      tier: 0,
      decision: 'allowed',
      reasons: [why],
      cards: [card],
      summary: `Next 30 days (to ${m.periodEnd}): living costs ${fmt(m.livingMinor, 'GBP')} (${m.categories.map((c) => `${c.category} ${fmt(c.monthlyMinor, 'GBP', { decimals: 0 })}`).join(', ')})${m.tuitionDue.length ? ` + tuition ${m.tuitionDue.map((t) => `${fmt(t.amountMinor, 'GBP', { decimals: 0 })} due ${t.dueDate}`).join(', ')}` : ''} = ${fmt(m.totalNeedMinor, 'GBP')}. In the UK now: ${fmt(m.inUkMinor, 'GBP')}. ${m.send ? `Short ${fmt(m.shortfallMinor, 'GBP')}: family should send about ${fmt(m.send.bdtMinor, 'BDT')} via ${m.send.providerName} by ${m.send.byDate}.` : 'No top-up needed.'}`,
      audit: { totalNeedMinor: m.totalNeedMinor, shortfallMinor: m.shortfallMinor },
    };
  },
});

export const monthsLeft = defineTool({
  name: 'monthsLeft',
  description:
    'How many months the money lasts: all balances converted to GBP ÷ average monthly spending, at today’s rate and if the taka falls 10%. Warns if money runs out before the next tuition deadline.',
  schema: z.object({}).passthrough(),
  parameters: { type: 'object', properties: {} },
  agentCallable: true,
  async run() {
    const fx = await getRates();
    const r = computeRunway(runwayInputs(fx));
    const card: RunwayCard = { type: 'runway', tier: 0, decision: r.warning ? 'escalated' : 'allowed', ...r };
    return {
      tier: 0,
      decision: 'allowed',
      reasons: [r.why],
      cards: [card],
      summary: `Months left: ${r.base.monthsLeft} at today's rate, ${r.shock.monthsLeft} if the taka falls 10%. ${
        r.nextDeadline ? `Next deadline ${r.nextDeadline.label} ${fmt(r.nextDeadline.amountMinor, 'GBP')} on ${r.nextDeadline.dueDate}.` : ''
      } ${r.warning ?? 'No shortfall before the next deadline.'} ${r.suggestion?.text ?? ''}`,
      audit: { baseMonths: r.base.monthsLeft, shockMonths: r.shock.monthsLeft, warning: !!r.warning },
    };
  },
});
