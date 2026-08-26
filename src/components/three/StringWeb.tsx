'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useBoardTween } from './boardTween';
import type { BoardCell } from '@/lib/scatter';

/**
 * The red string — the thing the site is named after.
 *
 * Real swept geometry, not a line: each strand is a tube along a catenary, so
 * it catches the lamp along its upper surface and throws a shadow onto the
 * wall behind it. Topology follows the reference board: the contenders are all
 * spoked back to the prime suspect, then the rest of the wall is chained and
 * cross-tied so the string actually spans the board instead of bunching in one
 * corner.
 *
 * Geometry is rebuilt from the shared tween store — the same numbers the cards
 * read on the same frame — which is what keeps every strand welded to its pin
 * mid-reflow instead of visibly detaching.
 */

interface Props {
  cells: BoardCell[];
  boardW: number;
  boardH: number;
  hoveredId: string | null;
}

interface Edge {
  a: string;
  b: string;
  taut: boolean;
}

// Real twine is thin. The reference's string is a hairline, and fattening it
// into a rope is what made the first pass look like a diagram.
const TAUT_R = 0.0062;
const SLACK_R = 0.0048;

/**
 * Nearest-neighbour spanning web.
 *
 * Spoking every contender back to #1 produced a starburst: a dozen long
 * strands all crossing the middle of the board, which reads as a diagram and
 * buries the cards underneath it. A real board is strung between *neighbours* —
 * short hops, few crossings — so each card is tied to the closest card already
 * on the web, which yields exactly one strand per card and keeps spans short.
 *
 * The two runner-up ties to #1 are added explicitly, because that relationship
 * is the actual story the board is telling.
 */
function buildEdges(cells: BoardCell[]): Edge[] {
  const byRank = [...cells].sort((x, y) => x.rank - y.rank);
  if (byRank.length < 2) return [];

  const cx = (c: BoardCell) => c.x + c.w / 2;
  const cy = (c: BoardCell) => c.y + c.h / 2;

  const edges: Edge[] = [];
  const seen = new Set<string>();
  const key = (a: string, b: string) => (a < b ? a + '|' + b : b + '|' + a);
  const add = (a: BoardCell, b: BoardCell, taut: boolean) => {
    const k = key(a.id, b.id);
    if (a.id === b.id || seen.has(k)) return;
    seen.add(k);
    edges.push({ a: a.id, b: b.id, taut });
  };

  // Prim's, rooted at the prime suspect: at each step take the globally
  // shortest link between the web and anything still loose. Walking in rank
  // order instead (connecting #2, then #3, ...) is not the same thing — it
  // starts with long hops between far-apart cards and ends up a cat's cradle.
  const inTree = [byRank[0]];
  const loose = byRank.slice(1);

  while (loose.length) {
    let bestI = 0;
    let bestP = inTree[0];
    let bestD = Infinity;

    for (let i = 0; i < loose.length; i++) {
      for (const p of inTree) {
        const d = Math.hypot(cx(loose[i]) - cx(p), cy(loose[i]) - cy(p));
        if (d < bestD) {
          bestD = d;
          bestI = i;
          bestP = p;
        }
      }
    }

    const c = loose.splice(bestI, 1)[0];
    add(c, bestP, c.rank <= 3 || bestP.rank === 1);
    inTree.push(c);
  }

  // One deliberate long strand: the runner-up is always tied straight to #1,
  // because that is the relationship the board exists to show.
  if (byRank[1]) add(byRank[1], byRank[0], true);

  return edges;
}
