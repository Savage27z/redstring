'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { layoutScatter } from '@/lib/scatter';
import { BoardTweenContext, BoardTweenStore } from './boardTween';
import { useFontsReady } from './useCardTexture';
import CaseCard3D from './CaseCard3D';
import StringWeb from './StringWeb';
import Wall from './Wall';
import Easel from './Easel';
import type { Submission } from '@/lib/types';

const PANEL_H = 1.9;
const FRAME = 0.11;
const OUTER_H = PANEL_H + FRAME * 2;

/** The board hangs above the floor on its legs. */
const BOARD_Y = 0.42;
const FLOOR_Y = BOARD_Y - OUTER_H / 2 - 0.92;

/**
 * Board proportions, by viewport.
 *
 * Height is always the binding constraint on a desktop canvas, so a 3:2 panel
 * leaves a third of the screen empty either side of it and can't be grown by
 * moving the camera — pulling in would just crop the cork. Widening the panel
 * itself is what actually makes the board bigger: same height, more cork, and
 * every card scales up with the extra area.
 */
function useBoardDims() {
  const { size } = useThree();
  const compact = size.width < 640;
  const panelAspect = compact ? 1.5 : 1.8;
  const panelW = PANEL_H * panelAspect;
  return {
    compact,
    panelAspect,
    panelW,
    panelH: PANEL_H,
    outerW: panelW + FRAME * 2,
    outerH: OUTER_H,
  };
}

/** How far the easel leans back. */
const LEAN = 0.085;

const CAMERA_FOV = 34;

function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h % 100000);
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Single writer for the tween store; priority -10 so it runs before readers. */
function TweenDriver({ store }: { store: BoardTweenStore }) {
  useFrame((_, delta) => {
    store.advance(Math.min(delta, 0.05), prefersReducedMotion() ? 60 : 5.5);
  }, -10);
  return null;
}

/**
 * Frames the cork, with just enough easel below it to read as a standing
 * object, then adds a little pointer parallax so it sits in space.
 *
 * Fitting the *entire* easel — legs, feet and floor — spent a third of the
 * frame on furniture and left the board, which is the whole product, small.
 * The bottom of frame cuts through the legs instead.
 */
function CameraFit({ parallax }: { parallax: boolean }) {
  const { camera, size, pointer } = useThree();

  // On a phone even the legs are too expensive: frame the cork alone and let
  // the easel run out of shot. Keyed to width, not aspect — the mobile canvas
  // is a short wide strip, so an aspect test reads it as landscape and picks
  // the wrong framing.
  const { compact, outerW } = useBoardDims();

  const { baseZ, target } = useMemo(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const vAspect = size.width / Math.max(1, size.height);
    const halfFov = (CAMERA_FOV / 2) * (Math.PI / 180);

    // how much easel to show beneath the bottom rail
    const legroom = compact ? 0.04 : 0.5;

    const top = BOARD_Y + OUTER_H / 2;
    const bottom = BOARD_Y - OUTER_H / 2 - legroom;

    const sceneH = (top - bottom) * 1.02;
    const sceneW = outerW * 1.03;

    const zForH = sceneH / 2 / Math.tan(halfFov);
    const zForW = sceneW / 2 / (Math.tan(halfFov) * vAspect);

    cam.fov = CAMERA_FOV;
    cam.updateProjectionMatrix();

    return {
      baseZ: Math.max(zForH, zForW),
      target: new THREE.Vector3(0, (top + bottom) / 2, 0),
    };
  }, [camera, size.width, size.height, compact, outerW]);

  useFrame((_, delta) => {
    const k = Math.min(1, delta * 3.2);
    const px = parallax ? pointer.x * 0.28 : 0;
    const py = parallax ? pointer.y * 0.18 : 0;
    camera.position.x += (px - camera.position.x) * k;
    camera.position.y += (target.y + 0.14 + py - camera.position.y) * k;
    camera.position.z += (baseZ - camera.position.z) * k;
    camera.lookAt(target);
  });

  return null;
}
