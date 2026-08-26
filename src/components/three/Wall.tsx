'use client';

import { useMemo } from 'react';
import * as THREE from 'three';

/**
 * The board itself: a cork panel inside a wooden frame.
 *
 * The frame is real geometry — four bevelled rails built from BoxGeometry that
 * sit proud of the cork, catch the key light on their top edges, and drop a
 * genuine shadow onto the panel. That silhouette is what makes the scene read
 * as an object in a room rather than a flat picture of one.
 */

function corkTexture(): THREE.CanvasTexture {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = '#c1874a';
  ctx.fillRect(0, 0, S, S);

  // broad tonal drift
  for (let i = 0; i < 30; i++) {
    const g = ctx.createRadialGradient(
      Math.random() * S,
      Math.random() * S,
      0,
      Math.random() * S,
      Math.random() * S,
      S * (0.14 + Math.random() * 0.3),
    );
    const light = Math.random() > 0.5;
    g.addColorStop(0, light ? 'rgba(222,175,118,0.34)' : 'rgba(140,88,40,0.32)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }

  // the granular fleck that actually says "cork"
  for (let i = 0; i < 26000; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const w = 2 + Math.random() * 7;
    const h = 1.5 + Math.random() * 5;
    const dark = Math.random() > 0.45;
    ctx.fillStyle = dark
      ? 'rgba(126,78,34,' + (0.1 + Math.random() * 0.3) + ')'
      : 'rgba(233,190,136,' + (0.1 + Math.random() * 0.28) + ')';
    ctx.beginPath();
    ctx.ellipse(x, y, w / 2, h / 2, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function woodTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = '#b07a3c';
  ctx.fillRect(0, 0, W, H);

  // long grain running with the rail
  for (let i = 0; i < 190; i++) {
    const y = Math.random() * H;
    const amp = 1 + Math.random() * 4;
    const dark = Math.random() > 0.5;
    ctx.strokeStyle = dark
      ? 'rgba(108,66,26,' + (0.1 + Math.random() * 0.34) + ')'
      : 'rgba(220,175,116,' + (0.08 + Math.random() * 0.26) + ')';
    ctx.lineWidth = 0.6 + Math.random() * 2.2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= W; x += 24) {
      ctx.lineTo(x, y + Math.sin(x * 0.018 + i) * amp);
    }
    ctx.stroke();
  }

  // a couple of knots
  for (let i = 0; i < 3; i++) {
    const kx = Math.random() * W;
    const ky = Math.random() * H;
    for (let r = 16; r > 0; r -= 2.4) {
      ctx.strokeStyle = 'rgba(96,58,22,' + (0.05 + r / 150) + ')';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(kx, ky, r, r * 0.42, 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

interface Props {
  /** inner cork panel size, in world units */
  width: number;
  height: number;
  /** rail thickness */
  frame: number;
}

export default function Wall({ width, height, frame }: Props) {
  const cork = useMemo(
    () => (typeof document === 'undefined' ? null : corkTexture()),
    [],
  );
  const wood = useMemo(
    () => (typeof document === 'undefined' ? null : woodTexture()),
    [],
  );

  const woodMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: '#b98246',
      roughness: 0.62,
      metalness: 0.04,
    });
    if (wood) m.map = wood;
    return m;
  }, [wood]);

  const depth = frame * 0.62;
  const outerW = width + frame * 2;
  const outerH = height + frame * 2;

  return (
    <group>
      {/* cork panel, recessed inside the rails */}
      <mesh position={[0, 0, -0.012]} receiveShadow>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          map={cork ?? undefined}
          color="#c98f52"
          roughness={0.96}
          metalness={0}
        />
      </mesh>

      {/* backing board just behind the cork so the recess has a visible wall */}
      <mesh position={[0, 0, -0.05]}>
        <boxGeometry args={[outerW, outerH, 0.06]} />
        <meshStandardMaterial color="#6b4522" roughness={0.9} />
      </mesh>

      {/* four rails */}
      <mesh
        position={[0, height / 2 + frame / 2, depth / 2 - 0.01]}
        material={woodMat}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[outerW, frame, depth]} />
      </mesh>
      <mesh
        position={[0, -height / 2 - frame / 2, depth / 2 - 0.01]}
        material={woodMat}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[outerW, frame, depth]} />
      </mesh>
      <mesh
        position={[-width / 2 - frame / 2, 0, depth / 2 - 0.01]}
        material={woodMat}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[frame, height, depth]} />
      </mesh>
      <mesh
        position={[width / 2 + frame / 2, 0, depth / 2 - 0.01]}
        material={woodMat}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[frame, height, depth]} />
      </mesh>

      {/* inner lip: a thin dark bevel where the rails meet the cork */}
      <lineSegments position={[0, 0, 0.002]} raycast={() => null}>
        <edgesGeometry args={[new THREE.PlaneGeometry(width, height)]} />
        <lineBasicMaterial color="#5e3a18" />
      </lineSegments>
    </group>
  );
}
