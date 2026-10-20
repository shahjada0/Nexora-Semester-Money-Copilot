import { NextResponse } from 'next/server';
import { saveDocument, saveTextDocument } from '@/lib/documents';
import { append } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Accepts a PDF/text file (multipart) or pasted text (JSON). Stores it; reading happens in the readInvoice tool. */
export async function POST(req: Request) {
  try {
    const type = req.headers.get('content-type') ?? '';
    let doc;
    if (type.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return NextResponse.json({ error: 'No file' }, { status: 400 });
      doc = await saveDocument(file.name, file.type || 'application/octet-stream', new Uint8Array(await file.arrayBuffer()));
    } else {
      const body = (await req.json()) as { text?: string; filename?: string };
      if (!body.text?.trim()) return NextResponse.json({ error: 'No text' }, { status: 400 });
      doc = saveTextDocument(body.filename || 'pasted-invoice.txt', body.text.slice(0, 50_000));
    }
    append({ actor: 'student', action: 'document.upload', tier: 0, decision: 'info', reason: `Uploaded ${doc.filename} (${doc.text.length} characters)`, data: { documentId: doc.id } });
    return NextResponse.json({ documentId: doc.id, filename: doc.filename, chars: doc.text.length });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
