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

/** Deterministic [0,1) hash — same id always lands the same way. */
function rand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h % 100000);
}

/** Stationery comes in a few shapes; picking per card gives the board variety. */
function aspectFor(seed: number, rank: number): number {
  const r = rand(seed * 3.1);
  if (rank <= 3) return r > 0.5 ? 1.34 : 1.12; // photos, landscape-ish
  if (r < 0.34) return 1.0; // square sticky
  if (r < 0.67) return 0.78; // portrait notepaper
  return 1.28; // landscape photo
}

interface Box {
  id: string;
  x: number; // centre, in board units (0..aspect, 0..1)
  y: number;
  w: number;
  h: number;
  rank: number;
  share: number;
  seed: number;
}

function overlap(a: Box, b: Box, pad: number): number {
  const dx = Math.abs(a.x - b.x) - (a.w + b.w) / 2 - pad;
  const dy = Math.abs(a.y - b.y) - (a.h + b.h) / 2 - pad;
  if (dx >= 0 || dy >= 0) return 0;
  return Math.min(-dx, -dy);
}

export function layoutScatter(entries: ScatterEntry[], aspect = 1.5): BoardCell[] {
  const valid = entries.filter((e) => e.bidAmount > 0);
  if (valid.length === 0) return [];

  const total = valid.reduce((s, e) => s + e.bidAmount, 0) || 1;

  const ranked = [...valid].sort(
    (a, b) => b.bidAmount - a.bidAmount || a.id.localeCompare(b.id),
  );

  // --- sizes: strictly ordered by bid -------------------------------------
  const weights = ranked.map((e) => Math.pow(e.bidAmount / total, GAMMA));
  const weightSum = weights.reduce((s, w) => s + w, 0) || 1;
  const boardArea = aspect * 1;

  /** Smallest card that still reads as a pinned scrap rather than a speck. */
  const MIN_AREA = 0.0028;

  const boxes: Box[] = ranked.map((e, i) => {
    const seed = hashId(e.id);
    const r = aspectFor(seed, i + 1);

    // Clamp AREA, never width and height separately: two cards pushed onto a
    // per-dimension floor end up with different areas depending on their
    // aspect, which can make a lower bid render larger than a higher one and
    // silently break the whole mechanic.
    let area = Math.max((weights[i] / weightSum) * boardArea * FILL, MIN_AREA);
    let w = Math.sqrt(area * r);
    let h = Math.sqrt(area / r);

    // Keep a runaway top bid inside the panel, scaling uniformly so the
    // area ordering survives.
    const fit = Math.min(1, (aspect * 0.42) / w, 0.42 / h);
    w *= fit;
    h *= fit;
    area = w * h;

    return {
      id: e.id,
      x: 0,
      y: 0,
      w,
      h,
      rank: i + 1,
      share: e.bidAmount / total,
      seed,
    };
  });

  // Belt and braces: whatever the clamps did, area must never increase as rank
  // falls. This is the one property the site cannot get wrong.
  for (let i = 1; i < boxes.length; i++) {
    const prev = boxes[i - 1].w * boxes[i - 1].h;
    const cur = boxes[i].w * boxes[i].h;
    if (cur > prev) {
      const s = Math.sqrt(prev / cur);
      boxes[i].w *= s;
      boxes[i].h *= s;
    }
  }

  // --- placement: unordered, but deterministic ----------------------------
  const margin = 0.035;
  const minX = (b: Box) => b.w / 2 + margin;
  const maxX = (b: Box) => aspect - b.w / 2 - margin;
  const minY = (b: Box) => b.h / 2 + margin;
  const maxY = (b: Box) => 1 - b.h / 2 - margin;

  const clamp = (b: Box) => {
    b.x = Math.min(Math.max(b.x, minX(b)), Math.max(minX(b), maxX(b)));
    b.y = Math.min(Math.max(b.y, minY(b)), Math.max(minY(b), maxY(b)));
  };

  const placed: Box[] = [];

  for (const b of boxes) {
    let best = { x: aspect / 2, y: 0.5, score: Infinity };
    // Try a spread of candidate spots and keep the least-crowded one. 40 is
    // plenty to look random while reliably finding a gap.
    for (let k = 0; k < 40; k++) {
      const cx = minX(b) + rand(b.seed + k * 7.3) * Math.max(0, maxX(b) - minX(b));
      const cy = minY(b) + rand(b.seed + k * 13.9 + 500) * Math.max(0, maxY(b) - minY(b));
      const cand = { ...b, x: cx, y: cy };

      let score = 0;
      for (const p of placed) score += overlap(cand, p, 0.018) * 100;
      // Only the faintest pull toward centre. Anything stronger piles every
      // card into the middle and leaves the corners of the cork bare.
      const dx = (cx - aspect / 2) / aspect;
      const dy = cy - 0.5;
      score += (dx * dx + dy * dy) * 0.12;

      if (score < best.score) best = { x: cx, y: cy, score };
      if (score < 0.02) break;
    }
    b.x = best.x;
    b.y = best.y;
    clamp(b);
    placed.push(b);
  }

  // --- relaxation: push the stragglers apart ------------------------------
  for (let pass = 0; pass < 90; pass++) {
    let moved = false;
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        const o = overlap(a, b, 0.016);
        if (o <= 0) continue;
        moved = true;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        dx /= d;
        dy /= d;
        // bigger cards hold their ground; small ones get shoved aside
        const aMass = a.w * a.h;
        const bMass = b.w * b.h;
        const t = aMass / (aMass + bMass);
        const push = o * 0.52;
        a.x -= dx * push * (1 - t);
        a.y -= dy * push * (1 - t);
        b.x += dx * push * t;
        b.y += dy * push * t;
        clamp(a);
        clamp(b);
      }
    }
    if (!moved) break;
  }

  // --- emit, normalized to 0..1 with a top-left origin ---------------------
  return placed.map((b) => ({
    id: b.id,
    x: (b.x - b.w / 2) / aspect,
    y: b.y - b.h / 2,
    w: b.w / aspect,
    h: b.h,
    rank: b.rank,
    share: b.share,
  }));
}
