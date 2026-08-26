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
