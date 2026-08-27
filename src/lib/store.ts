import { bus } from './bus';
import { MIN_BID, priceToBeat } from './types';
import { memoryAdapter } from './db/memory';
import { postgresAdapter } from './db/postgres';
import { validateAmount, normalizeBidderName, validateNewCase } from './validation';
import { newManageToken, hashManageToken } from './manageToken';
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
  const [submissions, recentBids, totalRaised, visitors, totalClicks] = await Promise.all([
    adapter.listActive(),
    adapter.recentBids(12),
    adapter.totalRaised(),
    adapter.visitors(),
    adapter.totalClicks(),
  ]);

  const topBid = submissions[0]?.currentBid ?? 0;

  return {
    submissions,
    recentBids,
    stats: {
      totalRaised,
      totalCases: submissions.length,
      topBid,
      // On an empty board topBid is 0, and priceToBeat(0) would advertise a
      // price the API rejects. The floor is always the minimum bid.
      priceToTakeNumberOne: Math.max(priceToBeat(topBid), MIN_BID),
      minimumBid: MIN_BID,
      visitors,
      totalClicks,
    },
  };
}

/** Records that someone opened a case file. */
export async function recordClick(submissionId: string): Promise<number | undefined> {
  return adapter.recordClick(submissionId);
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
  /** 'topup' raises a case you already own; 'claim' pins a new one. */
  mode: 'claim' | 'topup';
  submissionId?: string;
  /** required for 'topup' */
  manageToken?: string;
  amount: number;
  bidderName: string;
  newCase?: NewCaseInput;
  /** Polar order id — makes the write idempotent. */
  paymentRef?: string;
  /** Identity from the payment, never rendered. */
  ownerId?: string | null;
  contactEmail?: string | null;
}

export interface PlaceBidResult {
  ok: boolean;
  error?: string;
  submission?: Submission;
  /** returned exactly once, when a new case is pinned */
  manageToken?: string;
  newTotal?: number;
  /** true when this payment had already been applied */
  duplicate?: boolean;
}

/**
 * The core mechanic: raise an existing case file's bid, or pin a new one.
 * Both reflow the board for every connected viewer.
 */
export async function placeBid(input: PlaceBidInput): Promise<PlaceBidResult> {
  // Re-validate at the storage boundary. The API route has already checked
  // this, but nothing that writes to the board should trust its caller.
  const isTopup = input.mode === 'topup';

  // A top-up only has to clear the site minimum: you are adding to your own
  // bid, not trying to beat anyone.
  const amount = validateAmount(input.amount, MIN_BID);
  if (!amount.ok) return { ok: false, error: amount.error };

  let newCase: NewCaseInput | undefined;
  let manageToken: string | undefined;
  let manageTokenHash: string | undefined;

  if (isTopup) {
    if (!input.submissionId) return { ok: false, error: 'Missing case file.' };
    if (!input.manageToken) return { ok: false, error: 'That case file is not yours to raise.' };
  } else {
    const checked = validateNewCase(input.newCase);
    if (!checked.ok) return { ok: false, error: checked.error };
    newCase = checked.value;
    manageToken = newManageToken();
    manageTokenHash = hashManageToken(manageToken);
  }

  const result = await adapter.commitBid({
    mode: input.mode,
    submissionId: input.submissionId,
    manageToken: input.manageToken,
    manageTokenHash,
    amount: amount.value,
    bidderName: normalizeBidderName(input.bidderName),
    newCase,
    paymentRef: input.paymentRef,
    ownerId: input.ownerId,
    contactEmail: input.contactEmail,
  });

  if (!result.ok) return { ok: false, error: result.error };

  // A replayed payment must not re-broadcast; the board is already correct.
  if (!result.duplicate) {
    bus.publish(await getBoardState());
  }

  return {
    ok: true,
    submission: result.submission,
    duplicate: result.duplicate,
    newTotal: result.newTotal,
    // Handed over exactly once, and only for a brand new case file.
    manageToken: result.duplicate ? undefined : manageToken,
  };
}
