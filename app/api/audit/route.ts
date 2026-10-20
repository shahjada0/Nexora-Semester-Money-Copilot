import { NextResponse } from 'next/server';
import { exportJsonl, listAudit, verifyChain } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/audit — list; ?verify=1 — verify chain; ?export=1 — download JSONL. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get('export')) {
    return new NextResponse(exportJsonl(), {
      headers: {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'content-disposition': `attachment; filename="audit-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.jsonl"`,
      },
    });
  }
  if (url.searchParams.get('verify')) return NextResponse.json(verifyChain());
  return NextResponse.json({ records: listAudit().reverse() });
}
