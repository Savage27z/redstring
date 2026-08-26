'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useCardTexture } from './useCardTexture';
import { useBoardTween } from './boardTween';
import Pin3D from './Pin3D';
import type { Submission } from '@/lib/types';
import type { BoardCell } from '@/lib/scatter';

interface Props {
  submission: Submission;
  cell: BoardCell; // target geometry
  boardW: number;
  boardH: number;
  aspect: number;
  fontsReady: boolean;
  hovered: boolean;
  isNew: boolean;
  onHover: (id: string | null) => void;
  onOpen: (s: Submission) => void;
  seed: number;
}

function jitter(seed: number, salt: number): number {
  const x = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/**
 * One sheet of paper pinned to the wall.
 *
 * The plane is a unit quad that gets *scaled* into place each frame from the
 * shared tween store, so a reflow is pure transform work — the canvas texture
 * is never redrawn just because the board moved.
 */
export default function CaseCard3D({
  submission,
  cell,
  boardW,
  boardH,
  aspect,
  fontsReady,
  hovered,
  isNew,
  onHover,
  onOpen,
  seed,
}: Props) {
  const group = useRef<THREE.Group>(null);
  const sheet = useRef<THREE.Mesh>(null);
  const [pressed, setPressed] = useState(false);
  const tween = useBoardTween();

  // pin-drop: seconds since this card appeared, -1 once it has landed
  const dropRef = useRef(isNew ? 0 : -1);
  useEffect(() => {
    if (isNew) dropRef.current = 0;
  }, [isNew]);

  const texture = useCardTexture(
    submission,
    cell.rank,
    cell.w,
    cell.h,
    aspect,
    fontsReady,
  );

  // Hand-placed, not gridded. Deterministic per card so it never re-rolls.
  const tilt = jitter(seed, 1) * (cell.rank === 1 ? 0.02 : 0.07);
  // Chrome pins throughout, like the reference. Red is reserved for the prime
  // suspect alone — if a third of the board is red it stops meaning anything.
  const pinColor = cell.rank === 1 ? '#c9202a' : '#d3d5da';

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;

    const live = tween.get(submission.id) ?? cell;
    const gap = Math.min(boardW, boardH) * (live.rank > 8 ? 0.004 : 0.007);

    const w = Math.max(0.004, live.w * boardW - gap * 2);
    const h = Math.max(0.004, live.h * boardH - gap * 2);
    const x = (live.x + live.w / 2 - 0.5) * boardW;
    const y = (0.5 - (live.y + live.h / 2)) * boardH;

    // Higher bids sit physically proud of the wall and cast longer shadows.
    const baseZ = 0.014 + Math.max(0, 0.05 - live.rank * 0.0035);

    let dropY = 0;
    let dropRot = 0;
    let dropScale = 1;
    if (dropRef.current >= 0) {
      dropRef.current += delta;
      const t = Math.min(1, dropRef.current / 0.85);
      // overshoot-and-settle, as if the pin were pushed in and the sheet swung
      const e = 1 - Math.pow(1 - t, 4);
      const swing = Math.sin(t * Math.PI * 3) * (1 - t) * 0.14;
      dropY = (1 - e) * boardH * 0.5;
      dropRot = swing;
      dropScale = 0.82 + 0.18 * e;
      if (t >= 1) dropRef.current = -1;
    }

    const k = Math.min(1, delta * 14);
    g.position.x = x;
    g.position.y = y + dropY;

    const targetZ = baseZ + (hovered ? 0.07 : 0) - (pressed ? 0.018 : 0);
    g.position.z += (targetZ - g.position.z) * k;

    const s = (hovered ? 1.03 : 1) * dropScale;
    g.scale.x = w * s;
    g.scale.y = h * s;

    const targetTiltX = hovered ? -0.085 : 0;
    g.rotation.x += (targetTiltX - g.rotation.x) * k;
    g.rotation.z += (tilt + dropRot - g.rotation.z) * k;
  });

  if (!texture) return null;

  return (
    <group ref={group} position={[0, 0, 0.02]}>
      <mesh
        ref={sheet}
        castShadow
        receiveShadow
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(submission.id);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHover(null);
          setPressed(false);
          document.body.style.cursor = 'auto';
        }}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onClick={(e) => {
          e.stopPropagation();
          onOpen(submission);
        }}
      >
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial
          map={texture}
          roughness={0.95}
          metalness={0}
          emissive={new THREE.Color('#ffd9a0')}
          emissiveIntensity={hovered ? 0.18 : 0}
          emissiveMap={texture}
        />
      </mesh>

      {/* Pin lives in the card's local space (top-centre of the unit quad) so it
          rides every scale and tilt without needing a tween of its own. */}
      <PinHolder rank={cell.rank} color={pinColor} groupRef={group} />
    </group>
  );
}
