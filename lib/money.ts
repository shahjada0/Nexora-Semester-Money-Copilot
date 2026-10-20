export type Currency = 'GBP' | 'BDT' | 'USD';

const SYMBOL: Record<Currency, string> = { GBP: '£', BDT: '৳', USD: '$' };

export function toMinor(major: number): number {
  return Math.round(major * 100);
}

export function toMajor(minor: number): number {
  return minor / 100;
}

/** "£6,300.00", "৳9,50,000" style formatting (BDT uses the South Asian lakh grouping). */
export function fmt(minor: number, currency: Currency, opts: { decimals?: number } = {}): string {
  const decimals = opts.decimals ?? (currency === 'BDT' ? 0 : 2);
  const major = minor / 100;
  const locale = currency === 'BDT' ? 'en-IN' : 'en-GB';
  const s = Math.abs(major).toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${major < 0 ? '−' : ''}${SYMBOL[currency]}${s}`;
}

export function fmtMajor(major: number, currency: Currency, decimals?: number): string {
  return fmt(Math.round(major * 100), currency, { decimals });
}
