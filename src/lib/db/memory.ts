import { MOCK_SUBMISSIONS, MOCK_BIDS } from '../mock';
import { priceToBeat } from '../types';
import { LIMITS } from '../validation';
import type { BidEvent, Submission } from '../types';
import type { CommitBidInput, CommitBidResult, StoreAdapter } from './adapter';

/**
 * In-memory store.
 *
 * Starts EMPTY. Demo cases are fabricated activity — invented companies,
 * invented bidders, an invented amount raised — and shipping that on a live
 * site is misleading social proof, not seed data. Set SEED_DEMO_BOARD=1 to load
 * the sample board locally when you want something to look at.
 *
 * State resets on restart, so this is not suitable for anything that has taken
 * money; set DATABASE_URL to switch to Postgres.
 */

const seedDemo = process.env.SEED_DEMO_BOARD === '1';

interface Db {
  submissions: Submission[];
  bids: BidEvent[];
  visitors: number;
  /** submission id -> payment identity; deliberately not part of BoardState */
  owners: Map<string, { ownerId: string | null; contactEmail: string | null }>;
  /** paymentRef -> submission id, for idempotent replays */
  applied: Map<string, string>;
}

const globalForDb = globalThis as unknown as { __redstringDb?: Db };

function db(): Db {
  if (!globalForDb.__redstringDb) {
    globalForDb.__redstringDb = {
      submissions: seedDemo ? MOCK_SUBMISSIONS.map((s) => ({ ...s })) : [],
      bids: seedDemo ? MOCK_BIDS.map((b) => ({ ...b })) : [],
      visitors: 0,
      applied: new Map(),
      owners: new Map(),
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
    if (input.ownerId || input.contactEmail) {
      d.owners.set(submission.id, {
        ownerId: input.ownerId ?? null,
        contactEmail: input.contactEmail ?? null,
      });
    }

    return { ok: true, submission: { ...submission } };
  },
};
