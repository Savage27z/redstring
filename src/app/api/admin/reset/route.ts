import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getPool, ensureSchema } from '@/lib/db/pool';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Wipes the board.
 *
 * This exists because the database is only reachable from inside Railway's
 * private network — there is no public endpoint, and adding one just to run a
 * DELETE would expose the whole database to the internet for the sake of two
 * rows. Going through the app keeps it internal.
 *
 * Fails closed. With ADMIN_RESET_TOKEN unset the route 404s, which is the state
 * it should be left in: unset the variable once the reset is done and this
 * becomes inert without needing a deploy to remove it.
 *
 * Returns everything it deleted, so the response is the backup.
 */

function authorized(req: Request): boolean {
  const expected = process.env.ADMIN_RESET_TOKEN;
  if (!expected) return false;

  const got = req.headers.get('x-admin-token') ?? '';
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, so check that separately.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  // Absent token means the route does not exist, rather than "forbidden" —
  // a 403 would confirm to a prober that there is something here to attack.
  if (!process.env.ADMIN_RESET_TOKEN) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await ensureSchema();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Read before destroying: the caller gets the rows back as a record.
    const submissions = (await client.query('SELECT * FROM submissions')).rows;
    const history = (await client.query('SELECT * FROM bid_history')).rows;
    const intents = (await client.query('SELECT * FROM payment_intents')).rows;

    // bid_history cascades from submissions, but deleting it explicitly keeps
    // this correct if the foreign key is ever relaxed.
    await client.query('DELETE FROM bid_history');
    await client.query('DELETE FROM submissions');
    await client.query('DELETE FROM payment_intents');

    await client.query('COMMIT');

    return NextResponse.json(
      {
        ok: true,
        deleted: {
          submissions: submissions.length,
          bidHistory: history.length,
          paymentIntents: intents.length,
        },
        backup: { submissions, bidHistory: history, paymentIntents: intents },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[admin/reset] failed', err);
    return NextResponse.json({ error: 'Reset failed.' }, { status: 500 });
  } finally {
    client.release();
  }
}
