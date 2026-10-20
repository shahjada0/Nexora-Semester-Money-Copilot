import { z } from 'zod';

const nullableString = z.string().trim().min(1).nullable();

/** Structured fields only. Everything an LLM returns is parsed through this. */
export const InvoiceFieldsSchema = z.object({
  payeeName: nullableString,
  sortCode: z
    .string()
    .trim()
    .regex(/^\d{2}[- ]?\d{2}[- ]?\d{2}$/, 'sort code must be 6 digits, e.g. 12-34-56')
    .nullable(),
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{6,10}$/, 'account number must be 6–10 digits')
    .nullable(),
  iban: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}\d{2}[A-Z0-9 ]{10,34}$/i, 'IBAN format')
    .nullable(),
  amount: z.number().positive().max(1_000_000).nullable(),
  currency: z.enum(['GBP', 'USD', 'BDT', 'EUR']).nullable(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be YYYY-MM-DD')
    .nullable(),
  studentId: nullableString,
  invoiceNumber: nullableString,
});

export const InvoiceExtractionSchema = InvoiceFieldsSchema.extend({
  /** Imperative text aimed at the reader/agent. Recorded, shown, never executed. */
  suspiciousInstructions: z.array(z.string().max(400)).max(20),
});

export type InvoiceFields = z.infer<typeof InvoiceFieldsSchema>;
export type InvoiceExtraction = z.infer<typeof InvoiceExtractionSchema>;

export const EMPTY_FIELDS: InvoiceFields = {
  payeeName: null,
  sortCode: null,
  accountNumber: null,
  iban: null,
  amount: null,
  currency: null,
  dueDate: null,
  studentId: null,
  invoiceNumber: null,
};
