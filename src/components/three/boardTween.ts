'use client';

import { createContext, useContext } from 'react';
import type { BoardCell } from '@/lib/scatter';

/**
 * Shared, mutable tween state for the board.
 *
 * In the DOM version the tween could live in React state. Here it cannot:
 * re-rendering the tree every frame would reconcile every card and every strand
 * at 60fps. So exactly one `useFrame` advances this store, and cards and string
 * both *read* it during their own frame callbacks. One writer, many readers,
 * no React involved — which is also what guarantees the string stays attached
 * to the pins it's tied to.
 */

export interface LiveRect {
  x: number;
  y: number;
  w: number;
  h: number;
  rank: number;
}
