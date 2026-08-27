'use client';

/**
 * Which case files this browser can raise.
 *
 * There are no accounts, so the proof of ownership is a token the server mints
 * once when a case is pinned and hands to the payer's browser. It lives in
 * localStorage: whoever holds it can add to that bid, and nobody else can.
 *
 * Losing it means losing the ability to top up — which is the honest cost of
 * having no signup. Pinning a fresh case always still works.
 */

const KEY = 'redstring.cases.v1';

type Owned = Record<string, string>;

function read(): Owned {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Owned) : {};
  } catch {
    // Private mode, disabled storage, corrupted value — treat as "owns nothing"
    // rather than breaking the board.
    return {};
  }
}

export function rememberCase(submissionId: string, manageToken: string): void {
  if (typeof window === 'undefined') return;
  try {
    const owned = read();
    owned[submissionId] = manageToken;
    window.localStorage.setItem(KEY, JSON.stringify(owned));
  } catch {
    /* storage unavailable; top-up simply won't be offered later */
  }
}

export function manageTokenFor(submissionId: string): string | undefined {
  return read()[submissionId];
}

export function ownsCase(submissionId: string): boolean {
  return Boolean(read()[submissionId]);
}
