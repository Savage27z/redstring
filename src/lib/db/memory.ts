import { MOCK_SUBMISSIONS, MOCK_BIDS } from '../mock';
import { priceToBeat } from '../types';
import { LIMITS } from '../validation';
import type { BidEvent, Submission } from '../types';
import type { CommitBidInput, CommitBidResult, StoreAdapter } from './adapter';

/**
 * In-memory store, seeded from mock data.
 *
 * The default so a clean clone runs with zero config and the whole
 * bid → reflow → realtime loop is exercisable without a database. State resets
 * on restart, so it is not suitable for anything that has taken money.
 */

interface Db {
  submissions: Submission[];
  bids: BidEvent[];
  visitors: number;
  /** paymentRef -> submission id, for idempotent replays */
  applied: Map<string, string>;
}

const globalForDb = globalThis as unknown as { __redstringDb?: Db };

function db(): Db {
  if (!globalForDb.__redstringDb) {
    globalForDb.__redstringDb = {
      submissions: MOCK_SUBMISSIONS.map((s) => ({ ...s })),
      bids: MOCK_BIDS.map((b) => ({ ...b })),
      visitors: 1284,
      applied: new Map(),
    };
  }
  return globalForDb.__redstringDb;
}

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export const memoryAdapter: StoreAdapter = {
  name: 'memory',

  async listActive() {
    return db()
      .submissions.filter((s) => s.status === 'active')
      .sort((a, b) => b.currentBid - a.currentBid || a.id.localeCompare(b.id))
      .map((s) => ({ ...s }));
  },

  async recentBids(limit) {
    return [...db().bids]
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      .slice(0, limit)
      .map((b) => ({ ...b }));
  },

  async totalRaised() {
    return db().bids.reduce((sum, b) => sum + b.amount, 0);
  },

  async getSubmission(submissionId) {
    const found = db().submissions.find((s) => s.id === submissionId);
    return found ? { ...found } : undefined;
  },

  async visitors() {
    return db().visitors;
  },

  async bumpVisitors() {
    const d = db();
    d.visitors += 1;
    return d.visitors;
  },

  async commitBid(input: CommitBidInput): Promise<CommitBidResult> {
    const d = db();

    // Idempotency: a replayed payment returns the original outcome rather than
    // bidding again. Node runs this synchronously, so the check and the write
    // cannot interleave with another request.
    if (input.paymentRef) {
      const seen = d.applied.get(input.paymentRef);
      if (seen) {
        const existing = d.submissions.find((s) => s.id === seen);
        return {
          ok: true,
          duplicate: true,
          submission: existing ? { ...existing } : undefined,
        };
      }
    }

    let submission: Submission;
    let previousBid: number | null = null;

    if (input.submissionId) {
      const existing = d.submissions.find((s) => s.id === input.submissionId);
      if (!existing) return { ok: false, error: 'No such case file.' };

      const floor = priceToBeat(existing.currentBid);
      if (input.amount < floor) {
        return {
          ok: false,
          error: `You need at least $${floor.toLocaleString('en-US')} to take this slot.`,
        };
      }

      previousBid = existing.currentBid;
      existing.currentBid = input.amount;
      existing.bidderName = input.bidderName;
      existing.claimedAt = new Date().toISOString();
      existing.status = 'active';
      submission = existing;
    } else {
      if (!input.newCase) return { ok: false, error: 'Missing case details.' };
      submission = {
        id: id('sub'),
        title: input.newCase.title.slice(0, LIMITS.title),
        tagline: input.newCase.tagline.slice(0, LIMITS.tagline),
        url: input.newCase.url.slice(0, LIMITS.url),
        logoUrl: input.newCase.logoUrl,
        category: input.newCase.category,
        currentBid: input.amount,
        bidderName: input.bidderName,
        claimedAt: new Date().toISOString(),
        status: 'active',
      };
      d.submissions.push(submission);
    }

    d.bids.push({
      id: id('bid'),
      submissionId: submission.id,
      amount: input.amount,
      bidderName: input.bidderName,
      createdAt: new Date().toISOString(),
      previousBid,
    });

    if (input.paymentRef) d.applied.set(input.paymentRef, submission.id);

    return { ok: true, submission: { ...submission } };
  },
};
