'use client';

import { useMemo } from 'react';
import * as THREE from 'three';

/**
 * The easel the board stands on.
 *
 * Two splayed front legs and a rear kickstand, built as real struts so the
 * board is a freestanding object in a room — it casts a shadow on the floor and
 * the legs recede in perspective. This, more than anything on the cork, is what
 * makes the scene read as 3D rather than a picture of a board.
 */

/** A leg: a cylinder rotated to span two arbitrary points. */
function Strut({
  from,
  to,
  radius,
  material,
}: {
  from: [number, number, number];
  to: [number, number, number];
  radius: number;
  material: THREE.Material;
}) {
  const { position, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    // cylinders are built along +Y, so rotate that axis onto the strut
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize(),
    );
    return { position: mid, quaternion: q, length: len };
  }, [from, to]);

  return (
    <mesh
      position={position}
      quaternion={quaternion}
      material={material}
      castShadow
      receiveShadow
    >
      <cylinderGeometry args={[radius, radius * 1.1, length, 12]} />
    </mesh>
  );
}

interface Props {
  /** outer size of the framed board */
  boardW: number;
  boardH: number;
  /** y of the board's bottom rail */
  bottomY: number;
  /** y of the floor */
  floorY: number;
}

export default function Easel({ boardW, boardH, bottomY, floorY }: Props) {
  const wood = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#8f5f2e',
        roughness: 0.68,
        metalness: 0.03,
      }),
    [],
  );

  const r = Math.min(boardW, boardH) * 0.016;
  const legTop = bottomY + boardH * 0.06;
  const spanX = boardW * 0.34;
  const splay = boardW * 0.1;
  const drop = floorY + r; // rest the feet on the floor

  return (
    <group>
      {/* front legs, splaying outward and forward as they descend */}
      <Strut
        from={[-spanX, legTop, 0]}
        to={[-spanX - splay, drop, 0.22]}
        radius={r}
        material={wood}
      />
      <Strut
        from={[spanX, legTop, 0]}
        to={[spanX + splay, drop, 0.22]}
        radius={r}
        material={wood}
      />

      {/* rear kickstand */}
      <Strut from={[0, legTop, -0.02]} to={[0, drop, -0.62]} radius={r * 0.92} material={wood} />

      {/* cross brace between the front legs */}
      <Strut
        from={[-spanX - splay * 0.55, drop + (legTop - drop) * 0.36, 0.13]}
        to={[spanX + splay * 0.55, drop + (legTop - drop) * 0.36, 0.13]}
        radius={r * 0.7}
        material={wood}
      />

      {/* tray lip the board sits in */}
      <mesh position={[0, bottomY - r * 1.2, 0.07]} material={wood} castShadow receiveShadow>
        <boxGeometry args={[boardW * 0.82, r * 2.2, 0.16]} />
      </mesh>
    </group>
  );
}
