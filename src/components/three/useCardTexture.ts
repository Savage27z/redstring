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
