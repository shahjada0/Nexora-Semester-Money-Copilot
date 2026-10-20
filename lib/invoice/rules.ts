/**
 * Rule-based invoice parser: the fallback when no LLM is available or its output fails
 * validation. Reads labelled fields only ("Sort code: …"), so free text such as
 * "pay account X instead" is never picked up as a bank detail.
 */
import { EMPTY_FIELDS, type InvoiceFields } from './schema';

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');

export function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/(\d{1,2})\s*(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/);
  if (m && MONTHS[m[2].slice(0, 4).toLowerCase()] !== undefined) return `${m[3]}-${pad(MONTHS[m[2].slice(0, 4).toLowerCase()])}-${pad(+m[1])}`;
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[2].slice(0, 3).toLowerCase()])}-${pad(+m[1])}`;
  m = s.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[1].slice(0, 3).toLowerCase()])}-${pad(+m[2])}`;
  m = s.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{4})/); // UK order dd/mm/yyyy
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  return null;
}

/** Value after a label on the same line, e.g. "Sort code: 99-01-23". */
function labelled(text: string, labels: string[], valueRe = '(.+)'): string | null {
  for (const label of labels) {
    const re = new RegExp(`(?:^|\\n|\\s{2,}|\\|)\\s*${label}\\s*[:\\-–]?\\s*${valueRe}`, 'i');
    const m = text.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

const CURRENCY_SYMBOLS: Record<string, InvoiceFields['currency']> = { '£': 'GBP', GBP: 'GBP', $: 'USD', USD: 'USD', '৳': 'BDT', BDT: 'BDT', '€': 'EUR', EUR: 'EUR' };

export function parseInvoiceRules(text: string): InvoiceFields {
  const t = text.replace(/\r/g, '');
  const f: InvoiceFields = { ...EMPTY_FIELDS };

  const name = labelled(t, ['Payee name', 'Payee', 'Pay to', 'Payable to', 'Account name', 'Beneficiary name', 'Beneficiary'], '([^\\n|]+)');
  f.payeeName = name ? name.replace(/\s{2,}.*$/, '').trim() : null;

  const sort = labelled(t, ['Sort code', 'Sort-code', 'Bank sort code'], '(\\d{2}[- ]?\\d{2}[- ]?\\d{2})');
  f.sortCode = sort ? sort.replace(/[ ]/g, '-') : null;

  f.accountNumber = labelled(t, ['Account number', 'Account no\\.?', 'Acct no\\.?', 'A/C number', 'A/C'], '(\\d{6,10})\\b');

  const iban = labelled(t, ['IBAN'], '([A-Z]{2}\\d{2}(?:[ ]?[A-Z0-9]{2,4}){3,8})');
  f.iban = iban ? iban.replace(/\s+/g, '').toUpperCase() : null;

  const amt = labelled(
    t,
    ['Amount due', 'Total amount due', 'Total due', 'Balance due', 'Amount payable', 'Amount to pay', 'Instalment amount', 'Total'],
    '((?:£|GBP|USD|\\$|BDT|৳|€|EUR)?\\s*[\\d,]+(?:\\.\\d{1,2})?\\s*(?:GBP|USD|BDT|EUR)?)',
  );
  if (amt) {
    const m = amt.match(/(£|GBP|USD|\$|BDT|৳|€|EUR)?\s*([\d,]+(?:\.\d{1,2})?)\s*(GBP|USD|BDT|EUR)?/);
    if (m) {
      const n = Number(m[2].replace(/,/g, ''));
      f.amount = Number.isFinite(n) && n > 0 ? n : null;
      const sym = m[1] ?? m[3];
      if (sym) f.currency = CURRENCY_SYMBOLS[sym.toUpperCase()] ?? CURRENCY_SYMBOLS[sym] ?? null;
    }
  }
  if (!f.currency) {
    const cur = labelled(t, ['Currency'], '(GBP|USD|BDT|EUR)');
    f.currency = (cur?.toUpperCase() as InvoiceFields['currency']) ?? (/£/.test(t) ? 'GBP' : null);
  }

  f.dueDate = parseDate(labelled(t, ['Due date', 'Payment due date', 'Payment due', 'Due by', 'Pay by', 'Due'], '([^\\n|]+)'));
  f.studentId = labelled(t, ['Student ID', 'Student number', 'Student no\\.?'], '([A-Z0-9][A-Z0-9-]{3,})');
  f.invoiceNumber = labelled(t, ['Invoice number', 'Invoice no\\.?', 'Invoice #', 'Invoice ref(?:erence)?'], '([A-Z0-9][A-Z0-9-/]{2,})');
  return f;
}
