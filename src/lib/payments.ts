import { Polar } from '@polar-sh/sdk';

/**
 * Payments run on Polar (merchant of record), not Stripe.
 *
 * Two things differ from a Stripe integration and both matter:
 *
 * 1. A checkout is created against a *product*, not an ad-hoc line item. Bids
 *    are arbitrary amounts, so we attach a one-off fixed price to the product
 *    per checkout — the buyer cannot edit it, unlike pay-what-you-want.
 * 2. The event that means "money moved" is `order.paid`, and the idempotency
 *    key is the order id.
 */

export interface PolarConfig {
  accessToken: string;
  productId: string;
  server: 'sandbox' | 'production';
}

/** Null when payments are not configured, which is what puts dev mode in play. */
export function polarConfig(): PolarConfig | null {
  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  const productId = process.env.POLAR_PRODUCT_ID;
  if (!accessToken || !productId) return null;

  return {
    accessToken,
    productId,
    // Default to sandbox: shipping to production must be a deliberate act, not
    // something you get by forgetting to set a variable.
    server: process.env.POLAR_SERVER === 'production' ? 'production' : 'sandbox',
  };
}

export function polarClient(config: PolarConfig): Polar {
  return new Polar({ accessToken: config.accessToken, server: config.server });
}

/** Polar deals in minor units, same as Stripe. */
export function toMinorUnits(wholeDollars: number): number {
  return Math.round(wholeDollars * 100);
}

export function fromMinorUnits(minor: number): number {
  return Math.floor(minor / 100);
}
