import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { placeBid, getSubmission } from '@/lib/store';
import { MIN_BID } from '@/lib/types';
import { rateLimit, clientKey } from '@/lib/rateLimit';
import { chainConfig, enabledChains, toUsdcUnits, baseNumericChainId } from '@/lib/payments/chains';
import { createIntent, publicIntent } from '@/lib/payments/intentStore';
import { createSolanaRequest } from '@/lib/payments/solana';
import { buildPaymentUri } from '@/lib/payments/base';
import { validateAmount, validateNewCase, normalizeBidderName } from '@/lib/validation';
import type { ChainId } from '@/lib/payments/chains';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Opens a payment for a bid.
 *
 * Nothing reaches the board here. This validates the bid, fixes the price
 * server-side, and hands back what the payer needs to send USDC. The board only
 * changes once the chain confirms the transfer — see /api/payments/[id].
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
  const manageToken = typeof body.manageToken === 'string' ? body.manageToken : undefined;

  /**
   * A bid buys size on YOUR OWN case file. There is no way to bid on someone
   * else's: raising an existing card requires the manage token minted when it
   * was pinned. Previously any caller could pass a submissionId and take over
   * a stranger's listing — keeping their title and URL, but replacing the name
   * on it — which served nobody who paid.
   */
  const mode: 'claim' | 'topup' = submissionId ? 'topup' : 'claim';

  if (mode === 'topup') {
    const existing = await getSubmission(submissionId!);
    if (!existing) {
      return NextResponse.json({ error: 'No such case file.' }, { status: 404 });
    }
    if (!manageToken) {
      return NextResponse.json(
        { error: 'That case file is not yours to raise.' },
        { status: 403 },
      );
    }
  }

  // A top-up adds to what you already hold, so it only has to clear the site
  // minimum — there is no rival price to beat.
  const amount = validateAmount(body.amount, MIN_BID);
  if (!amount.ok) {
    return NextResponse.json({ error: amount.error }, { status: 400 });
  }

  const bidderName = normalizeBidderName(body.bidderName);

  let newCase;
  if (mode === 'claim') {
    const checked = validateNewCase(body.newCase);
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
    newCase = checked.value;
  }

  const available = enabledChains();

  /* ---- dev mode: no payment ------------------------------------------- */
  // Gated on an explicit opt-in as well as missing config, so a misconfigured
  // deploy cannot quietly start handing out free placements.
  if (available.length === 0) {
    const devBidsAllowed =
      process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_BIDS !== '0';
    if (!devBidsAllowed) {
      return NextResponse.json({ error: 'Payments are not configured.' }, { status: 503 });
    }
    const result = await placeBid({
      mode,
      submissionId,
      manageToken,
      amount: amount.value,
      bidderName,
      newCase,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({
      devMode: true,
      submission: result.submission,
      manageToken: result.manageToken,
    });
  }

  const requested = body.chain as ChainId | undefined;
  const chain: ChainId = requested ?? available[0].id;
  const config = chainConfig(chain);
  if (!config) {
    return NextResponse.json(
      { error: 'That chain is not available.', chains: available.map((c) => c.id) },
      { status: 400 },
    );
  }

  const amountUnits = toUsdcUnits(amount.value);

  try {
    if (chain === 'solana') {
      const request = createSolanaRequest(config, amount.value);
      const intent = await createIntent({
        chain,
        amount: amount.value,
        amountUnits: amountUnits.toString(),
        recipient: config.recipient,
        reference: request.reference,
        mode,
        submissionId,
        manageToken,
        bidderName,
        newCase,
      });

      return NextResponse.json({
        intent: publicIntent(intent),
        solana: {
          url: request.url,
          // Rendered here so no QR library ships to the browser.
          qr: await QRCode.toDataURL(request.url, { margin: 1, width: 512 }),
        },
      });
    }

    const intent = await createIntent({
      chain,
      amount: amount.value,
      amountUnits: amountUnits.toString(),
      recipient: config.recipient,
      mode,
      submissionId,
      manageToken,
      bidderName,
      newCase,
    });

    // A payment URI and a QR — never calldata, because nothing on this page
    // will ask a wallet to connect or sign. The payer sends from wherever they
    // already trust and reports the transaction hash.
    const uri = buildPaymentUri(config, baseNumericChainId(), amountUnits);

    return NextResponse.json({
      intent: publicIntent(intent),
      base: {
        uri,
        qr: await QRCode.toDataURL(uri, { margin: 1, width: 512 }),
        token: config.usdc,
        chainId: baseNumericChainId(),
      },
    });
  } catch (err) {
    console.error('[checkout]', err);
    return NextResponse.json({ error: 'Could not open a payment.' }, { status: 500 });
  }
}
