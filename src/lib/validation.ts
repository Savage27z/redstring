import { MIN_BID } from './types';
import type { Category } from './types';
import { CATEGORIES } from './types';

/**
 * One place where every limit lives.
 *
 * These used to be enforced inside `placeBid` — which runs *after* Polar has
 * taken the payment. Anything oversized therefore failed at the point where the
 * money was already gone. Validation now happens before a Checkout session is
 * ever created, and the store re-applies it as defence in depth.
 */

export const LIMITS = {
  title: 60,
  tagline: 140,
  url: 200,
  bidderName: 40,
  /**
   * A ceiling keeps one bid from flattening every other card to the same
   * minimum size, and keeps the charge inside sane processor limits. Raise it
   * deliberately rather than by accident.
   */
  maxBid: 250_000,
} as const;

/** Polar metadata values are capped at 500 characters per key. */
export const METADATA_VALUE_MAX = 500;

export interface NewCaseInput {
  title: string;
  tagline: string;
  url: string;
  logoUrl: string | null;
  category: Category;
}

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Accepts only absolute http(s) URLs and returns the normalized form.
 *
 * Rejecting other schemes matters less for injection than it looks — React
 * neutralizes `javascript:` hrefs on render — but a paid directory should not
 * publish `data:`, `file:` or bare garbage as a destination.
 */
export function normalizeUrl(raw: unknown): Validated<string> {
  const input = clean(raw);
  if (!input) return { ok: false, error: 'A case needs a URL.' };
  if (input.length > LIMITS.url) {
    return { ok: false, error: `URLs are limited to ${LIMITS.url} characters.` };
  }

  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, error: 'That does not look like a valid URL.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'Only http and https links are allowed.' };
  }
  if (!parsed.hostname.includes('.') || parsed.hostname.endsWith('.')) {
    return { ok: false, error: 'That does not look like a valid domain.' };
  }

  const normalized = parsed.toString();
  if (normalized.length > LIMITS.url) {
    return { ok: false, error: `URLs are limited to ${LIMITS.url} characters.` };
  }
  return { ok: true, value: normalized };
}

export function validateAmount(raw: unknown, floor = MIN_BID): Validated<number> {
  const amount = Math.floor(Number(raw));
  if (!Number.isFinite(amount)) {
    return { ok: false, error: 'That is not a valid amount.' };
  }
  if (amount < floor) {
    return { ok: false, error: `You need at least $${floor.toLocaleString('en-US')}.` };
  }
  if (amount > LIMITS.maxBid) {
    return {
      ok: false,
      error: `The maximum bid is $${LIMITS.maxBid.toLocaleString('en-US')}.`,
    };
  }
  return { ok: true, value: amount };
}

export function normalizeBidderName(raw: unknown): string {
  const name = clean(raw).slice(0, LIMITS.bidderName);
  return name || 'anon';
}

export function validateNewCase(raw: unknown): Validated<NewCaseInput> {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Missing case details.' };
  }
  const input = raw as Record<string, unknown>;

  const title = clean(input.title);
  if (!title) return { ok: false, error: 'A case needs a name.' };
  if (title.length > LIMITS.title) {
    return { ok: false, error: `Names are limited to ${LIMITS.title} characters.` };
  }

  const tagline = clean(input.tagline);
  if (tagline.length > LIMITS.tagline) {
    return { ok: false, error: `Taglines are limited to ${LIMITS.tagline} characters.` };
  }

  const url = normalizeUrl(input.url);
  if (!url.ok) return url;

  const category = CATEGORIES.some((c) => c.value === input.category)
    ? (input.category as Category)
    : 'other';

  const logoUrl = input.logoUrl == null ? null : normalizeUrl(input.logoUrl);
  if (logoUrl && typeof logoUrl !== 'string' && !logoUrl.ok) return logoUrl;

  return {
    ok: true,
    value: {
      title,
      tagline,
      url: url.value,
      logoUrl: logoUrl === null ? null : (logoUrl as { value: string }).value,
      category,
    },
  };
}

/**
 * The webhook rebuilds a submission from Checkout metadata, so the payload has
 * to survive the round trip intact. Truncating it produced invalid JSON, which
 * silently dropped a submission the customer had already paid for — so we
 * refuse up front instead of slicing.
 */
export function encodeCaseMetadata(value: NewCaseInput): Validated<string> {
  const json = JSON.stringify(value);
  if (json.length > METADATA_VALUE_MAX) {
    return { ok: false, error: 'Those details are too long to submit.' };
  }
  return { ok: true, value: json };
}
