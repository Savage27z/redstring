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

export interface PlaceBidResult {
  ok: boolean;
  error?: string;
  submission?: Submission;
  state?: BoardState;
}

/**
 * The core mechanic. Either raises an existing case file's bid (outbidding the
 * current holder) or pins a brand new one. Both reflow the whole board.
 */
export function placeBid(input: PlaceBidInput): PlaceBidResult {
  const d = db();
  const amount = Math.floor(Number(input.amount));

  if (!Number.isFinite(amount) || amount < MIN_BID) {
    return { ok: false, error: `Minimum bid is $${MIN_BID}.` };
  }

  const bidderName = (input.bidderName || 'anon').trim().slice(0, 40) || 'anon';
  let submission: Submission;
  let previousBid: number | null = null;

  if (input.submissionId) {
    const existing = d.submissions.find((s) => s.id === input.submissionId);
    if (!existing) return { ok: false, error: 'No such case file.' };

    const floor = priceToBeat(existing.currentBid);
    if (amount < floor) {
      return { ok: false, error: `You need at least $${floor} to take this slot.` };
    }

    previousBid = existing.currentBid;
    existing.currentBid = amount;
    existing.bidderName = bidderName;
    existing.claimedAt = new Date().toISOString();
    existing.status = 'active';
    submission = existing;
  } else {
    if (!input.newCase) return { ok: false, error: 'Missing case details.' };
    const { title, tagline, url, logoUrl, category } = input.newCase;
    if (!title?.trim()) return { ok: false, error: 'A case needs a name.' };
    if (!url?.trim()) return { ok: false, error: 'A case needs a URL.' };

    submission = {
      id: id('sub'),
      title: title.trim().slice(0, 60),
      tagline: (tagline || '').trim().slice(0, 140),
      url: url.trim(),
      logoUrl: logoUrl || null,
      category: category || 'other',
      currentBid: amount,
      bidderName,
      claimedAt: new Date().toISOString(),
      status: 'active',
    };
    d.submissions.push(submission);
  }

  const bid: BidEvent = {
    id: id('bid'),
    submissionId: submission.id,
    amount,
    bidderName,
    createdAt: new Date().toISOString(),
    previousBid,
  };
  d.bids.push(bid);

  const state = getBoardState();
  bus.publish(state); // every open board reflows within a tick
  return { ok: true, submission, state };
}
