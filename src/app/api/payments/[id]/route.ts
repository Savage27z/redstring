import { NextResponse } from 'next/server';
import { settleIntent } from '@/lib/payments/settle';
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
 * Submit a transaction hash for an EVM payment (and as a manual fallback on
 * Solana for anyone who paid outside the flow). The hash is only a hint — the
 * server still verifies it against the chain before anything reaches the board.
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

  const txHash = typeof body.txHash === 'string' ? body.txHash.trim() : '';
  if (!txHash) return NextResponse.json({ error: 'Missing transaction hash.' }, { status: 400 });

  const result = await settleIntent(id, txHash);
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
