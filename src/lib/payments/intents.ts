import { randomBytes } from 'node:crypto';
import type { ChainId } from './chains';
import type { NewCaseInput } from '../validation';

/**
 * Pending payments.
 *
 * A bid is created here first and only reaches the board once the chain
 * confirms the exact transfer. The intent holds everything needed to apply the
 * bid afterwards, so the amount and the case details are fixed server-side at
 * creation time and cannot be edited by whoever is paying.
 *
 * In memory, like the board itself. Losing these on restart costs an unpaid
 * checkout, not a paid placement — a payment that already landed on-chain can
 * still be claimed by transaction hash. Move them to Postgres alongside the
 * board when you switch stores.
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
  /**
   * Solana Pay reference key: a throwaway public key attached to the transfer
   * so the server can find that exact payment on-chain without the payer
   * reporting anything. Unused on EVM, which has no equivalent field.
   */
  reference?: string;
  status: IntentStatus;
  createdAt: string;
  expiresAt: string;
  /** set once settled */
  txHash?: string;
  error?: string;

  /** what to do when the money arrives */
  submissionId?: string;
  bidderName: string;
  newCase?: NewCaseInput;
}

/** Long enough to open a wallet and approve, short enough that the quoted price still holds. */
const TTL_MS = 30 * 60 * 1000;

const globalForIntents = globalThis as unknown as {
  __redstringIntents?: Map<string, PaymentIntent>;
};

const intents: Map<string, PaymentIntent> =
  globalForIntents.__redstringIntents ?? new Map();
if (process.env.NODE_ENV !== 'production') {
  globalForIntents.__redstringIntents = intents;
}

function sweep(): void {
  const now = Date.now();
  for (const [id, intent] of intents) {
    if (intent.status === 'pending' && Date.parse(intent.expiresAt) < now) {
      intent.status = 'expired';
    }
    // keep settled intents around briefly so the UI can still read them
    if (Date.parse(intent.createdAt) < now - TTL_MS * 4) intents.delete(id);
  }
}

export function createIntent(
  input: Omit<PaymentIntent, 'id' | 'status' | 'createdAt' | 'expiresAt'>,
): PaymentIntent {
  sweep();
  const now = Date.now();
  const intent: PaymentIntent = {
    ...input,
    id: `pay_${randomBytes(12).toString('hex')}`,
    status: 'pending',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + TTL_MS).toISOString(),
  };
  intents.set(intent.id, intent);
  return intent;
}

export function getIntent(id: string): PaymentIntent | undefined {
  sweep();
  return intents.get(id);
}

export function updateIntent(
  id: string,
  patch: Partial<Pick<PaymentIntent, 'status' | 'txHash' | 'error'>>,
): PaymentIntent | undefined {
  const intent = intents.get(id);
  if (!intent) return undefined;
  Object.assign(intent, patch);
  return intent;
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
