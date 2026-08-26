/**
 * Scatter layout — how case files actually land on a corkboard.
 *
 * A treemap packs the board edge to edge in strict rank order, which is
 * legible but looks like a dashboard, not evidence. Real boards are pinned:
 * cards sit at unrelated positions with cork showing between them, and you
 * work out who matters from SIZE, not from reading order.
 *
 * So: size is strictly ranked by bid (that's the mechanic and it stays exact),
 * position is deliberately unordered. Placement is deterministic per id, so the
 * board looks hand-pinned but never reshuffles on reload.
 */

export interface ScatterEntry {
  id: string;
  bidAmount: number;
}

export interface BoardCell {
  id: string;
  /** normalized 0..1 of board width / height, top-left origin */
  x: number;
  y: number;
  w: number;
  h: number;
  rank: number;
  share: number;
}

/** Fraction of the cork actually covered by paper. The rest is breathing room. */
const FILL = 0.54;

/**
 * Bids are wildly skewed ($2400 vs $5). Raw area-proportional sizing makes the
 * tail literally sub-pixel, so area follows share^GAMMA: still strictly
 * monotonic — #1 is always visibly biggest — but the bottom of the board stays
 * a readable card instead of a speck.
 */
const GAMMA = 0.62;
