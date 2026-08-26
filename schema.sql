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
