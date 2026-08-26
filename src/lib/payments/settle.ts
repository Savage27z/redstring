import { placeBid } from '../store';
import { chainConfig } from './chains';
import { getIntent, updateIntent, publicIntent } from './intentStore';
import { verifySolanaPayment, verifySolanaSignature } from './solana';
import { claimNotBefore } from './txref';
import { verifyBasePayment } from './base';
import type { PaymentIntent } from './intentStore';

/**
 * The one place a crypto payment turns into a bid.
 *
 * Verification always re-reads the chain — the client is never trusted to say
 * "I paid". The transaction hash becomes `paymentRef`, so the existing
 * idempotency applies: polling twice, double-clicking, or replaying the same
 * hash cannot place the bid twice.
 */

export interface SettleResult {
  intent: ReturnType<typeof publicIntent>;
  /** set when this call is what actually placed the bid */
  placed?: boolean;
  error?: string;
}

async function applyBid(intent: PaymentIntent, txHash: string): Promise<SettleResult> {
  const result = await placeBid({
    submissionId: intent.submissionId,
    amount: intent.amount,
    bidderName: intent.bidderName,
    newCase: intent.newCase,
    paymentRef: txHash,
    // On-chain, the transaction is the identity of record. There is no email to
    // collect, which is part of the point.
    ownerId: null,
    contactEmail: null,
  });

  if (!result.ok) {
    // Money is on chain but the slot moved while they were paying. Flag it
    // loudly: this is the manual refund queue.
    console.error('[settle] paid but bid rejected', {
      intent: intent.id,
      txHash,
      error: result.error,
    });
    await updateIntent(intent.id, { status: 'failed', txHash, error: result.error });
    return {
      intent: publicIntent({ ...intent, status: 'failed', txHash, error: result.error }),
      error: result.error,
    };
  }

  const updated = (await updateIntent(intent.id, { status: 'confirmed', txHash })) ?? intent;
  return { intent: publicIntent(updated), placed: !result.duplicate };
}

/**
 * Check an intent against the chain and settle it if the money is there.
 *
 * `submittedHash` comes from an EVM wallet after it sends the transfer. Solana
 * needs no hash: the reference key lets the server find the payment itself.
 */
export async function settleIntent(
  intentId: string,
  submittedHash?: string,
): Promise<SettleResult> {
  const intent = await getIntent(intentId);
  if (!intent) return { intent: publicIntent(emptyIntent(intentId)), error: 'Unknown payment.' };

  // Already settled: return the same answer rather than re-verifying.
  if (intent.status === 'confirmed') return { intent: publicIntent(intent) };
  if (intent.status === 'expired') {
    return { intent: publicIntent(intent), error: 'This payment request expired.' };
  }

  const config = chainConfig(intent.chain);
  if (!config) {
    return { intent: publicIntent(intent), error: 'That chain is not configured.' };
  }

  if (intent.chain === 'solana') {
    // A reported signature means they sent to the address by hand, so there is
    // no reference to scan for — verify that exact transaction instead.
    const reported = submittedHash ?? intent.txHash;
    const verified = reported
      ? await verifySolanaSignature(config, reported, intent.amount, claimNotBefore(intent.createdAt))
      : await verifySolanaPayment(config, intent.reference!, intent.amount);

    if (!verified.ok && verified.pending && reported) {
      await updateIntent(intent.id, { txHash: reported });
      return { intent: publicIntent({ ...intent, txHash: reported }) };
    }
    if (verified.ok && verified.txHash) return applyBid(intent, verified.txHash);
    if (verified.error) {
      await updateIntent(intent.id, { error: verified.error });
      return { intent: publicIntent({ ...intent, error: verified.error }), error: verified.error };
    }
    return { intent: publicIntent(intent) }; // still pending
  }

  // Base needs the payer's transaction hash.
  const hash = submittedHash ?? intent.txHash;
  if (!hash) return { intent: publicIntent(intent) };

  const verified = await verifyBasePayment(
    config,
    hash,
    BigInt(intent.amountUnits),
    claimNotBefore(intent.createdAt),
  );
  if (verified.ok) return applyBid(intent, hash);

  if (verified.pending) {
    // Remember the hash so polling can pick it up once it is mined.
    await updateIntent(intent.id, { txHash: hash });
    return { intent: publicIntent({ ...intent, txHash: hash }) };
  }

  await updateIntent(intent.id, { error: verified.error });
  return { intent: publicIntent({ ...intent, error: verified.error }), error: verified.error };
}

function emptyIntent(id: string): PaymentIntent {
  return {
    id,
    chain: 'solana',
    amount: 0,
    amountUnits: '0',
    recipient: '',
    status: 'failed',
    createdAt: new Date().toISOString(),
    expiresAt: new Date().toISOString(),
    bidderName: 'anon',
  };
}
