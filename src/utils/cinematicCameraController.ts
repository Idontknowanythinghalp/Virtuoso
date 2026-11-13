/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import gsap from 'gsap';
import { StoryboardSceneId } from './cinematicStoryboard';

export interface CameraMotionSample {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  dofFocus: number;
  dofAperture: number;
  dofMaxBlur: number;
  act: StoryboardSceneId;
}

export interface CinematicCameraController {
  seek: (elapsedMs: number, characterZ: number, act: StoryboardSceneId) => CameraMotionSample;
  dispose: () => void;
}

interface InternalCameraRig {
  posX: number;
  posY: number;
  posZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  fov: number;
  characterFocusWeight: number;
  horizonFocusDist: number;
  dofAperture: number;
  dofMaxBlur: number;
  handheldWeight: number;
}

export const CAMERA_INERTIA_EASE_NAME = 'virtuosoScrollCamera';
export const POWER3_INOUT_CSS_BEZIER = 'cubic-bezier(0.645, 0.045, 0.355, 1)';

function clamp(v: number, min: number, max: number): number {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

/**
 * Custom GSAP ScrollToPlugin-inspired 'power3.inOut' camera inertia ease.
 * Simulates physical cinema dolly mass: zero-jerk cubic acceleration at onset,
 * sustained mid-track momentum, and cushioned deceleration at settlement.
 */
export function scrollToPower3InOutEase(progress: number): number {
  const p = clamp(progress, 0, 1);
  const power3 = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  const quinticInertia = p * p * p * (p * (p * 6 - 15) + 10);
  return power3 * 0.8 + quinticInertia * 0.2;
}

let customEaseRegistered = false;
function ensureCameraInertiaEaseRegistered(): void {
  if (customEaseRegistered) return;
  gsap.registerEase(CAMERA_INERTIA_EASE_NAME, scrollToPower3InOutEase);
  customEaseRegistered = true;
}

/**
 * GSAP-powered film camera & optical Depth-of-Field controller.
 * Driven deterministically via paused timeline seeking with custom ScrollToPlugin-inspired
 * 'power3.inOut' inertia so live playback, software-WebGL pacing, and ?introPreviewMs previews stay lock-stepped.
 */
export function createCinematicCameraController(durationMs: number): CinematicCameraController {
  ensureCameraInertiaEaseRegistered();
  const safeDurationSec = Math.max(1, durationMs / 1000);

  const rig: InternalCameraRig = {
    posX: 0.62,
    posY: 1.32,
    posZ: 14.8,
    targetX: 0.0,
    targetY: 1.48,
    targetZ: 2.5,
    fov: 41.0,
    characterFocusWeight: 0.35,
    horizonFocusDist: 14.5,
    dofAperture: 0.00018,
    dofMaxBlur: 0.0045,
    handheldWeight: 0.35,
  };

  const tl = gsap.timeline({
    paused: true,
    defaults: { ease: CAMERA_INERTIA_EASE_NAME },
  });

  // Time markers scaled proportionally to total duration
  const tAct1End = safeDurationSec * 0.2;
  const tAct2Mid = safeDurationSec * 0.33;
  const tAct2End = safeDurationSec * 0.46;
  const tAct3Mid = safeDurationSec * 0.57;
  const tAct3End = safeDurationSec * 0.66;
  const tAct4End = safeDurationSec * 0.82;
  const tAct5End = safeDurationSec;

  // Act 1 (0% -> 20%): Deliberate architectural dolly-in down the dark palace colonnade
  tl.to(
    rig,
    {
      posX: 1.05,
      posY: 1.36,
      posZ: 10.6,
      targetX: -0.04,
      targetY: 1.44,
      targetZ: 5.4,
      fov: 38.0,
      characterFocusWeight: 0.72,
      horizonFocusDist: 9.0,
      dofAperture: 0.00024,
      dofMaxBlur: 0.0055,
      handheldWeight: 0.65,
      duration: tAct1End,
      ease: CAMERA_INERTIA_EASE_NAME,
    },
    0
  );

  // Act 2A (20% -> 33%): Smooth lateral Steadicam arc across marble floor alongside the traveler
  tl.to(
    rig,
    {
      posX: -1.98,
      posY: 1.42,
      posZ: 6.1,
      targetX: 0.0,
      targetY: 1.4,
      targetZ: 3.55,
      fov: 36.2,
      characterFocusWeight: 1.0,
      dofAperture: 0.00033,
      dofMaxBlur: 0.0072,
      handheldWeight: 0.85,
      duration: tAct2Mid - tAct1End,
      ease: CAMERA_INERTIA_EASE_NAME,
    },
    tAct1End
  );

  // Act 2B (33% -> 46%): Continuous lateral tracking dolly locking optical focus onto character stride
  tl.to(
    rig,
    {
      posX: -2.22,
      posY: 1.46,
      posZ: 2.35,
      targetX: 0.0,
      targetY: 1.44,
      targetZ: 0.7,
      fov: 34.8,
      characterFocusWeight: 1.0,
      dofAperture: 0.00036,
      dofMaxBlur: 0.0078,
      handheldWeight: 0.7,
      duration: tAct2End - tAct2Mid,
      ease: CAMERA_INERTIA_EASE_NAME,
    },
    tAct2Mid
  );

  // Act 3A (46% -> 57%): Sweeping 3/4 orbit behind protagonist as they halt at the Sanctuary threshold
  tl.to(
    rig,
    {
      posX: -1.28,
      posY: 1.62,
      posZ: 3.32,
      targetX: 0.0,
      targetY: 1.49,
      targetZ: -2.6,
      fov: 33.4,
      characterFocusWeight: 1.0,
      dofAperture: 0.00044,
      dofMaxBlur: 0.009,
      handheldWeight: 0.3,
      duration: tAct3Mid - tAct2End,
      ease: CAMERA_INERTIA_EASE_NAME,
    },
    tAct2End
  );

  // Act 3B (57% -> 66%): Centered telephoto hero lock + shallow portrait DOF as transformation crests
  tl.to(
    rig,
    {
      posX: 0.0,
      posY: 1.68,
      posZ: 3.98,
      targetX: 0.0,
      targetY: 1.56,
      targetZ: -11.5,
      fov: 32.4,
      characterFocusWeight: 0.92,
      horizonFocusDist: 16.0,
      dofAperture: 0.00042,
      dofMaxBlur: 0.0085,
      handheldWeight: 0.12,
      duration: tAct3End - tAct3Mid,
      ease: CAMERA_INERTIA_EASE_NAME,
    },
    tAct3Mid
  );

  // Act 4 (66% -> 82%): Monumental slow dolly-out + rack focus from protagonist out to rising Solstice horizon
  tl.to(
    rig,
    {
      posX: 0.0,
      posY: 1.88,
      posZ: 5.65,
      targetX: 0.0,
      targetY: 1.72,
      targetZ: -18.5,
      fov: 35.0,
      characterFocusWeight: 0.0,
      horizonFocusDist: 26.0,
      dofAperture: 0.00014,
      dofMaxBlur: 0.0032,
      handheldWeight: 0.0,
      duration: tAct4End - tAct3End,
      ease: CAMERA_INERTIA_EASE_NAME,
    },
    tAct3End
  );

  // Act 5 (82% -> 100%): Serene upward crane tilt + shallow atmospheric bokeh soften into official emblem reveal
  tl.to(
    rig,
    {
      posX: 0.0,
      posY: 2.24,
      posZ: 5.02,
      targetX: 0.0,
      targetY: 4.15,
      targetZ: -22.0,
      fov: 36.2,
      characterFocusWeight: 0.0,
      horizonFocusDist: 2.2,
      dofAperture: 0.0005,
      dofMaxBlur: 0.0105,
      handheldWeight: 0.0,
      duration: tAct5End - tAct4End,
      ease: CAMERA_INERTIA_EASE_NAME,
    },
    tAct4End
  );

  return {
    seek: (elapsedMs: number, characterZ: number, act: StoryboardSceneId): CameraMotionSample => {
      const clampedSec = clamp(elapsedMs / 1000, 0, safeDurationSec);
      tl.time(clampedSec, false);

      // Subtle sub-millimeter organic Steadicam breathing scaled cleanly to zero during poise/finale
      const breatheX = Math.sin(clampedSec * 1.15) * 0.022 * rig.handheldWeight;
      const breatheY = Math.cos(clampedSec * 1.55) * 0.014 * rig.handheldWeight;

      const camX = rig.posX + breatheX;
      const camY = rig.posY + breatheY;
      const camZ = rig.posZ;

      // Real-time 3D distance from lens to protagonist collar/torso for locked optical tracking focus
      const dx = camX;
      const dy = camY - 1.38;
      const dz = camZ - characterZ;
      const characterDist = Math.max(1.2, Math.sqrt(dx * dx + dy * dy + dz * dz));

      const dofFocus =
        characterDist * rig.characterFocusWeight +
        rig.horizonFocusDist * (1 - rig.characterFocusWeight);

      return {
        position: [camX, camY, camZ],
        target: [rig.targetX, rig.targetY, rig.targetZ],
        fov: rig.fov,
        dofFocus,
        dofAperture: rig.dofAperture,
        dofMaxBlur: rig.dofMaxBlur,
        act,
      };
    },
    dispose: () => {
      tl.kill();
    },
  };
}
