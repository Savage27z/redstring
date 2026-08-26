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
 * Deliberately a TRANSFER request, not a transaction request.
 *
 * A transaction request produces a much shorter QR, but it works by the wallet
 * POSTing the payer's account to this server to fetch a transaction — which
 * wallets present as "connect to this site". A transfer request carries the
 * recipient, amount and mint in the URL itself, so the wallet builds the send
 * locally and shows a plain confirmation. Nothing connects, the site never
 * learns an address, and no wallet library ships to the browser. The longer QR
 * is the price of that, and it is worth paying.
 */

export interface SolanaPaymentRequest {
  /** solana: URL for the QR / deeplink */
  url: string;
  reference: string;
}

export function createSolanaRequest(
  config: ChainConfig,
  amountDollars: number,
): SolanaPaymentRequest {
  const reference = Keypair.generate().publicKey;

  // `label` and `message` are omitted on purpose: they are decoration, and they
  // were the longest part of the URL. Everything left is load-bearing.
  const url = encodeURL({
    recipient: new PublicKey(config.recipient),
    amount: new BigNumber(amountDollars),
    splToken: new PublicKey(config.usdc),
    reference,
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
