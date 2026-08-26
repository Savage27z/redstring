-- redstring.lol — Postgres schema
--
-- The in-memory store in src/lib/store.ts is the default so a clean clone runs
-- with zero config. Point DATABASE_URL at a Postgres instance, run this file,
-- then swap the four marked functions in store.ts for SQL. Nothing else changes.

CREATE TABLE IF NOT EXISTS submissions (
  id           TEXT PRIMARY KEY,
  title        TEXT        NOT NULL,
  tagline      TEXT        NOT NULL DEFAULT '',
  url          TEXT        NOT NULL,
  logo_url     TEXT,
  category     TEXT        NOT NULL DEFAULT 'other',
  current_bid  INTEGER     NOT NULL CHECK (current_bid > 0),
  bidder_name  TEXT        NOT NULL DEFAULT 'anon',
  claimed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  status       TEXT        NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'pending', 'removed'))
);

-- The board query is "active submissions, highest bid first" on every render.
CREATE INDEX IF NOT EXISTS submissions_board_idx
  ON submissions (current_bid DESC)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS bid_history (
  id             TEXT PRIMARY KEY,
  submission_id  TEXT        NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  amount         INTEGER     NOT NULL CHECK (amount > 0),
  bidder_name    TEXT        NOT NULL DEFAULT 'anon',
  previous_bid   INTEGER,
  stripe_session TEXT UNIQUE,          -- idempotency: one session, one bid
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bid_history_recent_idx
  ON bid_history (created_at DESC);

CREATE INDEX IF NOT EXISTS bid_history_submission_idx
  ON bid_history (submission_id, created_at DESC);

CREATE TABLE IF NOT EXISTS counters (
  key   TEXT PRIMARY KEY,
  value BIGINT NOT NULL DEFAULT 0
);

INSERT INTO counters (key, value) VALUES ('visitors', 0)
  ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Placing a bid must be atomic: the floor check and the write have to happen in
-- the same transaction, or two simultaneous bidders can both "win" the slot.
--
--   BEGIN;
--     SELECT current_bid FROM submissions WHERE id = $1 FOR UPDATE;
--     -- reject here if $2 <= current_bid
--     UPDATE submissions
--        SET current_bid = $2, bidder_name = $3, claimed_at = now()
--      WHERE id = $1;
--     INSERT INTO bid_history (id, submission_id, amount, bidder_name,
--                              previous_bid, stripe_session)
--     VALUES ($4, $1, $2, $3, $5, $6);
--   COMMIT;
--
-- The stripe_session UNIQUE constraint makes webhook retries idempotent —
-- Stripe redelivers on any non-2xx, and without it a flaky deploy double-counts.
-- ---------------------------------------------------------------------------
