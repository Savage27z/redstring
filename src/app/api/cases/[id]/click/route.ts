import { NextResponse } from 'next/server';
import { recordClick } from '@/lib/store';
import { rateLimit, clientKey } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Records that someone opened a case file.
 *
 * Deliberately does NOT broadcast on the board bus: a click is not a change to
 * the board, and pushing one to every viewer would reflow the whole scene every
 * time anybody looked at a card. The count reaches other viewers on the next
 * board update instead.
 *
 * Rate limited per client per case so the number means something. It is still
 * only a rough measure — anyone determined can inflate it — so it is presented
 * as interest, not as audited analytics.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const limit = rateLimit(`click:${clientKey(req)}:${id}`, 5, 60_000);
  if (!limit.ok) {
    // Silently accept without counting: a rejected click is not worth an error.
    return NextResponse.json({ ok: true, counted: false }, { status: 200 });
  }

  const clicks = await recordClick(id);
  if (clicks === undefined) {
    return NextResponse.json({ error: 'No such case file.' }, { status: 404 });
  }

  return NextResponse.json(
    { ok: true, counted: true, clicks },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
