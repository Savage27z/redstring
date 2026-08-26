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
