import { NextResponse } from 'next/server';
import { placeBid, getSubmission } from '@/lib/store';
import { MIN_BID, priceToBeat } from '@/lib/types';
import type { Category } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Body {
  submissionId?: string;
  amount: number;
  bidderName?: string;
  newCase?: {
    title: string;
    tagline: string;
    url: string;
    logoUrl: string | null;
    category: Category;
  };
}

/**
 * Creates a Stripe Checkout session for the bid.
 *
 * If STRIPE_SECRET_KEY is unset the route runs in DEV MODE: the bid is applied
 * immediately with no payment. That keeps the whole outbid → reflow → realtime
 * loop demoable from a clean clone, and is refused in production below.
 */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const amount = Math.floor(Number(body.amount));
  if (!Number.isFinite(amount) || amount < MIN_BID) {
    return NextResponse.json({ error: `Minimum bid is $${MIN_BID}.` }, { status: 400 });
  }

  // Validate the floor server-side; never trust the client's idea of the price.
  if (body.submissionId) {
    const existing = getSubmission(body.submissionId);
    if (!existing) {
      return NextResponse.json({ error: 'No such case file.' }, { status: 404 });
    }
    const floor = priceToBeat(existing.currentBid);
    if (amount < floor) {
      return NextResponse.json(
        { error: `That slot now costs at least $${floor}.` },
        { status: 409 },
      );
    }
  } else if (!body.newCase?.title?.trim() || !body.newCase?.url?.trim()) {
    return NextResponse.json({ error: 'A new case needs a name and a URL.' }, { status: 400 });
  }

  const secret = process.env.STRIPE_SECRET_KEY;

  /* ---- dev mode: no Stripe configured --------------------------------- */
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Payments are not configured.' },
        { status: 503 },
      );
    }
    const result = placeBid({
      submissionId: body.submissionId,
      amount,
      bidderName: body.bidderName || 'anon',
      newCase: body.newCase,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ devMode: true, submission: result.submission });
  }

  /* ---- real checkout --------------------------------------------------- */
  try {
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(secret);

    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ||
      req.headers.get('origin') ||
      'http://localhost:3000';

    const label = body.submissionId
      ? `Claim slot — ${getSubmission(body.submissionId)?.title ?? 'case file'}`
      : `Pin new case — ${body.newCase?.title ?? 'untitled'}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: amount * 100,
            product_data: {
              name: label,
              description: 'redstring.lol — bid is board area. Non-refundable placement.',
            },
          },
        },
      ],
      success_url: `${origin}/?claimed=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?cancelled=1`,
      // The webhook is the only thing that mutates the board, so everything it
      // needs to reconstruct the bid rides along here.
      metadata: {
        submissionId: body.submissionId ?? '',
        amount: String(amount),
        bidderName: (body.bidderName || 'anon').slice(0, 40),
        newCase: body.newCase ? JSON.stringify(body.newCase).slice(0, 480) : '',
      },
    });

    return NextResponse.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error('[checkout]', err);
    return NextResponse.json({ error: 'Could not start checkout.' }, { status: 500 });
  }
}
