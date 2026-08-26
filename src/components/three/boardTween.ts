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

export class BoardTweenStore {
  /** where each card is right now */
  current = new Map<string, LiveRect>();
  /** where each card is headed */
  targets = new Map<string, BoardCell>();
  /** true while anything is still meaningfully in motion */
  animating = false;

  setTargets(cells: BoardCell[], snap: boolean) {
    this.targets = new Map(cells.map((c) => [c.id, c]));

    for (const c of cells) {
      const cur = this.current.get(c.id);
      if (!cur || snap) {
        // New cards materialise at their final geometry; the pin-drop animates
        // them in separately, so they don't slide in from (0,0).
        this.current.set(c.id, { x: c.x, y: c.y, w: c.w, h: c.h, rank: c.rank });
      } else {
        cur.rank = c.rank;
      }
    }

    // drop cards that left the board
    for (const id of [...this.current.keys()]) {
      if (!this.targets.has(id)) this.current.delete(id);
    }

    this.animating = !snap;
  }

  /** Exponential approach — frame-rate independent, settles without overshoot. */
  advance(delta: number, speed = 5.5): boolean {
    if (!this.animating) return false;
    const k = 1 - Math.exp(-speed * delta);
    let moving = false;

    for (const [id, tgt] of this.targets) {
      const cur = this.current.get(id);
      if (!cur) continue;
      cur.x += (tgt.x - cur.x) * k;
      cur.y += (tgt.y - cur.y) * k;
      cur.w += (tgt.w - cur.w) * k;
      cur.h += (tgt.h - cur.h) * k;

      if (
        Math.abs(tgt.x - cur.x) > 1e-4 ||
        Math.abs(tgt.y - cur.y) > 1e-4 ||
        Math.abs(tgt.w - cur.w) > 1e-4 ||
        Math.abs(tgt.h - cur.h) > 1e-4
      ) {
        moving = true;
      } else {
        cur.x = tgt.x;
        cur.y = tgt.y;
        cur.w = tgt.w;
        cur.h = tgt.h;
      }
    }

    this.animating = moving;
    return true;
  }

  get(id: string): LiveRect | undefined {
    return this.current.get(id);
  }
}

export const BoardTweenContext = createContext<BoardTweenStore | null>(null);

export function useBoardTween(): BoardTweenStore {
  const store = useContext(BoardTweenContext);
  if (!store) throw new Error('useBoardTween must be used inside the board canvas');
  return store;
}
