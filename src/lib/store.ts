import { bus } from './bus';
import { MIN_BID, priceToBeat } from './types';
import { memoryAdapter } from './db/memory';
import { postgresAdapter } from './db/postgres';
import { validateAmount, normalizeBidderName, validateNewCase } from './validation';
import type { BoardState, Submission } from './types';
import type { StoreAdapter } from './db/adapter';
import type { NewCaseInput } from './validation';

/**
 * Data layer.
 *
 * Postgres when DATABASE_URL is set, otherwise an in-memory store seeded from
 * mock data so a clean clone runs with zero config. Everything above this file
 * is storage-agnostic and async, so switching backends changes nothing else.
 */

// The pool is created lazily inside the adapter, so importing this costs
// nothing until a query actually runs.
const adapter: StoreAdapter = process.env.DATABASE_URL ? postgresAdapter : memoryAdapter;

export function storeBackend(): string {
  return adapter.name;
}

export async function getBoardState(): Promise<BoardState> {
  const [submissions, recentBids, totalRaised, visitors] = await Promise.all([
    adapter.listActive(),
    adapter.recentBids(12),
    adapter.totalRaised(),
    adapter.visitors(),
  ]);

  const topBid = submissions[0]?.currentBid ?? 0;

  return {
    submissions,
    recentBids,
    stats: {
      totalRaised,
      totalCases: submissions.length,
      topBid,
      priceToTakeNumberOne: priceToBeat(topBid),
      minimumBid: MIN_BID,
      visitors,
    },
  };
}

export async function bumpVisitors(): Promise<number> {
  return adapter.bumpVisitors();
}

export async function getSubmission(
  submissionId: string,
): Promise<Submission | undefined> {
  return adapter.getSubmission(submissionId);
}

export interface PlaceBidInput {
  submissionId?: string;
  amount: number;
  bidderName: string;
  newCase?: NewCaseInput;
  /** Stripe Checkout session id — makes the write idempotent. */
  paymentRef?: string;
}

export interface PlaceBidResult {
  ok: boolean;
  error?: string;
  submission?: Submission;
  /** true when this payment had already been applied */
  duplicate?: boolean;
}

/**
 * The core mechanic: raise an existing case file's bid, or pin a new one.
 * Both reflow the board for every connected viewer.
 */
export async function placeBid(input: PlaceBidInput): Promise<PlaceBidResult> {
  // Re-validate at the storage boundary. The API route has already checked
  // this, but the webhook path reconstructs input from Stripe metadata, and
  // nothing that writes to the board should trust its caller.
  const floor = input.submissionId
    ? priceToBeat((await adapter.getSubmission(input.submissionId))?.currentBid ?? 0)
    : MIN_BID;

  const amount = validateAmount(input.amount, floor);
  if (!amount.ok) return { ok: false, error: amount.error };

  let newCase: NewCaseInput | undefined;
  if (!input.submissionId) {
    const checked = validateNewCase(input.newCase);
    if (!checked.ok) return { ok: false, error: checked.error };
    newCase = checked.value;
  }

  const result = await adapter.commitBid({
    submissionId: input.submissionId,
    amount: amount.value,
    bidderName: normalizeBidderName(input.bidderName),
    newCase,
    paymentRef: input.paymentRef,
  });

  if (!result.ok) return { ok: false, error: result.error };

  // A replayed webhook must not re-broadcast; the board is already correct.
  if (!result.duplicate) {
    bus.publish(await getBoardState());
  }

  return {
    ok: true,
    submission: result.submission,
    duplicate: result.duplicate,
  };
}
