import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';

/**
 * One Postgres pool, and one place that guarantees the schema exists.
 *
 * The database is only reachable from inside the platform's private network,
 * so there is no convenient moment to run `psql < schema.sql` by hand. Instead
 * the app applies it once per process before the first query. Every statement
 * in schema.sql is `CREATE ... IF NOT EXISTS`, so this is safe to run on every
 * boot and on every instance, and it means a fresh database — or a future one —
 * needs no manual step at all.
 */

const globalForDb = globalThis as unknown as {
  __redstringPool?: Pool;
  __redstringSchema?: Promise<void>;
};

export function getPool(): Pool {
  if (!globalForDb.__redstringPool) {
    globalForDb.__redstringPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      // Managed Postgres (Railway, Supabase, Neon) terminates TLS with certs
      // Node does not chain to by default.
      ssl: process.env.DATABASE_SSL === 'false' ? undefined : { rejectUnauthorized: false },
    });
  }
  return globalForDb.__redstringPool;
}

async function applySchema(): Promise<void> {
  const file = path.join(process.cwd(), 'schema.sql');
  const sql = await readFile(file, 'utf8');
  await getPool().query(sql);
  console.log('[db] schema applied');
}

/** Runs at most once per process; every caller awaits the same promise. */
export function ensureSchema(): Promise<void> {
  if (!globalForDb.__redstringSchema) {
    globalForDb.__redstringSchema = applySchema().catch((err) => {
      // Clear the cache so the next request retries rather than serving a
      // permanently broken store because of one transient failure at boot.
      globalForDb.__redstringSchema = undefined;
      console.error('[db] could not apply schema', err);
      throw err;
    });
  }
  return globalForDb.__redstringSchema;
}
