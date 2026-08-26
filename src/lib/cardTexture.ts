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
