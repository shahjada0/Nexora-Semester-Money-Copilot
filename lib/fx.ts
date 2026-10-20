import fs from 'node:fs';
import path from 'node:path';
import { now } from './clock';

export interface FxRates {
  base: 'GBP';
  /** Units of each currency per 1 GBP (mid-market). */
  rates: { GBP: 1; BDT: number; USD: number };
  source: string;
  asOf: string;
  live: boolean;
  /** Set when a shock scenario or demo override changed the rates. */
  note?: string;
}

const LIVE_URL = 'https://open.er-api.com/v6/latest/GBP';
const CACHE_MS = 60 * 60 * 1000;

const g = globalThis as unknown as { __fxCache?: { at: number; data: FxRates } };

export function snapshotRates(): FxRates {
  const file = path.join(process.cwd(), 'data', 'fx-snapshot.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { rates: { BDT: number; USD: number }; source: string; asOf: string };
  return { base: 'GBP', rates: { GBP: 1, BDT: raw.rates.BDT, USD: raw.rates.USD }, source: raw.source, asOf: raw.asOf, live: false };
}

/**
 * Live mid-market rates from open.er-api.com (free, no key), cached for an hour.
 * Any failure falls back to the committed snapshot so the demo never breaks.
 */
export async function getRates(): Promise<FxRates> {
  if (process.env.FX_OFFLINE === '1') return snapshotRates();
  const cached = g.__fxCache;
  if (cached && now() - cached.at < CACHE_MS) return cached.data;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(LIVE_URL, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { result?: string; rates?: Record<string, number>; time_last_update_unix?: number };
    const bdt = json.rates?.BDT;
    const usd = json.rates?.USD;
    if (json.result !== 'success' || !bdt || !usd || bdt < 50 || bdt > 500 || usd < 0.5 || usd > 3) throw new Error('unexpected payload');
    const data: FxRates = {
      base: 'GBP',
      rates: { GBP: 1, BDT: bdt, USD: usd },
      source: 'open.er-api.com (ExchangeRate-API, mid-market) — live',
      asOf: new Date((json.time_last_update_unix ?? Math.floor(now() / 1000)) * 1000).toISOString(),
      live: true,
    };
    g.__fxCache = { at: now(), data };
    return data;
  } catch {
    const snap = snapshotRates();
    return { ...snap, note: 'Live rate unavailable — using committed snapshot.' };
  }
}

/** Convert minor units of `currency` to GBP minor units at mid-market. */
export function toGbpMinor(minor: number, currency: 'GBP' | 'BDT' | 'USD', fx: FxRates): number {
  return Math.round(minor / fx.rates[currency]);
}
