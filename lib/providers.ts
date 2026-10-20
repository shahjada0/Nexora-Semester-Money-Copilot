/**
 * Sandbox transfer providers for BDT → GBP. All names are fictional; fee and markup values
 * are modelled on the typical gap between bank and digital channels in the World Bank
 * Remittance Prices Worldwide data, not on any real company's prices.
 * Only licensed, formal channels are modelled. Informal channels (hundi/hawala) are never offered.
 */
import { fmt } from './money';

export interface Provider {
  id: string;
  name: string;
  kind: 'bank' | 'digital';
  /** Flat fee in GBP pence. */
  feeMinor: number;
  /** FX markup versus mid-market, in basis points (100 bps = 1%). */
  markupBps: number;
  speed: string;
  tagline: string;
}

export const PROVIDERS: Provider[] = [
  { id: 'bank', name: 'Traditional bank', kind: 'bank', feeMinor: 500, markupBps: 290, speed: '2–3 working days', tagline: 'Low fee, wide FX margin' },
  { id: 'prov_a', name: 'Provider A', kind: 'digital', feeMinor: 0, markupBps: 180, speed: 'Same day', tagline: '"Zero fees"' },
  { id: 'prov_b', name: 'Provider B', kind: 'digital', feeMinor: 400, markupBps: 30, speed: '1 working day', tagline: 'Near mid-market rate' },
  { id: 'prov_c', name: 'Provider C', kind: 'digital', feeMinor: 1200, markupBps: 50, speed: '1–2 working days', tagline: 'Tuition specialist' },
  { id: 'prov_d', name: 'Provider D', kind: 'digital', feeMinor: 250, markupBps: 120, speed: 'Minutes', tagline: 'Fastest' },
];

export interface Quote {
  providerId: string;
  providerName: string;
  kind: 'bank' | 'digital';
  speed: string;
  tagline: string;
  amountMinor: number; // GBP to arrive
  feeMinor: number;
  markupBps: number;
  /** Mid-market and offered rate, both as BDT per 1 GBP. */
  midBdtPerGbp: number;
  offeredBdtPerGbp: number;
  /** Hidden cost: Amount × (Mid − Offered) / Mid, with rates in GBP per BDT. */
  fxMarkupCostMinor: number;
  trueCostMinor: number;
  /** BDT the family pays for this route (amount + fee at the offered rate). */
  bdtPayMinor: number;
}

/**
 * True cost = Fee + Amount × (MidMarket − Offered) / MidMarket
 * Rates are expressed as GBP received per 1 BDT, so Offered = Mid × (1 − markup)
 * and (Mid − Offered) / Mid = markup.
 */
export function quote(amountMinor: number, p: Provider, midBdtPerGbp: number): Quote {
  const m = p.markupBps / 10_000;
  const midGbpPerBdt = 1 / midBdtPerGbp;
  const offeredGbpPerBdt = midGbpPerBdt * (1 - m);
  const fxMarkupCostMinor = Math.round((amountMinor * (midGbpPerBdt - offeredGbpPerBdt)) / midGbpPerBdt);
  const offeredBdtPerGbp = 1 / offeredGbpPerBdt;
  return {
    providerId: p.id,
    providerName: p.name,
    kind: p.kind,
    speed: p.speed,
    tagline: p.tagline,
    amountMinor,
    feeMinor: p.feeMinor,
    markupBps: p.markupBps,
    midBdtPerGbp,
    offeredBdtPerGbp,
    fxMarkupCostMinor,
    trueCostMinor: p.feeMinor + fxMarkupCostMinor,
    bdtPayMinor: Math.round(((amountMinor + p.feeMinor) / 100) * offeredBdtPerGbp * 100),
  };
}

export interface Comparison {
  amountMinor: number;
  midBdtPerGbp: number;
  quotes: Quote[]; // sorted by true cost, cheapest first
  cheapest: Quote;
  bank: Quote;
  savingVsBankMinor: number;
  savingVsBankPct: number; // of the bank's true cost
  why: string;
}

const pct = (bps: number) => `${(bps / 100).toFixed(1)}%`;

export function compareProviders(amountMinor: number, midBdtPerGbp: number, providers: Provider[] = PROVIDERS): Comparison {
  const quotes = providers.map((p) => quote(amountMinor, p, midBdtPerGbp)).sort((a, b) => a.trueCostMinor - b.trueCostMinor);
  const cheapest = quotes[0];
  const bank = quotes.find((q) => q.kind === 'bank') ?? quotes[quotes.length - 1];
  const savingVsBankMinor = bank.trueCostMinor - cheapest.trueCostMinor;
  const savingVsBankPct = bank.trueCostMinor > 0 ? (savingVsBankMinor / bank.trueCostMinor) * 100 : 0;
  const lowestFee = [...quotes].sort((a, b) => a.feeMinor - b.feeMinor)[0];
  let why: string;
  if (cheapest.providerId === bank.providerId) {
    why = `${bank.providerName} is cheapest for this amount: its total cost is ${fmt(bank.trueCostMinor, 'GBP')}.`;
  } else if (cheapest.feeMinor > lowestFee.feeMinor) {
    why = `${cheapest.providerName} looks pricier at a ${fmt(cheapest.feeMinor, 'GBP')} fee but saves ${fmt(savingVsBankMinor, 'GBP')} because its rate is ${pct(cheapest.markupBps)} from mid-market vs the bank's ${pct(bank.markupBps)}.`;
  } else {
    why = `${cheapest.providerName} saves ${fmt(savingVsBankMinor, 'GBP')} vs the bank: fee ${fmt(cheapest.feeMinor, 'GBP')} and a rate ${pct(cheapest.markupBps)} from mid-market vs the bank's ${pct(bank.markupBps)}.`;
  }
  return { amountMinor, midBdtPerGbp, quotes, cheapest, bank, savingVsBankMinor, savingVsBankPct, why };
}

export function getProvider(id: string): Provider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
