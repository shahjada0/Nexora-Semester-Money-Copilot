import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { freshSandbox, T0 } from './helpers';
import { MESSAGE_DIR } from './fixtures';
import { classifyScam, extractRelated } from '@/lib/scam';
import { computeRunway, monthlySpendMinor, runwayInputs } from '@/lib/runway';
import { snapshotRates } from '@/lib/fx';
import { compareProviders, PROVIDERS, quote } from '@/lib/providers';

beforeEach(() => freshSandbox());

interface Msg {
  id: string;
  label: 'scam' | 'benign';
  text: string;
}
const MESSAGES: Msg[] = JSON.parse(fs.readFileSync(path.join(MESSAGE_DIR, 'messages.json'), 'utf8'));

describe('scam check (rules only, no API key)', () => {
  it('has at least 15 labelled messages', () => {
    expect(MESSAGES.length).toBeGreaterThanOrEqual(15);
  });

  it('flags the fake visa-fee message as high risk', async () => {
    const r = await classifyScam(MESSAGES.find((m) => m.id === 'scam-01-visa-fee')!.text);
    expect(r.risk).toBe('high');
    expect(r.redFlags.length).toBeGreaterThanOrEqual(3);
    expect(r.doInstead.length).toBeGreaterThan(0);
  });

  it('extracts the related account, payee and amount to block', () => {
    const r = extractRelated(MESSAGES.find((m) => m.id === 'scam-01-visa-fee')!.text);
    expect(r.accounts).toContain('70442190');
    expect(r.amountsMinor).toContain(45_000);
    expect(r.payeeNames).toContain('Visa Compliance Services Ltd');
  });

  it('rates the plain university reminder as low risk', async () => {
    const r = await classifyScam(MESSAGES.find((m) => m.id === 'benign-01-university-reminder')!.text);
    expect(r.risk).toBe('low');
  });
});

describe('true cost', () => {
  it('matches the formula Fee + Amount × (Mid − Offered) / Mid', () => {
    const mid = 163.922655;
    const b = quote(630_000, PROVIDERS.find((p) => p.id === 'prov_b')!, mid);
    // markup 0.30% of £6,300 = £18.90, plus £4 fee
    expect(b.fxMarkupCostMinor).toBe(1_890);
    expect(b.trueCostMinor).toBe(2_290);
    const bank = quote(630_000, PROVIDERS.find((p) => p.id === 'bank')!, mid);
    expect(bank.trueCostMinor).toBe(500 + 18_270);
  });

  it('ranks the cheapest true cost first and explains why', () => {
    const c = compareProviders(630_000, 163.92);
    expect(c.cheapest.providerId).toBe('prov_b');
    expect(c.savingVsBankMinor).toBe(18_770 - 2_290);
    expect(c.why).toMatch(/Provider B/);
  });
});

describe('money needed this month', () => {
  it('adds up 30 days of spending, compares with money in the UK, and sizes the family transfer', async () => {
    const { monthlyNeeds } = await import('@/lib/monthly');
    const m = monthlyNeeds(snapshotRates(), T0);
    expect(m.livingMinor).toBe(m.categories.reduce((s, c) => s + c.monthlyMinor, 0));
    expect(m.categories[0].category).toBe('rent');
    expect(m.tuitionDue).toEqual([]); // instalment 2 (30 Nov) is more than 30 days after 18 Oct
    expect(m.shortfallMinor).toBe(Math.max(0, m.totalNeedMinor - m.inUkMinor));
    if (m.shortfallMinor > 0) expect(m.send?.byDate).toBe('2026-10-25');
  });

  it('the planner routes "how much do I need at the end of the month" to it', async () => {
    const { planFor } = await import('@/lib/agent/planner');
    expect(planFor('how much money do i need at the end of the month?', null).calls[0].tool).toBe('monthlyNeeds');
    expect(planFor('How many months will my money last?', null).calls[0].tool).toBe('monthsLeft');
  });
});

describe('months-left runway', () => {
  it('monthly spend is the 90-day average excluding tuition and family transfers', () => {
    expect(monthlySpendMinor(T0)).toBe(Math.round(300_000 / (90 / 30.4375)));
  });

  it('seed scenario: base covers instalment 2, the taka −10% shock does not', () => {
    const r = computeRunway(runwayInputs(snapshotRates(), T0));
    expect(r.nextDeadline?.dueDate).toBe('2026-11-30');
    expect(r.base.runsOutBeforeDeadline).toBe(false);
    expect(r.shock.runsOutBeforeDeadline).toBe(true);
    expect(r.shock.totalGbpMinor).toBeLessThan(r.base.totalGbpMinor);
    expect(r.warning).toMatch(/taka falls 10%/i);
    expect(r.suggestion?.text).toMatch(/^Send ৳/);
    expect(r.suggestion?.byDate).toBe('2026-11-20');
  });
});
