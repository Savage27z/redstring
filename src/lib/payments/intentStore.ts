import { randomBytes } from 'node:crypto';
import { getPool, ensureSchema } from '../db/pool';
import type { ChainId } from './chains';
import type { NewCaseInput } from '../validation';

/**
 * Pending payments.
 *
 * Durable when DATABASE_URL is set, in memory otherwise.
 *
 * Durability matters more here than it looks. On Solana the reference key is
 * the ONLY thing linking an on-chain transfer back to the bid it paid for. Lose
 * the intent and the payer has sent money that can never be matched to
 * anything, with no record it was ever owed — the worst failure this system can
 * produce. A restart mid-payment used to do exactly that.
 */

export type IntentStatus = 'pending' | 'confirmed' | 'expired' | 'failed';

export interface PaymentIntent {
  id: string;
  chain: ChainId;
  /** whole dollars, equals USDC 1:1 */
  amount: number;
  /** smallest USDC unit, as a decimal string (bigint is not JSON-safe) */
  amountUnits: string;
  recipient: string;
  reference?: string;
  status: IntentStatus;
  createdAt: string;
  expiresAt: string;
  txHash?: string;
  error?: string;
  submissionId?: string;
  bidderName: string;
  newCase?: NewCaseInput;
}

export type NewIntent = Omit<PaymentIntent, 'id' | 'status' | 'createdAt' | 'expiresAt'>;

/** Long enough to open a wallet and approve, short enough that the price holds. */
const TTL_MS = 30 * 60 * 1000;

function newId(): string {
  return `pay_${randomBytes(12).toString('hex')}`;
}

/* ------------------------------------------------------------------ memory */

const globalForIntents = globalThis as unknown as {
  __redstringIntents?: Map<string, PaymentIntent>;
};
const mem: Map<string, PaymentIntent> = globalForIntents.__redstringIntents ?? new Map();
if (process.env.NODE_ENV !== 'production') globalForIntents.__redstringIntents = mem;

function sweepMemory(): void {
  const now = Date.now();
  for (const [id, intent] of mem) {
    if (intent.status === 'pending' && Date.parse(intent.expiresAt) < now) {
      intent.status = 'expired';
    }
    if (Date.parse(intent.createdAt) < now - TTL_MS * 4) mem.delete(id);
  }
}

/* ---------------------------------------------------------------- postgres */

async function pool() {
  await ensureSchema();
  return getPool();
}

const usingPostgres = () => Boolean(process.env.DATABASE_URL);

/* eslint-disable @typescript-eslint/no-explicit-any */
function fromRow(r: any): PaymentIntent {
  return {
    id: r.id,
    chain: r.chain,
    amount: Number(r.amount),
    amountUnits: r.amount_units,
    recipient: r.recipient,
    reference: r.reference ?? undefined,
    status: r.status,
    createdAt: new Date(r.created_at).toISOString(),
    expiresAt: new Date(r.expires_at).toISOString(),
    txHash: r.tx_hash ?? undefined,
    error: r.error ?? undefined,
    submissionId: r.submission_id ?? undefined,
    bidderName: r.bidder_name ?? 'anon',
    newCase: r.new_case ?? undefined,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* -------------------------------------------------------------------- api */

export async function createIntent(input: NewIntent): Promise<PaymentIntent> {
  const now = Date.now();
  const intent: PaymentIntent = {
    ...input,
    id: newId(),
    status: 'pending',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + TTL_MS).toISOString(),
  };

  if (!usingPostgres()) {
    sweepMemory();
    mem.set(intent.id, intent);
    return intent;
  }

  await (await pool()).query(
    `INSERT INTO payment_intents
       (id, chain, amount, amount_units, recipient, reference, status,
        submission_id, bidder_name, new_case, created_at, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9,$10,$11)`,
    [
      intent.id,
      intent.chain,
      intent.amount,
      intent.amountUnits,
      intent.recipient,
      intent.reference ?? null,
      intent.submissionId ?? null,
      intent.bidderName,
      intent.newCase ? JSON.stringify(intent.newCase) : null,
      intent.createdAt,
      intent.expiresAt,
    ],
  );
  return intent;
}

export async function getIntent(id: string): Promise<PaymentIntent | undefined> {
  if (!usingPostgres()) {
    sweepMemory();
    return mem.get(id);
  }

  // Expire lazily on read rather than running a background job.
  await (await pool()).query(
    `UPDATE payment_intents SET status = 'expired'
      WHERE id = $1 AND status = 'pending' AND expires_at < now()`,
    [id],
  );
  const { rows } = await (await pool()).query(`SELECT * FROM payment_intents WHERE id = $1`, [id]);
  return rows[0] ? fromRow(rows[0]) : undefined;
}

export async function updateIntent(
  id: string,
  patch: Partial<Pick<PaymentIntent, 'status' | 'txHash' | 'error'>>,
): Promise<PaymentIntent | undefined> {
  if (!usingPostgres()) {
    const intent = mem.get(id);
    if (!intent) return undefined;
    Object.assign(intent, patch);
    return intent;
  }

  const { rows } = await (await pool()).query(
    `UPDATE payment_intents
        SET status  = COALESCE($2, status),
            tx_hash = COALESCE($3, tx_hash),
            error   = COALESCE($4, error)
      WHERE id = $1
  RETURNING *`,
    [id, patch.status ?? null, patch.txHash ?? null, patch.error ?? null],
  );
  return rows[0] ? fromRow(rows[0]) : undefined;
}

/** Public view — never leaks the pending case payload back to the browser. */
export function publicIntent(intent: PaymentIntent) {
  return {
    id: intent.id,
    chain: intent.chain,
    amount: intent.amount,
    amountUnits: intent.amountUnits,
    recipient: intent.recipient,
    status: intent.status,
    expiresAt: intent.expiresAt,
    txHash: intent.txHash,
    error: intent.error,
  };
}

export function intentBackend(): string {
  return usingPostgres() ? 'postgres' : 'memory';
}
