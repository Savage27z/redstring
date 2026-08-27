import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Proof that a case file is yours, without accounts.
 *
 * When a case is pinned the server mints a token, hands the raw value to that
 * browser once, and stores only its hash. Holding the token is what lets you
 * raise your own bid later. Nobody can take over a card they did not pin, which
 * is the whole point: a bid buys size on your own listing, never control of
 * someone else's.
 *
 * Only the hash is stored, so a database leak does not hand over every board
 * position — the same reason passwords are not stored in plain text.
 */

export function newManageToken(): string {
  return randomBytes(24).toString('hex');
}

export function hashManageToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Constant-time compare, so a token cannot be guessed a character at a time. */
export function manageTokenMatches(raw: unknown, storedHash: string | null | undefined): boolean {
  if (typeof raw !== 'string' || !raw || !storedHash) return false;
  const a = Buffer.from(hashManageToken(raw), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
