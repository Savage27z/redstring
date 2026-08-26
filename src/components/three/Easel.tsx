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
