import { NextResponse } from 'next/server';
import { placeBid, getSubmission } from '@/lib/store';
import { MIN_BID, priceToBeat } from '@/lib/types';
import { rateLimit, clientKey } from '@/lib/rateLimit';
import {
  validateAmount,
  validateNewCase,
  normalizeBidderName,
  encodeCaseMetadata,
} from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Creates a Stripe Checkout session for a bid.
 *
 * Everything is validated *before* a session exists, because anything rejected
 * afterwards is rejected with the customer's money already captured.
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

    // The webhook rebuilds the submission from metadata, so it has to fit
    // Stripe's 500-character limit intact. Refuse rather than truncate — a
    // sliced payload is invalid JSON and silently loses a paid submission.
    const encoded = encodeCaseMetadata(newCase);
    if (!encoded.ok) return NextResponse.json({ error: encoded.error }, { status: 400 });
    newCaseJson = encoded.value;
  }

  const secret = process.env.STRIPE_SECRET_KEY;

  /* ---- dev mode: no payment ------------------------------------------- */
  // Gated on an explicit opt-in as well as a missing key, so a misconfigured
  // deploy cannot quietly start handing out free placements.
  if (!secret) {
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
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(secret);

    const origin =
      process.env.NEXT_PUBLIC_SITE_URL || req.headers.get('origin') || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: amount.value * 100,
            product_data: {
              name: submissionId
                ? `Claim slot — ${targetTitle}`
                : `Pin new case — ${newCase!.title}`,
              description: 'redstring.lol — bid is board area. Non-refundable placement.',
            },
          },
        },
      ],
      success_url: `${origin}/?claimed=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?cancelled=1`,
      // The webhook is the only thing that mutates the board, so it carries
      // everything needed to reconstruct the bid.
      metadata: {
        submissionId: submissionId ?? '',
        amount: String(amount.value),
        bidderName,
        newCase: newCaseJson ?? '',
      },
    });

    return NextResponse.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error('[checkout]', err);
    return NextResponse.json({ error: 'Could not start checkout.' }, { status: 500 });
  }
}
