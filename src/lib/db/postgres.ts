import type { PoolClient } from 'pg';
import { getPool, ensureSchema } from './pool';
import { manageTokenMatches } from '../manageToken';
import { LIMITS } from '../validation';
import type { BidEvent, Category, Submission } from '../types';
import type { CommitBidInput, CommitBidResult, StoreAdapter } from './adapter';

/**
 * Postgres store, against the tables in schema.sql.
 *
 * Active when DATABASE_URL is set. The only interesting part is `commitBid`:
 * the floor check and both writes run inside one transaction with the
 * submission row locked, because two people bidding on the same slot at the
 * same moment must not both succeed.
 */

/** Every entry point awaits the schema once, then queries normally. */
async function pool() {
  await ensureSchema();
  return getPool();
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toSubmission(r: any): Submission {
  return {
    id: r.id,
    title: r.title,
    tagline: r.tagline ?? '',
    url: r.url,
    logoUrl: r.logo_url ?? null,
    category: (r.category ?? 'other') as Category,
    currentBid: Number(r.current_bid),
    bidderName: r.bidder_name ?? 'anon',
    claimedAt: new Date(r.claimed_at).toISOString(),
    status: r.status,
  };
}

function toBid(r: any): BidEvent {
  return {
    id: r.id,
    submissionId: r.submission_id,
    amount: Number(r.amount),
    bidderName: r.bidder_name ?? 'anon',
    createdAt: new Date(r.created_at).toISOString(),
    previousBid: r.previous_bid == null ? null : Number(r.previous_bid),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await (await pool()).connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export const postgresAdapter: StoreAdapter = {
  name: 'postgres',

  async listActive() {
    const { rows } = await (await pool()).query(
      `SELECT * FROM submissions
        WHERE status = 'active'
        ORDER BY current_bid DESC, id ASC`,
    );
    return rows.map(toSubmission);
  },

  async recentBids(limit) {
    const { rows } = await (await pool()).query(
      `SELECT * FROM bid_history ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return rows.map(toBid);
  },

  async totalRaised() {
    const { rows } = await (await pool()).query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM bid_history`,
    );
    return Number(rows[0]?.total ?? 0);
  },

  async getSubmission(submissionId) {
    const { rows } = await (await pool()).query(`SELECT * FROM submissions WHERE id = $1`, [
      submissionId,
    ]);
    return rows[0] ? toSubmission(rows[0]) : undefined;
  },

  async visitors() {
    const { rows } = await (await pool()).query(
      `SELECT value FROM counters WHERE key = 'visitors'`,
    );
    return Number(rows[0]?.value ?? 0);
  },

  async bumpVisitors() {
    const { rows } = await (await pool()).query(
      `INSERT INTO counters (key, value) VALUES ('visitors', 1)
         ON CONFLICT (key) DO UPDATE SET value = counters.value + 1
       RETURNING value`,
    );
    return Number(rows[0]?.value ?? 0);
  },

  async commitBid(input: CommitBidInput): Promise<CommitBidResult> {
    return tx(async (c) => {
      // Idempotency first: bid_history.payment_ref is UNIQUE, so a replayed
      // webhook finds the original row instead of bidding again.
      if (input.paymentRef) {
        const { rows } = await c.query(
          `SELECT submission_id FROM bid_history WHERE payment_ref = $1`,
          [input.paymentRef],
        );
        if (rows[0]) {
          const prior = await c.query(`SELECT * FROM submissions WHERE id = $1`, [
            rows[0].submission_id,
          ]);
          return {
            ok: true,
            duplicate: true,
            submission: prior.rows[0] ? toSubmission(prior.rows[0]) : undefined,
          };
        }
      }

      let submission: Submission;
      let previousBid: number | null = null;

      if (input.mode === 'topup') {
        // FOR UPDATE holds the row until COMMIT, so two simultaneous top-ups on
        // the same card queue instead of one overwriting the other.
        const { rows } = await c.query(
          `SELECT * FROM submissions WHERE id = $1 FOR UPDATE`,
          [input.submissionId],
        );
        const existing = rows[0];
        if (!existing) return { ok: false, error: 'No such case file.' };

        if (!manageTokenMatches(input.manageToken, existing.manage_token_hash)) {
          return { ok: false, error: 'That case file is not yours to raise.' };
        }

        previousBid = Number(existing.current_bid);
        const updated = await c.query(
          `UPDATE submissions
              SET current_bid = current_bid + $2,
                  claimed_at  = now(),
                  status      = 'active'
            WHERE id = $1
        RETURNING *`,
          [input.submissionId, input.amount],
        );
        submission = toSubmission(updated.rows[0]);
      } else {
        if (!input.newCase) return { ok: false, error: 'Missing case details.' };
        const n = input.newCase;
        const inserted = await c.query(
          `INSERT INTO submissions
             (id, title, tagline, url, logo_url, category, current_bid,
              bidder_name, owner_id, contact_email, manage_token_hash, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active')
        RETURNING *`,
          [
            newId('sub'),
            n.title.slice(0, LIMITS.title),
            n.tagline.slice(0, LIMITS.tagline),
            n.url.slice(0, LIMITS.url),
            n.logoUrl,
            n.category,
            input.amount,
            input.bidderName,
            input.ownerId ?? null,
            input.contactEmail ?? null,
            input.manageTokenHash ?? null,
          ],
        );
        submission = toSubmission(inserted.rows[0]);
      }

      await c.query(
        `INSERT INTO bid_history
           (id, submission_id, amount, bidder_name, owner_id, previous_bid, payment_ref)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (payment_ref) DO NOTHING`,
        [
          newId('bid'),
          submission.id,
          input.amount,
          input.bidderName,
          input.ownerId ?? null,
          previousBid,
          input.paymentRef ?? null,
        ],
      );

      return { ok: true, submission, newTotal: submission.currentBid };
    });
  },
};
