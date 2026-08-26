/**
 * Fixed-window rate limiter, in process.
 *
 * Enough to stop one client hammering Checkout — which in dev mode mutates the
 * board for free, and in production creates real Stripe sessions. Like the
 * board bus this is single-instance only; behind more than one node, move it to
 * Redis. The surface is one function.
 */

interface Window {
  count: number;
  resetAt: number;
}

const globalForLimiter = globalThis as unknown as {
  __redstringLimiter?: Map<string, Window>;
};

const buckets: Map<string, Window> =
  globalForLimiter.__redstringLimiter ?? new Map();
if (process.env.NODE_ENV !== 'production') {
  globalForLimiter.__redstringLimiter = buckets;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();

  // Opportunistic sweep so the map can't grow forever on a long-lived process.
  if (buckets.size > 5000) {
    for (const [k, w] of buckets) if (w.resetAt <= now) buckets.delete(k);
  }

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  return {
    ok: true,
    remaining: limit - existing.count,
    retryAfterSeconds: 0,
  };
}

/**
 * Best-effort client identity. Behind a proxy this is the forwarded address;
 * spoofable in principle, but it is the only handle available before auth.
 * Once Clerk lands, prefer the signed-in user id and fall back to this.
 */
export function clientKey(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}
