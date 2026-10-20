import fs from 'node:fs';
import path from 'node:path';
import { saveDocument, type DocumentRow } from '@/lib/documents';

export const INVOICE_DIR = path.join(process.cwd(), 'fixtures', 'invoices');
export const MESSAGE_DIR = path.join(process.cwd(), 'fixtures', 'messages');

export interface InvoiceManifestEntry {
  file: string;
  malicious: boolean;
  attack: string | null;
  description: string;
  expected: Record<string, unknown>;
}

export function invoiceManifest(): InvoiceManifestEntry[] {
  return JSON.parse(fs.readFileSync(path.join(INVOICE_DIR, 'manifest.json'), 'utf8'));
}

export async function uploadFixture(file: string): Promise<DocumentRow> {
  const bytes = new Uint8Array(fs.readFileSync(path.join(INVOICE_DIR, file)));
  return saveDocument(file, file.endsWith('.pdf') ? 'application/pdf' : 'text/plain', bytes);
}
