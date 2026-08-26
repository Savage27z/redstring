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
