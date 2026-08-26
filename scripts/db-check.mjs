/**
 * Smoke-test the database wiring: connectivity, tables, and the unique index
 * that makes Stripe webhook replays idempotent.
 *
 *   DATABASE_URL=postgres://... npm run db:check
 *
 * Talks to pg directly rather than importing the app's adapter, so it works as
 * a plain node script with no build step.
 */
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set — nothing to check.');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? undefined : { rejectUnauthorized: false },
});

const problems = [];

try {
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
  );
  const have = new Set(rows.map((r) => r.table_name));

  for (const t of ['submissions', 'bid_history', 'counters']) {
    const ok = have.has(t);
    console.log(`${ok ? 'ok     ' : 'MISSING'} table ${t}`);
    if (!ok) problems.push(`table ${t}`);
  }

  const uniq = await pool.query(
    `SELECT 1 FROM pg_indexes
      WHERE tablename = 'bid_history' AND indexdef ILIKE '%UNIQUE%stripe_session%'`,
  );
  if (uniq.rowCount) {
    console.log('ok      unique index on bid_history.stripe_session (webhook idempotency)');
  } else {
    console.log('MISSING unique index on bid_history.stripe_session');
    problems.push('unique index on bid_history.stripe_session — webhook replays would double-count');
  }

  if (problems.length) {
    console.error(`\n${problems.length} problem(s). Run schema.sql against this database.`);
    process.exit(1);
  }
  console.log('\nDatabase looks correct.');
  process.exit(0);
} catch (err) {
  console.error('Could not reach the database:', err.message);
  process.exit(1);
} finally {
  await pool.end().catch(() => {});
}
