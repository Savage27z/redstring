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
