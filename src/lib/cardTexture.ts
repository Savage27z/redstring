'use client';

/**
 * Draws a case file to a 2D canvas, which becomes the texture on its 3D plane.
 *
 * Stocks follow the reference board: white-bordered instant photos with a deep
 * green field, yellow sticky notes with a curled corner, and ruled notepaper
 * with a red margin and punch holes. Doing the paper artwork and the type in
 * one canvas keeps them registered at any card size, and costs one texture per
 * card instead of a mesh per glyph.
 */

export type PaperStock = 'photo' | 'sticky' | 'lined' | 'scrap';

export interface CardSpec {
  title: string;
  tagline: string;
  bid: number;
  bidder: string;
  rank: number;
  claimedAt: string;
  stock: PaperStock;
}

/**
 * Big money gets a photo — the dominant, most "evidence" object on the wall.
 * Mid-board alternates sticky and ruled paper so the wall has the same mixed
 * stationery texture as the reference instead of one card repeated 15 times.
 */
export function stockForRank(rank: number, area: number): PaperStock {
  if (area < 0.0035) return 'scrap';
  if (rank <= 3) return 'photo';
  if (area > 0.028) return 'photo';
  return rank % 2 === 0 ? 'sticky' : 'lined';
}

const GREEN = '#2f7d6d';
const GREEN_DARK = '#245f53';
const PHOTO_BORDER = '#fcfbf6';
const STICKY = '#f6cb47';
const STICKY_DEEP = '#e8b52f';
const PAPER = '#fdfcf7';
const RULE = '#aebfd4';
const MARGIN_RED = '#d4736b';
const INK = '#20211d';
const RED = '#8e2a22';

function fontVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? v + ', ' + fallback : fallback;
}

function caseFont(size: number): string {
  return Math.round(size) + 'px ' + fontVar('--font-special-elite', 'Courier New, monospace');
}

function bodyFont(size: number, weight = 400): string {
  return weight + ' ' + Math.round(size) + 'px ' + fontVar('--font-archivo', 'system-ui, sans-serif');
}

function money(n: number): string {
  return '$' + n.toLocaleString('en-US');
}

function since(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - +new Date(iso)) / 60000));
  if (mins < 1) return 'JUST NOW';
  if (mins < 60) return mins + 'M AGO';
  const h = Math.round(mins / 60);
  if (h < 24) return h + 'H AGO';
  return Math.round(h / 24) + 'D AGO';
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width <= maxW) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length) {
    let last = lines[lines.length - 1];
    if (ctx.measureText(last).width > maxW) {
      while (last.length > 1 && ctx.measureText(last + '…').width > maxW) {
        last = last.slice(0, -1);
      }
      lines[lines.length - 1] = last + '…';
    }
  }
  return lines;
}

/** Fine paper tooth, so no stock reads as a flat vector fill. */
function grain(ctx: CanvasRenderingContext2D, W: number, H: number, amount: number) {
  const n = Math.floor((W * H) / 30);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const a = Math.random() * amount;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,' + a + ')' : 'rgba(255,255,255,' + a + ')';
    ctx.fillRect(Math.random() * W, Math.random() * H, 1.4, 1.4);
  }
  ctx.restore();
}

/** The lifted corner on the reference's sticky notes. */
function curledCorner(ctx: CanvasRenderingContext2D, W: number, H: number, size: number) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(W, H);
  ctx.lineTo(W - size, H);
  ctx.lineTo(W, H - size);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.filter = 'blur(' + Math.max(1, size * 0.14) + 'px)';
  ctx.fill();
  ctx.filter = 'none';

  const g = ctx.createLinearGradient(W - size, H - size, W, H);
  g.addColorStop(0, 'rgba(255,255,255,0.92)');
  g.addColorStop(1, 'rgba(205,175,90,0.95)');
  ctx.beginPath();
  ctx.moveTo(W, H);
  ctx.lineTo(W - size * 0.92, H);
  ctx.lineTo(W, H - size * 0.92);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

export function drawCard(spec: CardSpec, W: number, H: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(8, Math.round(W));
  canvas.height = Math.max(8, Math.round(H));
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  const S = Math.min(w, h);

  const big = w > 175 && h > 130;
  const mid = w > 92 && h > 60;

  if (spec.stock === 'photo') drawPhoto(ctx, w, h, S, spec, big, mid);
  else if (spec.stock === 'sticky') drawSticky(ctx, w, h, S, spec, big, mid);
  else if (spec.stock === 'lined') drawLined(ctx, w, h, S, spec, big, mid);
  else drawScrap(ctx, w, h, spec);

  // rank chip — the one element every card carries at every size
  if (h >= 20 && w >= 20) {
    const chip = Math.max(13, S * 0.1);
    ctx.fillStyle = spec.rank === 1 ? RED : 'rgba(24,22,18,0.82)';
    ctx.fillRect(0, 0, chip * 1.55, chip * 1.2);
    ctx.fillStyle = '#f6f2e6';
    ctx.font = caseFont(chip * 0.76);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(String(spec.rank), chip * 0.78, chip * 0.62);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  grain(ctx, w, h, spec.stock === 'photo' ? 0.045 : 0.06);

  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

  return canvas;
}

/* ------------------------------------------------------------------ photo */
function drawPhoto(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  S: number,
  spec: CardSpec,
  big: boolean,
  mid: boolean,
) {
  ctx.fillStyle = PHOTO_BORDER;
  ctx.fillRect(0, 0, w, h);

  const b = Math.max(3, S * 0.055);
  const ix = b;
  const iy = b;
  const iw = w - b * 2;
  const ih = h - b * 2;

  const g = ctx.createLinearGradient(0, iy, 0, iy + ih);
  g.addColorStop(0, GREEN);
  g.addColorStop(1, GREEN_DARK);
  ctx.fillStyle = g;
  ctx.fillRect(ix, iy, iw, ih);

  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = Math.max(1, S * 0.008);
  ctx.strokeRect(ix, iy, iw, ih);

  if (!mid) return;

  const pad = Math.max(5, S * 0.055);
  ctx.textAlign = 'left';

  if (big) {
    let y = iy + pad + S * 0.09;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = caseFont(S * 0.045);
    ctx.fillText('CASE ' + String(spec.rank).padStart(3, '0'), ix + pad, y);

    ctx.fillStyle = '#ffffff';
    const titleSize = Math.min(S * 0.15, iw * 0.15);
    ctx.font = caseFont(titleSize);
    y += S * 0.02;
    for (const ln of wrap(ctx, spec.title, iw - pad * 2, 2)) {
      y += titleSize * 1.02;
      ctx.fillText(ln, ix + pad, y);
    }

    if (spec.tagline) {
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      const tSize = Math.max(9, Math.min(S * 0.058, iw * 0.058));
      ctx.font = bodyFont(tSize);
      y += S * 0.035;
      for (const ln of wrap(ctx, spec.tagline, iw - pad * 2, 3)) {
        y += tSize * 1.32;
        ctx.fillText(ln, ix + pad, y);
      }
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = caseFont(Math.min(S * 0.14, iw * 0.19));
    ctx.textAlign = 'right';
    ctx.fillText(money(spec.bid), ix + iw - pad, iy + ih - pad);
    ctx.textAlign = 'left';

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = caseFont(S * 0.042);
    ctx.fillText(spec.bidder.toUpperCase(), ix + pad, iy + ih - pad);
    ctx.fillText(since(spec.claimedAt), ix + pad, iy + ih - pad - S * 0.055);
  } else {
    ctx.fillStyle = '#ffffff';
    const t = Math.min(S * 0.17, w * 0.13);
    ctx.font = caseFont(t);
    for (const ln of wrap(ctx, spec.title, iw - pad, 1)) {
      ctx.fillText(ln, ix + pad * 0.6, iy + pad + t);
    }
    ctx.font = caseFont(Math.min(S * 0.18, w * 0.15));
    ctx.fillText(money(spec.bid), ix + pad * 0.6, iy + ih - pad * 0.7);
  }
}
