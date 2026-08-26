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

/**
 * Verify a payment the payer reports by signature.
 *
 * The reference key only exists in transfers built from our QR. Anyone who
 * copies the address and sends from their wallet's normal send screen produces
 * a transfer with no reference, which `findReference` can never match — so
 * without this path their money would simply never settle.
 *
 * Rather than inspect instructions (which vary: transfer vs transferChecked,
 * with or without an account creation), this reads the token balance change on
 * the recipient's USDC accounts. That is the ground truth for "did we receive
 * this much", and it holds however the transfer was constructed.
 */
export async function verifySolanaSignature(
  config: ChainConfig,
  signature: string,
  amountDollars: number,
  notBefore?: number,
): Promise<SolanaVerifyResult> {

  const connection = new Connection(config.rpc, 'confirmed');

  let tx;
  try {
    tx = await connection.getParsedTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
  } catch (err) {
    console.error('[solana] getParsedTransaction failed', err);
    return { ok: false, pending: true };
  }

  // Not visible yet — keep polling rather than calling it a failure.
  if (!tx) return { ok: false, pending: true };
  if (tx.meta?.err) return { ok: false, error: 'That transaction failed on chain.' };

  const mine = (b: { mint?: string; owner?: string }) =>
    b.mint === config.usdc && b.owner === config.recipient;

  const sum = (balances: readonly { mint?: string; owner?: string; uiTokenAmount: { amount: string } }[]) =>
    balances.filter(mine).reduce((total, b) => total + BigInt(b.uiTokenAmount.amount), 0n);

  // An id alone proves the transaction paid the board, not that whoever pasted
  // it is the one who sent it. Requiring it to be contemporary with the payment
  // stops an old, unclaimed transfer being harvested for a free slot.
  if (notBefore && tx.blockTime && tx.blockTime * 1000 < notBefore) {
    return {
      ok: false,
      error: 'That transaction is older than this payment. Start a new one and pay again.',
    };
  }

  const received = sum(tx.meta?.postTokenBalances ?? []) - sum(tx.meta?.preTokenBalances ?? []);
  const needed = BigInt(Math.round(amountDollars * 1_000_000));

  // Overpaying is fine; underpaying is not.
  if (received >= needed) return { ok: true, txHash: signature };

  return {
    ok: false,
    error: 'That transaction did not send the requested amount of USDC to the board.',
  };
}
