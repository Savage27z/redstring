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
