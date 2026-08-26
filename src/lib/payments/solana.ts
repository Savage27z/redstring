import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { encodeURL, findReference, validateTransfer, FindReferenceError } from '@solana/pay';
import BigNumber from 'bignumber.js';
import type { ChainConfig } from './chains';

/**
 * Solana Pay.
 *
 * The payer never has to report anything: a throwaway `reference` public key is
 * attached to the transfer, and the server finds that exact transaction on
 * chain by scanning for the reference. `validateTransfer` then re-checks the
 * recipient, mint and amount against what we asked for, so a payment for the
 * wrong amount or to the wrong address cannot settle a bid.
 *
 * No wallet library ships to the browser for this — the client only renders a
 * URL as a QR code and polls.
 */

export interface SolanaPaymentRequest {
  /** solana: URL for the QR / deeplink */
  url: string;
  reference: string;
}

export function createSolanaRequest(
  config: ChainConfig,
  amountDollars: number,
  label: string,
  message: string,
): SolanaPaymentRequest {
  const reference = Keypair.generate().publicKey;

  const url = encodeURL({
    recipient: new PublicKey(config.recipient),
    amount: new BigNumber(amountDollars),
    splToken: new PublicKey(config.usdc),
    reference,
    label,
    message,
  });

  return { url: url.toString(), reference: reference.toBase58() };
}

export interface SolanaVerifyResult {
  ok: boolean;
  txHash?: string;
  /** true when nothing has landed yet — keep polling rather than failing */
  pending?: boolean;
  error?: string;
}

export async function verifySolanaPayment(
  config: ChainConfig,
  reference: string,
  amountDollars: number,
): Promise<SolanaVerifyResult> {
  const connection = new Connection(config.rpc, 'confirmed');

  let signature: string;
  try {
    const found = await findReference(connection, new PublicKey(reference), {
      finality: 'confirmed',
    });
    signature = found.signature;
  } catch (err) {
    // Nothing on chain yet is the normal case while the payer is still in
    // their wallet, so it must not be reported as a failure.
    if (err instanceof FindReferenceError) return { ok: false, pending: true };
    console.error('[solana] findReference failed', err);
    return { ok: false, pending: true };
  }

  try {
    await validateTransfer(
      connection,
      signature,
      {
        recipient: new PublicKey(config.recipient),
        amount: new BigNumber(amountDollars),
        splToken: new PublicKey(config.usdc),
        reference: new PublicKey(reference),
      },
      { commitment: 'confirmed' },
    );
    return { ok: true, txHash: signature };
  } catch (err) {
    // Found a transaction carrying our reference, but it does not match what
    // was asked for — wrong amount, wrong mint, wrong recipient.
    console.error('[solana] validateTransfer rejected', signature, err);
    return {
      ok: false,
      txHash: signature,
      error: 'That payment did not match the requested amount.',
    };
  }
}
