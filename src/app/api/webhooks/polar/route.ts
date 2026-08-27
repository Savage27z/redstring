import { NextResponse } from 'next/server';
import { Webhook, WebhookVerificationError } from 'standardwebhooks';
import { placeBid } from '@/lib/store';
import { validateNewCase } from '@/lib/validation';
import { fromMinorUnits } from '@/lib/payments';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * The only path that mutates the board in production.
 *
 * A bid is real when Polar says the order was paid — not when the browser comes
 * back to the success URL, which anyone can forge by typing it.
 *
 * Signature verification is strict; payload *parsing* deliberately is not. The
 * SDK's `validateEvent` also runs the body through a generated Zod schema for
 * the full Order object, and rejects the whole event if any field drifts. That
 * couples paid orders to an exact SDK version: Polar adds a field, the schema
 * says no, we return an error, Polar retries and eventually gives up, and a bid
 * someone paid for never reaches the board. So: verify the signature, then read
 * only the handful of fields we actually need, defensively.
 *
 * If auth is ever added, this route must stay public — behind middleware
 * protection Polar receives 401s and payments silently stop applying.
 */

interface PolarOrder {
  id?: unknown;
  total_amount?: unknown;
  customer_id?: unknown;
  customer?: { email?: unknown } | null;
  metadata?: Record<string, unknown> | null;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}

export async function POST(req: Request) {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 503 });
  }

  // The signature covers the raw body, so read it as text before parsing.
  const raw = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let payload: { type?: unknown; data?: PolarOrder };
  try {
    // Polar signs with Standard Webhooks. The secret is base64 in the header
    // scheme; Polar shows it as plain text in the dashboard.
    const wh = new Webhook(Buffer.from(secret).toString('base64'));
    payload = wh.verify(raw, headers) as { type?: unknown; data?: PolarOrder };
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      console.error('[polar webhook] signature verification failed');
      return NextResponse.json({ error: 'Invalid signature.' }, { status: 403 });
    }
    console.error('[polar webhook] could not read payload', err);
    return NextResponse.json({ error: 'Bad payload.' }, { status: 400 });
  }

  // `order.paid` is the settlement event. `order.created` fires before payment
  // is confirmed, so acting on it would place unpaid bids.
  if (payload.type !== 'order.paid') {
    return NextResponse.json({ received: true, ignored: String(payload.type ?? 'unknown') });
  }

  try {
    const order = payload.data ?? {};
    const md = (order.metadata ?? {}) as Record<string, unknown>;

    const orderId = asString(order.id);
    if (!orderId) {
      console.error('[polar webhook] order without an id, cannot dedupe');
      return NextResponse.json({ received: true, skipped: 'no order id' });
    }

    // The order total is the source of truth for what was actually paid;
    // metadata only says what it was meant to be for.
    const total = Number(order.total_amount);
    const paid = Number.isFinite(total) ? fromMinorUnits(total) : NaN;
    const amount = Number.isFinite(paid) && paid > 0 ? paid : Number(md.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      // Nothing actionable — ack so Polar stops retrying a poisoned event.
      console.error('[polar webhook] unusable amount', { order: orderId, md });
      return NextResponse.json({ received: true, skipped: 'bad amount' });
    }

    const submissionId = asString(md.submissionId);

    let newCase;
    const rawCase = asString(md.newCase);
    if (rawCase) {
      try {
        const parsed = validateNewCase(JSON.parse(rawCase));
        if (parsed.ok) newCase = parsed.value;
        else console.error('[polar webhook] invalid case metadata', parsed.error);
      } catch (err) {
        console.error('[polar webhook] unparseable case metadata', err);
      }
    }

    if (!submissionId && !newCase) {
      console.error('[polar webhook] paid but nothing to place', { order: orderId });
      return NextResponse.json({ received: true, needsRefund: true });
    }

    // The order id makes this idempotent: Polar retries on any non-2xx and can
    // deliver the same event more than once.
    const result = await placeBid({
      mode: 'claim',
      submissionId: submissionId ?? undefined,
      amount,
      bidderName: asString(md.bidderName) ?? 'anon',
      newCase,
      paymentRef: orderId,
      // Identity of record, taken from the payment rather than asserted by the
      // client. Never rendered on the board.
      ownerId: asString(order.customer_id),
      contactEmail: asString(order.customer?.email),
    });

    if (!result.ok) {
      // Outbid while their checkout was open: money taken, slot gone.
      console.error('[polar webhook] bid rejected after payment', {
        order: orderId,
        error: result.error,
      });
      return NextResponse.json({ received: true, needsRefund: true });
    }

    return NextResponse.json({ received: true, duplicate: result.duplicate ?? false });
  } catch (err) {
    // A 500 makes Polar retry, which is what we want for a transient database
    // failure — the paymentRef keeps that retry from double-applying.
    console.error('[polar webhook] handler failed', err);
    return NextResponse.json({ error: 'Handler failed.' }, { status: 500 });
  }
}
