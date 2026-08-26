'use client';

import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { drawCard, stockForRank } from '@/lib/cardTexture';
import type { Submission } from '@/lib/types';

/** Board width in texture pixels. Cards get a slice of this budget. */
const TEXTURE_BUDGET = 3400;
const MAX_DIM = 1024;

/**
 * Textures are built from a card's *settled* size and the mesh is scaled during
 * the tween, so a reflow never redraws a canvas — it just moves geometry.
 * Sizes are bucketed so a window resize doesn't thrash the cache either.
 */
function bucket(v: number): number {
  return Math.max(16, Math.round(v / 24) * 24);
}

export function useCardTexture(
  submission: Submission,
  rank: number,
  targetW: number, // 0..1 of board
  targetH: number,
  boardAspect: number,
  fontsReady: boolean,
): THREE.CanvasTexture | null {
  const wpx = bucket(Math.min(MAX_DIM, targetW * TEXTURE_BUDGET));
  const hpx = bucket(Math.min(MAX_DIM, (targetH * TEXTURE_BUDGET) / boardAspect));

  const key = [
    submission.id,
    rank,
    submission.currentBid,
    submission.title,
    submission.bidderName,
    wpx,
    hpx,
    fontsReady ? 'f' : '-',
  ].join('|');

  const [, force] = useState(0);
  useEffect(() => {
    if (fontsReady) force((n) => n + 1);
  }, [fontsReady]);

  return useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = drawCard(
      {
        title: submission.title,
        tagline: submission.tagline,
        bid: submission.currentBid,
        bidder: submission.bidderName,
        rank,
        claimedAt: submission.claimedAt,
        stock: stockForRank(rank, targetW * targetH),
      },
      wpx,
      hpx,
    );
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** Resolves once the webfonts are actually available to canvas 2D. */
export function useFontsReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    if (typeof document === 'undefined' || !('fonts' in document)) {
      setReady(true);
      return;
    }
    document.fonts.ready.then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  return ready;
}
