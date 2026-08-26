import { NextResponse } from 'next/server';
import { placeBid } from '@/lib/store';
import { validateNewCase } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * The only path that mutates the board in production.
 *
 * A bid is real when Stripe says the money moved — not when the browser comes
 * back to the success URL, which anyone can forge by typing it.
 *
 * NOTE for auth: this route must stay public. If it ends up behind
 * clerkMiddleware's protection, Stripe receives 401s and payments silently
 * stop being applied.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret || !webhookSecret) {
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 503 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature.' }, { status: 400 });
  }

  const raw = await req.text();

  let event;
  try {
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(secret);
    event = stripe.webhooks.constructEvent(raw, signature, webhookSecret);
  } catch (err) {
    console.error('[stripe webhook] signature verification failed', err);
    return NextResponse.json({ error: 'Signature verification failed.' }, { status: 400 });
  }

  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true });
  }

  try {
    const session = event.data.object;
    const md = session.metadata ?? {};

    // The charge is the source of truth for what was actually paid; metadata is
    // only a hint about what it was for.
    const paid = typeof session.amount_total === 'number' ? session.amount_total / 100 : NaN;
    const amount = Number.isFinite(paid) ? Math.floor(paid) : Number(md.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      // Nothing actionable — ack so Stripe stops retrying a poisoned event.
      console.error('[stripe webhook] unusable amount', { session: session.id, md });
      return NextResponse.json({ received: true, skipped: 'bad amount' });
    }

    let newCase;
    if (md.newCase) {
      try {
        const parsed = validateNewCase(JSON.parse(md.newCase));
        if (parsed.ok) newCase = parsed.value;
        else console.error('[stripe webhook] invalid case metadata', parsed.error);
      } catch (err) {
        console.error('[stripe webhook] unparseable case metadata', err);
      }
    }

    if (!md.submissionId && !newCase) {
      console.error('[stripe webhook] paid but nothing to place', { session: session.id });
      return NextResponse.json({ received: true, needsRefund: true });
    }

    // session.id makes this idempotent: Stripe redelivers on any non-2xx and
    // can deliver the same event more than once.
    const result = await placeBid({
      submissionId: md.submissionId || undefined,
      amount,
      bidderName: md.bidderName || 'anon',
      newCase,
      paymentRef: session.id,
    });

    if (!result.ok) {
      // Outbid while their Checkout tab was open: money captured, slot gone.
      console.error('[stripe webhook] bid rejected after payment', {
        session: session.id,
        error: result.error,
      });
      return NextResponse.json({ received: true, needsRefund: true });
    }

    return NextResponse.json({ received: true, duplicate: result.duplicate ?? false });
  } catch (err) {
    // A 500 makes Stripe retry, which is what we want for a transient database
    // failure — the paymentRef keeps that retry from double-applying.
    console.error('[stripe webhook] handler failed', err);
    return NextResponse.json({ error: 'Handler failed.' }, { status: 500 });
  }
}
