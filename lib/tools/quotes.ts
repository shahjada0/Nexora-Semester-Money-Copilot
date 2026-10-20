import { z } from 'zod';
import { getDb } from '../db';
import { now } from '../clock';
import { getRates } from '../fx';
import { compareProviders } from '../providers';
import { fmt } from '../money';
import { newId } from '../util';
import type { AlertCard, QuotesCard } from '../cards';
import { defineTool } from './types';

const amountGbp = z.number().positive().max(1_000_000);

export const getQuotes = defineTool({
  name: 'getQuotes',
  description:
    'Compare licensed sandbox providers for sending money from Bangladesh (BDT) to the UK (GBP). Returns the true cost (fee + hidden FX markup) of each, cheapest first.',
  schema: z.object({ amount: amountGbp, purpose: z.string().max(80).optional() }).passthrough(),
  parameters: {
    type: 'object',
    properties: {
      amount: { type: 'number', description: 'Amount to arrive, in GBP' },
      purpose: { type: 'string', description: 'e.g. "tuition instalment 2"' },
    },
    required: ['amount'],
  },
  agentCallable: true,
  async run(params) {
    const fx = await getRates();
    const amountMinor = Math.round(params.amount * 100);
    const cmp = compareProviders(amountMinor, fx.rates.BDT);
    const card: QuotesCard = {
      type: 'quotes',
      tier: 1,
      decision: 'allowed',
      why: cmp.why,
      comparison: cmp,
      fx: { source: fx.source, asOf: fx.asOf, live: fx.live },
      purpose: params.purpose ?? `Send ${fmt(amountMinor, 'GBP')} from BDT`,
    };
    return {
      tier: 1,
      decision: 'allowed',
      reasons: [cmp.why],
      cards: [card],
      summary: `${cmp.quotes.map((q) => `${q.providerName}: fee ${fmt(q.feeMinor, 'GBP')} + FX markup ${fmt(q.fxMarkupCostMinor, 'GBP')} = true cost ${fmt(q.trueCostMinor, 'GBP')}`).join('; ')}. ${cmp.why} Only licensed channels are shown; never suggest informal channels such as hundi.`,
      audit: { amountMinor, cheapest: cmp.cheapest.providerId, savingVsBankMinor: cmp.savingVsBankMinor, midBdtPerGbp: fx.rates.BDT },
    };
  },
});

export const computeTrueCost = defineTool({
  name: 'computeTrueCost',
  description: 'Compute the true cost of one transfer offer: Fee + Amount × (MidMarket − Offered) / MidMarket. Rates as BDT per 1 GBP.',
  schema: z
    .object({ amount: amountGbp, feeGbp: z.number().min(0).max(1000), offeredBdtPerGbp: z.number().positive().max(1000) })
    .passthrough(),
  parameters: {
    type: 'object',
    properties: {
      amount: { type: 'number', description: 'Amount to arrive in GBP' },
      feeGbp: { type: 'number', description: 'Flat fee in GBP' },
      offeredBdtPerGbp: { type: 'number', description: 'Offered rate: taka charged per 1 GBP' },
    },
    required: ['amount', 'feeGbp', 'offeredBdtPerGbp'],
  },
  agentCallable: true,
  async run(params) {
    const fx = await getRates();
    const mid = fx.rates.BDT;
    // In GBP-per-BDT terms: mid = 1/midBdt, offered = 1/offeredBdt.
    const markup = (1 / mid - 1 / params.offeredBdtPerGbp) / (1 / mid);
    const amountMinor = Math.round(params.amount * 100);
    const fxCost = Math.round(amountMinor * markup);
    const total = Math.round(params.feeGbp * 100) + fxCost;
    const why = `Hidden FX markup is ${(markup * 100).toFixed(2)}% (${fmt(fxCost, 'GBP')}) on top of the ${fmt(Math.round(params.feeGbp * 100), 'GBP')} fee.`;
    return {
      tier: 1,
      decision: 'allowed',
      reasons: [why],
      cards: [],
      summary: `True cost = ${fmt(total, 'GBP')}. ${why} Mid-market £1 = ৳${mid.toFixed(2)}.`,
      audit: { amountMinor, trueCostMinor: total, markupPct: Number((markup * 100).toFixed(3)) },
    };
  },
});

export const setRateAlert = defineTool({
  name: 'setRateAlert',
  description: 'Set a rate alert, e.g. "tell me when GBP/BDT is better than 165" (better = more taka per pound for the family = above).',
  schema: z
    .object({ target: z.number().positive().max(1000), direction: z.enum(['above', 'below']).default('above'), note: z.string().max(120).optional() })
    .passthrough(),
  parameters: {
    type: 'object',
    properties: {
      target: { type: 'number', description: 'Target GBP/BDT rate (taka per pound)' },
      direction: { type: 'string', enum: ['above', 'below'], description: 'Alert when the rate goes above or below the target' },
      note: { type: 'string' },
    },
    required: ['target'],
  },
  agentCallable: true,
  async run(params) {
    const fx = await getRates();
    const id = newId('alert');
    getDb()
      .prepare('INSERT INTO rate_alerts(id, base, quote, direction, target, note, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(id, 'GBP', 'BDT', params.direction, params.target, params.note ?? null, now());
    const current = fx.rates.BDT;
    const gapPct = ((params.target - current) / current) * 100;
    const why =
      params.direction === 'above'
        ? `You'll be alerted when £1 buys more than ৳${params.target} (now ৳${current.toFixed(2)}, ${gapPct >= 0 ? `${gapPct.toFixed(2)}% away` : 'already met'}). A better rate means the family sends fewer taka for the same pounds.`
        : `You'll be alerted when £1 falls below ৳${params.target} (now ৳${current.toFixed(2)}).`;
    const card: AlertCard = { type: 'alert', tier: 1, decision: 'allowed', why, alertId: id, pair: 'GBP/BDT', direction: params.direction, target: params.target, current };
    return { tier: 1, decision: 'allowed', reasons: [why], cards: [card], summary: `Rate alert set (id ${id}). ${why}`, audit: { alertId: id, target: params.target, direction: params.direction } };
  },
});
