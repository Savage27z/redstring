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
  -- Identity of record, captured from the payment (Polar customer id) rather
  -- than asserted by the client. bidder_name is only a display label and is
  -- spoofable; this is not. Nullable so seed rows stay valid, and so swapping
  -- in a different identity provider later is a backfill, not a migration.
  owner_id       TEXT,
  -- Contact address from the payment. Never rendered on the board.
  contact_email  TEXT,
  -- SHA-256 of the token that proves this case file is yours. Only the hash is
  -- stored, so a database leak does not hand over control of every position.
  manage_token_hash TEXT,
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
  owner_id       TEXT,               -- see submissions.owner_id
  previous_bid   INTEGER,
  payment_ref    TEXT UNIQUE,          -- Polar order id: one order, one bid
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bid_history_recent_idx
  ON bid_history (created_at DESC);

CREATE INDEX IF NOT EXISTS bid_history_submission_idx
  ON bid_history (submission_id, created_at DESC);

-- "everything this account has bid on", once auth exists
CREATE INDEX IF NOT EXISTS bid_history_owner_idx
  ON bid_history (owner_id, created_at DESC)
  WHERE owner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS submissions_owner_idx
  ON submissions (owner_id)
  WHERE owner_id IS NOT NULL;

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
--                              previous_bid, payment_ref)
--     VALUES ($4, $1, $2, $3, $5, $6);
--   COMMIT;
--
-- The payment_ref UNIQUE constraint makes webhook retries idempotent —
-- Polar redelivers on any non-2xx, and without it a flaky deploy double-counts.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- Pending payments.
--
-- These MUST be durable. On Solana the reference key is the only thing that
-- links an on-chain transfer back to the bid it paid for; lose it and the payer
-- has sent money that can never be matched to anything, with no record that it
-- was ever owed. Keeping intents in memory meant a restart mid-payment did
-- exactly that.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS payment_intents (
  id             TEXT PRIMARY KEY,
  chain          TEXT        NOT NULL CHECK (chain IN ('solana', 'base')),
  amount         INTEGER     NOT NULL CHECK (amount > 0),
  amount_units   TEXT        NOT NULL,
  recipient      TEXT        NOT NULL,
  -- Solana Pay reference key. Unused on EVM, which has no equivalent.
  reference      TEXT UNIQUE,
  status         TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'confirmed', 'expired', 'failed')),
  tx_hash        TEXT,
  error          TEXT,
  -- what to apply once the money arrives
  mode           TEXT        NOT NULL DEFAULT 'claim'
                             CHECK (mode IN ('claim', 'topup')),
  submission_id  TEXT,
  -- proves a top-up is raising a case the payer actually owns
  manage_token   TEXT,
  bidder_name    TEXT        NOT NULL DEFAULT 'anon',
  new_case       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL
);

-- the settlement poller sweeps open intents by reference
CREATE INDEX IF NOT EXISTS payment_intents_open_idx
  ON payment_intents (status, expires_at)
  WHERE status = 'pending';
