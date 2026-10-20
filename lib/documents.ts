import { getDb } from './db';
import { now } from './clock';
import { newId } from './util';

export interface DocumentRow {
  id: string;
  filename: string;
  mime: string;
  text: string;
  created_at: number;
}

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Turn an uploaded file into plain text. PDF text extraction deliberately includes
 * white/tiny/hidden text: that is exactly what the injection scanner needs to see.
 */
export async function documentText(filename: string, mime: string, bytes: Uint8Array): Promise<string> {
  if (bytes.byteLength > MAX_BYTES) throw new Error('File too large (max 5 MB).');
  const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(filename) || (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46);
  if (isPdf) {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join('\n') : text;
  }
  return new TextDecoder('utf-8').decode(bytes);
}

export async function saveDocument(filename: string, mime: string, bytes: Uint8Array): Promise<DocumentRow> {
  const text = (await documentText(filename, mime, bytes)).slice(0, 50_000);
  return saveTextDocument(filename, text, mime);
}

export function saveTextDocument(filename: string, text: string, mime = 'text/plain'): DocumentRow {
  const row: DocumentRow = { id: newId('doc'), filename: filename.slice(0, 120), mime, text, created_at: now() };
  getDb().prepare('INSERT INTO documents(id, filename, mime, text, created_at) VALUES (?,?,?,?,?)').run(row.id, row.filename, row.mime, row.text, row.created_at);
  return row;
}

export function getDocument(id: string): DocumentRow | undefined {
  return getDb().prepare('SELECT * FROM documents WHERE id = ?').get(id) as DocumentRow | undefined;
}

export function latestDocument(): DocumentRow | undefined {
  return getDb().prepare('SELECT * FROM documents ORDER BY created_at DESC, rowid DESC LIMIT 1').get() as DocumentRow | undefined;
}
