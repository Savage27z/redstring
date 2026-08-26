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

interface SceneProps {
  submissions: Submission[];
  hovered: string | null;
  onHover: (id: string | null) => void;
  onOpen: (s: Submission) => void;
}

function Scene({ submissions, hovered, onHover, onOpen }: SceneProps) {
  const { panelAspect, panelW, panelH, outerW } = useBoardDims();
  const fontsReady = useFontsReady();
  const store = useMemo(() => new BoardTweenStore(), []);
  const prevIds = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  const cells = useMemo(
    () =>
      layoutScatter(
        submissions.map((s) => ({ id: s.id, bidAmount: s.currentBid })),
        panelAspect,
      ),
    [submissions, panelAspect],
  );

  const dataKey = cells.map((c) => `${c.id}:${c.share.toFixed(6)}`).join('|');
  const lastDataKey = useRef<string | null>(null);

  useEffect(() => {
    const isFirst = lastDataKey.current === null;
    const bidsChanged = !isFirst && lastDataKey.current !== dataKey;
    lastDataKey.current = dataKey;

    const fresh = new Set<string>();
    for (const c of cells) if (!prevIds.current.has(c.id)) fresh.add(c.id);
    prevIds.current = new Set(cells.map((c) => c.id));
    if (!isFirst && fresh.size) setNewIds(fresh);

    store.setTargets(cells, isFirst || !bidsChanged || prefersReducedMotion());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, cells, store]);

  const byId = useMemo(() => {
    const m = new Map<string, Submission>();
    for (const s of submissions) m.set(s.id, s);
    return m;
  }, [submissions]);

  return (
    <BoardTweenContext.Provider value={store}>
      <TweenDriver store={store} />
      <CameraFit parallax={!prefersReducedMotion()} />

      {/* key light from the upper left, matching the reference's soft top-left
          highlight; fill keeps the cork from going muddy in the corners */}
      <ambientLight intensity={0.85} />
      <hemisphereLight args={['#ffe9c9', '#3a2a1c', 0.7]} />
      <directionalLight
        position={[-2.2, 3.4, 4.2]}
        intensity={2.4}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={20}
        shadow-camera-left={-3.5}
        shadow-camera-right={3.5}
        shadow-camera-top={3.5}
        shadow-camera-bottom={-3.5}
        shadow-bias={-0.0009}
        shadow-normalBias={0.02}
      />
      <pointLight
        position={[1.4, 1.6, 2.2]}
        intensity={4}
        color="#ffe0b0"
        distance={11}
        decay={2}
      />

      {/* floor the easel stands on */}
      <mesh
        position={[0, FLOOR_Y, 0.4]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[26, 26]} />
        <meshStandardMaterial color="#20191a" roughness={0.95} metalness={0} />
      </mesh>

      {/* back wall of the room */}
      <mesh position={[0, FLOOR_Y + 6, -3.2]} receiveShadow>
        <planeGeometry args={[30, 16]} />
        <meshStandardMaterial color="#1b1618" roughness={1} metalness={0} />
      </mesh>

      <Easel
        boardW={outerW}
        boardH={OUTER_H}
        bottomY={BOARD_Y - OUTER_H / 2}
        floorY={FLOOR_Y}
      />

      {/* Everything pinned to the cork lives inside this group, so it leans with
          the board instead of floating in front of it. */}
      <group position={[0, BOARD_Y, 0]} rotation={[LEAN, 0, 0]}>
        <Wall width={panelW} height={panelH} frame={FRAME} />

        {cells.map((cell) => {
          const s = byId.get(cell.id);
          if (!s) return null;
          return (
            <CaseCard3D
              key={cell.id}
              submission={s}
              cell={cell}
              boardW={panelW}
              boardH={panelH}
              aspect={panelAspect}
              fontsReady={fontsReady}
              hovered={hovered === cell.id}
              isNew={newIds.has(cell.id)}
              onHover={onHover}
              onOpen={onOpen}
              seed={seedOf(cell.id)}
            />
          );
        })}

        <StringWeb
          cells={cells}
          boardW={panelW}
          boardH={panelH}
          hoveredId={hovered}
        />
      </group>

      {/* drei's wrapper, deliberately constrained: you can look around the
          board, not walk behind it. */}
      <OrbitControls
        enablePan={false}
        enableZoom={false}
        target={[0, BOARD_Y - 0.15, 0]}
        minPolarAngle={Math.PI / 2 - 0.3}
        maxPolarAngle={Math.PI / 2 + 0.16}
        minAzimuthAngle={-0.34}
        maxAzimuthAngle={0.34}
        enableDamping
        dampingFactor={0.08}
      />
    </BoardTweenContext.Provider>
  );
}

export default function BoardScene(props: SceneProps) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: false }}
      camera={{ fov: CAMERA_FOV, position: [0, 0.5, 5.4], near: 0.1, far: 80 }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      <color attach="background" args={['#171314']} />
      <fog attach="fog" args={['#171314', 7, 16]} />
      <Scene {...props} />
    </Canvas>
  );
}
