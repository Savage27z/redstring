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
