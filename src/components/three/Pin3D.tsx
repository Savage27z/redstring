'use client';

import * as THREE from 'three';
import { useMemo } from 'react';

/**
 * A chrome pushpin, matching the reference's silver heads.
 *
 * Sphere on a short shaft — deliberately not a capsule. High metalness with
 * low roughness is what produces the bright specular dot that makes the pin
 * read as metal under the key light.
 */
export default function Pin3D({
  position,
  color = '#d3d5da',
  scale = 1,
}: {
  position: [number, number, number];
  color?: string;
  scale?: number;
}) {
  const isMetal = color !== '#c9202a';

  const head = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        roughness: isMetal ? 0.16 : 0.3,
        metalness: isMetal ? 0.92 : 0.15,
      }),
    [color, isMetal],
  );

  const shaft = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#9a9aa2',
        roughness: 0.3,
        metalness: 0.85,
      }),
    [],
  );

  const r = 0.023 * scale;

  return (
    <group position={position}>
      <mesh castShadow position={[0, 0, r * 0.95]} material={head}>
        <sphereGeometry args={[r, 22, 18]} />
      </mesh>
      {/* collar where the head meets the paper */}
      <mesh position={[0, 0, r * 0.4]} rotation={[Math.PI / 2, 0, 0]} material={shaft}>
        <cylinderGeometry args={[r * 0.42, r * 0.3, r * 0.5, 12]} />
      </mesh>
      <mesh position={[0, 0, r * 0.1]} rotation={[Math.PI / 2, 0, 0]} material={shaft}>
        <cylinderGeometry args={[r * 0.16, r * 0.16, r * 1.2, 8]} />
      </mesh>
    </group>
  );
}
