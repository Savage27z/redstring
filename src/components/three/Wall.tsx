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
