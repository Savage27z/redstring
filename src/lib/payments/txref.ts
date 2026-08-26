import type { ChainId } from './chains';

/**
 * What the payer pastes to prove they sent a payment by hand.
 *
 * On Solana the "signature" and the "transaction ID" are the same string —
 * Solscan says signature, Phantom says transaction ID, Basescan says hash.
 * There is nothing fuller to paste: the serialized transaction would prove
 * nothing, since anyone can build one offline. Only a confirmed record on chain
 * is evidence, and this identifier is how it is looked up.
 *
 * Most people copy the explorer *link* rather than the bare id, so accept both.
 */

const SOLANA_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;
const EVM_TX_HASH = /^0x[0-9a-fA-F]{64}$/;

export type ParsedTxRef = { ok: true; value: string } | { ok: false; error: string };

export function parseTxReference(raw: unknown, chain: ChainId): ParsedTxRef {
  const input = typeof raw === 'string' ? raw.trim() : '';
  if (!input) {
    return { ok: false, error: 'Paste the transaction ID or a link to it.' };
  }

  // Pull the id out of an explorer URL: solscan.io/tx/<id>, basescan.org/tx/<id>,
  // explorer.solana.com/tx/<id>?cluster=devnet, and friends.
  let candidate = input;
  if (/^https?:\/\//i.test(input) || input.includes('/')) {
    const withoutQuery = input.split(/[?#]/)[0];
    const segments = withoutQuery.split('/').filter(Boolean);
    candidate = segments[segments.length - 1] ?? '';
  }

  if (chain === 'solana') {
    if (!SOLANA_SIGNATURE.test(candidate)) {
      return {
        ok: false,
        error: "That doesn't look like a Solana transaction ID. Paste the ID or the explorer link.",
      };
    }
    return { ok: true, value: candidate };
  }

  if (!EVM_TX_HASH.test(candidate)) {
    return {
      ok: false,
      error: "That doesn't look like a Base transaction hash. Paste the 0x… hash or the link.",
    };
  }
  return { ok: true, value: candidate.toLowerCase() };
}

/**
 * How far before the payment was opened a transaction may have landed and still
 * count.
 *
 * Verifying by id alone means the server only learns "this transaction paid the
 * board" — not "the person pasting it is the one who sent it". Without a bound,
 * anyone could watch for an unclaimed transfer to the board and paste that id to
 * take a free slot. Requiring the transaction to be roughly contemporary with
 * the payment shrinks that to transfers made inside the same window, which in
 * practice are already claimed by whoever actually made them — automatically on
 * Solana via the QR's reference key, or by hand within a minute or two.
 *
 * The grace is generous because clocks drift and people leave the tab open
 * before paying.
 */
export const CLAIM_GRACE_MS = 60 * 60 * 1000;

export function claimNotBefore(intentCreatedAt: string): number {
  return Date.parse(intentCreatedAt) - CLAIM_GRACE_MS;
}
