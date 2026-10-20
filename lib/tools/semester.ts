import { z } from 'zod';
import { getRates } from '../fx';
import { planSemester, savePlan } from '../semester';
import { fmt } from '../money';
import type { ScheduleCard } from '../cards';
import { defineTool } from './types';

export const planSemesterTool = defineTool({
  name: 'planSemester',
  description:
    'Plan the whole semester: tuition deadlines, suggested family transfer dates (two tranches, finishing 10 days before each deadline), rate-alert targets and the runway warning.',
  schema: z.object({}).passthrough(),
  parameters: { type: 'object', properties: {} },
  agentCallable: true,
  async run() {
    const fx = await getRates();
    const plan = planSemester(fx);
    const saved = savePlan(plan);
    const card: ScheduleCard = {
      type: 'schedule',
      tier: 1,
      decision: 'allowed',
      why: plan.summary,
      items: plan.items
        .filter((i) => i.kind !== 'today')
        .map((i) => ({ date: i.date, label: i.label, kind: i.kind, amountMinor: i.amountMinor, currency: i.currency, status: i.status })),
    };
    return {
      tier: 1,
      decision: 'allowed',
      reasons: [plan.summary],
      cards: [card],
      summary: `${plan.summary} ${plan.items
        .filter((i) => i.kind === 'transfer')
        .map((i) => `${i.date}: ${i.label} ${fmt(i.amountMinor ?? 0, 'BDT')}`)
        .join('; ')}`,
      audit: { suggestedTransfers: saved },
    };
  },
});
