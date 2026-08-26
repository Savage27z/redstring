'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useBoardTween } from './boardTween';
import type { BoardCell } from '@/lib/scatter';

/**
 * The red string — the thing the site is named after.
 *
 * Real swept geometry, not a line: each strand is a tube along a catenary, so
 * it catches the lamp along its upper surface and throws a shadow onto the
 * wall behind it. Topology follows the reference board: the contenders are all
 * spoked back to the prime suspect, then the rest of the wall is chained and
 * cross-tied so the string actually spans the board instead of bunching in one
 * corner.
 *
 * Geometry is rebuilt from the shared tween store — the same numbers the cards
 * read on the same frame — which is what keeps every strand welded to its pin
 * mid-reflow instead of visibly detaching.
 */
