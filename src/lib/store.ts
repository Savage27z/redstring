import { MOCK_SUBMISSIONS, MOCK_BIDS } from './mock';
import { bus } from './bus';
import { MIN_BID, priceToBeat } from './types';
import type { BoardState, BidEvent, Submission, Category } from './types';

/**
 * Data layer.
 *
 * Default: in-memory, seeded from mock data. Zero config, `npm run dev` works
 * immediately, and the whole bid/reflow/realtime loop is exercisable without a
 * database. State resets on server restart.
 *
 * Production: set DATABASE_URL and run schema.sql, then swap the four functions
 * at the bottom for their SQL equivalents (marked TODO). Everything above the
 * line is storage-agnostic.
 */

interface Db {
  submissions: Submission[];
  bids: BidEvent[];
  visitors: number;
}

const globalForDb = globalThis as unknown as { __redstringDb?: Db };

function db(): Db {
  if (!globalForDb.__redstringDb) {
    globalForDb.__redstringDb = {
      submissions: MOCK_SUBMISSIONS.map((s) => ({ ...s })),
      bids: MOCK_BIDS.map((b) => ({ ...b })),
      visitors: 1284,
    };
  }
  return globalForDb.__redstringDb;
}

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function getBoardState(): BoardState {
  const d = db();
  const active = d.submissions
    .filter((s) => s.status === 'active')
    .sort((a, b) => b.currentBid - a.currentBid || a.id.localeCompare(b.id));

  const totalRaised = d.bids.reduce((sum, b) => sum + b.amount, 0);
  const topBid = active[0]?.currentBid ?? 0;

  return {
    submissions: active,
    recentBids: [...d.bids]
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      .slice(0, 12),
    stats: {
      totalRaised,
      totalCases: active.length,
      topBid,
      priceToTakeNumberOne: priceToBeat(topBid),
      minimumBid: MIN_BID,
      visitors: d.visitors,
    },
  };
}

export function bumpVisitors(): number {
  const d = db();
  d.visitors += 1;
  return d.visitors;
}

export interface PlaceBidInput {
  submissionId?: string;
  amount: number;
  bidderName: string;
  /** only when creating a new case file */
  newCase?: {
    title: string;
    tagline: string;
    url: string;
    logoUrl: string | null;
    category: Category;
  };
}
