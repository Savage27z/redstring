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

export default function StringWeb({ cells, boardW, boardH, hoveredId }: Props) {
  const tween = useBoardTween();
  const groupRef = useRef<THREE.Group>(null);
  const meshes = useRef<THREE.Mesh[]>([]);
  const dirty = useRef(true);

  // Topology only changes when the ranking changes.
  const rankKey = cells
    .map((c) => `${c.id}:${c.rank}`)
    .sort()
    .join('|');
  const edges = useMemo(() => buildEdges(cells), [rankKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Matte dark maroon, lit only by the scene. Emissive twine glows like a
  // laser and instantly reads as a UI overlay rather than a physical thread —
  // the hover state gets a small lift, nothing more.
  const materials = useMemo(() => {
    const make = (lit: boolean) =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(lit ? '#c2231f' : '#8e2a22'),
        roughness: 0.85,
        metalness: 0,
        emissive: new THREE.Color('#c2231f'),
        emissiveIntensity: lit ? 0.28 : 0,
      });
    return { normal: make(false), lit: make(true) };
  }, []);

  // Rebuild whenever topology, board size, or hover changes.
  useEffect(() => {
    dirty.current = true;
  }, [edges, boardW, boardH, hoveredId]);

  useEffect(() => {
    const captured = meshes.current;
    return () => {
      for (const m of captured) m.geometry.dispose();
      materials.normal.dispose();
      materials.lit.dispose();
    };
  }, [materials]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    // Only rebuild while the board is actually in motion (or a discrete change
    // flagged us). A static board costs nothing.
    if (!tween.animating && !dirty.current) return;
    dirty.current = false;

    // grow/shrink the mesh pool to match the edge count
    while (meshes.current.length < edges.length) {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), materials.normal);
      m.castShadow = true;
      m.frustumCulled = false;
      meshes.current.push(m);
      group.add(m);
    }
    while (meshes.current.length > edges.length) {
      const m = meshes.current.pop()!;
      group.remove(m);
      m.geometry.dispose();
    }

    const a = new THREE.Vector3();
    const b = new THREE.Vector3();

    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      const ca = tween.get(e.a);
      const cb = tween.get(e.b);
      const mesh = meshes.current[i];
      if (!ca || !cb) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;

      // pin anchor: top-centre of each sheet
      a.set(
        (ca.x + ca.w / 2 - 0.5) * boardW,
        (0.5 - (ca.y + Math.min(ca.h * 0.14, 0.03))) * boardH,
        0.07,
      );
      b.set(
        (cb.x + cb.w / 2 - 0.5) * boardW,
        (0.5 - (cb.y + Math.min(cb.h * 0.14, 0.03))) * boardH,
        0.07,
      );

      // Catenary, but only just: string pinned taut between two pins barely
      // droops. The reference's runs are near-straight, and the deep sag of the
      // first pass read as decorative swags rather than tension.
      const span = a.distanceTo(b);
      const horiz = Math.abs(b.x - a.x) / (span || 1);
      const sag = span * (e.taut ? 0.028 : 0.05) * (0.3 + 0.7 * horiz);

      const p1 = a.clone().lerp(b, 0.33);
      const p2 = a.clone().lerp(b, 0.67);
      p1.y -= sag;
      p2.y -= sag;
      p1.z += 0.025;
      p2.z += 0.025;

      const curve = new THREE.CatmullRomCurve3([a.clone(), p1, p2, b.clone()]);
      mesh.geometry.dispose();
      mesh.geometry = new THREE.TubeGeometry(
        curve,
        Math.max(12, Math.round(span * 14)),
        e.taut ? TAUT_R : SLACK_R,
        6,
        false,
      );

      const lit = hoveredId === e.a || hoveredId === e.b;
      mesh.material = lit ? materials.lit : materials.normal;
    }
  });

  return <group ref={groupRef} />;
}
