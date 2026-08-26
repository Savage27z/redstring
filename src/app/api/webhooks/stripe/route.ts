import { NextResponse } from 'next/server';
import { placeBid } from '@/lib/store';
import type { Category } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * The only path that mutates the board in production.
 *
 * A bid is real when Stripe says the money moved — not when the browser comes
 * back to the success URL, which anyone can forge by typing it.
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

  try {
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(secret);

    const event = stripe.webhooks.constructEvent(raw, signature, webhookSecret);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const md = session.metadata ?? {};

      const amount = Number(md.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        // Nothing actionable, but ack so Stripe stops retrying.
        return NextResponse.json({ received: true, skipped: 'bad amount' });
      }

      let newCase:
        | {
            title: string;
            tagline: string;
            url: string;
            logoUrl: string | null;
            category: Category;
          }
        | undefined;

      if (md.newCase) {
        try {
          newCase = JSON.parse(md.newCase);
        } catch {
          /* fall through — treated as a bid without case details */
        }
      }

      const result = placeBid({
        submissionId: md.submissionId || undefined,
        amount,
        bidderName: md.bidderName || 'anon',
        newCase,
      });

      if (!result.ok) {
        // Someone outbid them while Checkout was open. Money is captured, the
        // slot is gone — this is the refund queue in a real deployment.
        console.error('[stripe webhook] bid rejected after payment:', result.error, md);
        return NextResponse.json({ received: true, needsRefund: true });
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[stripe webhook]', err);
    return NextResponse.json({ error: 'Signature verification failed.' }, { status: 400 });
  }
}
