import { NextResponse } from 'next/server';
import { settleIntent } from '@/lib/payments/settle';
import { getIntent, publicIntent } from '@/lib/payments/intentStore';
import { parseTxReference } from '@/lib/payments/txref';
import { rateLimit, clientKey } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Poll a payment.
 *
 * On Solana this does the real work: the server scans the chain for the
 * intent's reference key and settles the bid the moment the transfer lands, so
 * the payer never reports anything. On Base it reports status, and settles once
 * a transaction hash has been submitted via POST.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Polling hits the chain, so it needs its own (looser) budget.
  const limit = rateLimit(`poll:${clientKey(req)}`, 120, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Slow down.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const result = await settleIntent(id);
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Report a payment the payer sent by hand.
 *
 * Accepts the transaction id or a link to it on any explorer — people copy the
 * link far more often than the bare id. Either way it is only a pointer: the
 * server still reads the transaction off the chain and checks it paid the right
 * address, the right token and the right amount before anything reaches the
 * board.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const limit = rateLimit(`claim:${clientKey(req)}`, 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many attempts.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  let body: { txHash?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const intent = await getIntent(id);
  if (!intent) return NextResponse.json({ error: 'Unknown payment.' }, { status: 404 });

  const parsed = parseTxReference(body.txHash, intent.chain);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error, intent: publicIntent(intent) },
      { status: 400 },
    );
  }

  const result = await settleIntent(id, parsed.value);
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
