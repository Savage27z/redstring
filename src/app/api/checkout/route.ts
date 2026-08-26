import { NextResponse } from 'next/server';
import { placeBid, getSubmission } from '@/lib/store';
import { MIN_BID, priceToBeat } from '@/lib/types';
import { rateLimit, clientKey } from '@/lib/rateLimit';
import { polarConfig, polarClient, toMinorUnits } from '@/lib/payments';
import {
  validateAmount,
  validateNewCase,
  normalizeBidderName,
  encodeCaseMetadata,
} from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Creates a Polar checkout for a bid.
 *
 * Everything is validated *before* a checkout exists, because anything rejected
 * afterwards is rejected with the customer's money already taken.
 */
export async function POST(req: Request) {
  const limit = rateLimit(`checkout:${clientKey(req)}`, 10, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Give it a minute.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const submissionId =
    typeof body.submissionId === 'string' && body.submissionId ? body.submissionId : undefined;

  // Never trust the client's idea of the price: read the current floor.
  let floor = MIN_BID;
  let targetTitle = 'case file';
  if (submissionId) {
    const existing = await getSubmission(submissionId);
    if (!existing) {
      return NextResponse.json({ error: 'No such case file.' }, { status: 404 });
    }
    floor = priceToBeat(existing.currentBid);
    targetTitle = existing.title;
  }

  const amount = validateAmount(body.amount, floor);
  if (!amount.ok) {
    return NextResponse.json({ error: amount.error }, { status: submissionId ? 409 : 400 });
  }

  const bidderName = normalizeBidderName(body.bidderName);

  let newCaseJson: string | undefined;
  let newCase;
  if (!submissionId) {
    const checked = validateNewCase(body.newCase);
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
    newCase = checked.value;

    // The webhook rebuilds the submission from checkout metadata, so it has to
    // fit Polar's 500-character-per-value limit intact. Refuse rather than
    // truncate — a sliced payload is invalid JSON and would silently lose a
    // submission the customer had already paid for.
    const encoded = encodeCaseMetadata(newCase);
    if (!encoded.ok) return NextResponse.json({ error: encoded.error }, { status: 400 });
    newCaseJson = encoded.value;
  }

  const config = polarConfig();

  /* ---- dev mode: no payment ------------------------------------------- */
  // Gated on an explicit opt-in as well as missing credentials, so a
  // misconfigured deploy cannot quietly start handing out free placements.
  if (!config) {
    const devBidsAllowed =
      process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_BIDS !== '0';

    if (!devBidsAllowed) {
      return NextResponse.json({ error: 'Payments are not configured.' }, { status: 503 });
    }

    const result = await placeBid({ submissionId, amount: amount.value, bidderName, newCase });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({ devMode: true, submission: result.submission });
  }

  /* ---- real checkout --------------------------------------------------- */
  try {
    const polar = polarClient(config);
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL || req.headers.get('origin') || 'http://localhost:3000';

    const checkout = await polar.checkouts.create({
      products: [config.productId],
      // A one-off fixed price pinned to this exact bid. The catalog price is
      // ignored, and the buyer cannot change the amount at checkout.
      prices: {
        [config.productId]: [
          { amountType: 'fixed', priceAmount: toMinorUnits(amount.value) },
        ],
      },
      successUrl: `${origin}/?claimed=1&checkout_id={CHECKOUT_ID}`,
      metadata: {
        submissionId: submissionId ?? '',
        amount: amount.value,
        bidderName,
        newCase: newCaseJson ?? '',
        label: submissionId ? `Claim slot — ${targetTitle}` : `Pin new case — ${newCase!.title}`,
      },
    });

    return NextResponse.json({ checkoutUrl: checkout.url });
  } catch (err) {
    console.error('[checkout]', err);
    return NextResponse.json({ error: 'Could not start checkout.' }, { status: 500 });
  }
}
