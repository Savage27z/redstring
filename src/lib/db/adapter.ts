import type { BidEvent, Submission } from '../types';
import type { NewCaseInput } from '../validation';

/**
 * Storage contract.
 *
 * Everything above this line in the app is storage-agnostic: swapping memory
 * for Postgres is a one-line change in store.ts. `commitBid` is deliberately
 * coarse — the floor check and both writes have to happen atomically, so it
 * cannot be decomposed into read-then-write without opening a race where two
 * bidders both "win" the same slot.
 */
export interface StoreAdapter {
  readonly name: string;

  listActive(): Promise<Submission[]>;
  recentBids(limit: number): Promise<BidEvent[]>;
  totalRaised(): Promise<number>;
  getSubmission(id: string): Promise<Submission | undefined>;

  visitors(): Promise<number>;
  bumpVisitors(): Promise<number>;

  commitBid(input: CommitBidInput): Promise<CommitBidResult>;
}

export interface CommitBidInput {
  submissionId?: string;
  amount: number;
  bidderName: string;
  newCase?: NewCaseInput;
  /**
   * Polar order id. Makes the write idempotent: Polar retries webhooks on any
   * non-2xx and can deliver the same event more than once, and without this a
   * retry applies the same bid twice.
   */
  paymentRef?: string;
  /**
   * Identity of record, taken from the payment rather than asserted by the
   * client. `bidderName` is only a display label and is spoofable; these are
   * not, and are never rendered on the board.
   */
  ownerId?: string | null;
  contactEmail?: string | null;
}

export interface CommitBidResult {
  ok: boolean;
  error?: string;
  submission?: Submission;
  /** true when this exact payment was already applied */
  duplicate?: boolean;
}
