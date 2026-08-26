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
