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
