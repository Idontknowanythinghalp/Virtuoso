/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const OFFICIAL_PALETTE = {
  midnightBurgundy: '#200000',
  deepWineRed: '#330205',
  royalBurgundy: '#4B0507',
  crimsonWine: '#650C0C',
  darkBronze: '#785020',
  antiqueGold: '#B9873F',
  champagneGold: '#D9AD61',
  lightGold: '#F0D18B',
} as const;

export const ALLOWED_PALETTE_HEX = Object.values(OFFICIAL_PALETTE);

export type StoryboardSceneId = 1 | 2 | 3 | 4 | 5;

export interface BiomechanicalPose {
  characterZ: number;
  characterYaw: number;
  walkWeight: number;
  walkPhase: number;
  pelvisBobY: number;
  pelvisShiftX: number;
  pelvisYaw: number;
  pelvisRoll: number;
  chestYaw: number;
  torsoPitch: number;
  headPitch: number;
  headYaw: number;
  leftHipX: number;
  leftKneeX: number;
  leftAnkleX: number;
  leftToeX: number;
  rightHipX: number;
  rightKneeX: number;
  rightAnkleX: number;
  rightToeX: number;
  leftShoulderX: number;
  leftShoulderZ: number;
  leftElbowX: number;
  rightShoulderX: number;
  rightShoulderZ: number;
  rightElbowX: number;
  coatSpeedFactor: number;
}

export interface CinemaCameraKeyframe {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export interface StoryboardState {
  elapsedMs: number;
  progress: number; // 0..1
  scene: StoryboardSceneId;
  sceneProgress: number; // 0..1 within active scene
  horizonGlow: number; // 0..1
  journeyDepth: number; // 0..1
  figureXNorm: number; // backward-compatible progress metric (-0.22..0)
  profileBlend: number; // 1 = side/3-4 walk, 0 = centered heroic stance
  figureScale: number; // 0.24..1.0
  figureOpacity: number; // 0..1
  walkCyclePhase: number;
  walkAmplitude: number;
  postureConfidence: number;
  obstacleIntensity: number;
  ringFormation: number;
  sunElevation: number; // sunrise height & warmth 0..1
  convergenceFlash: number;
  revealActive: boolean;
  revealOpacity: number;
  isExiting: boolean;
  // 3D Luxury Film Cinematography
  sceneFadeIn: number; // 0..1 dark opening veil
  sceneVeil: number; // 0..1 smooth optical dim for Act 5 emblem reveal
  shaftIntensity: number; // volumetric light beams 0..1
  rimIntensity: number; // backlit champagne gold rim light 0..1
  camera: CinemaCameraKeyframe;
  pose: BiomechanicalPose;
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function catmullRom1D(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

interface CameraControlPoint {
  t: number;
  pos: [number, number, number];
  target: [number, number, number];
  fov: number;
}

/**
 * Continuous 5-Act Cinema Camera Spline:
 * Act 1 (0.00-0.19): Wide architectural low-angle down the vast shadowed burgundy corridor toward distant dawn portal
 * Act 2 (0.19-0.46): Smooth off-axis lateral tracking dolly walking alongside the traveler past colonnade light shafts
 * Act 3 (0.46-0.66): Sweeping 3/4 orbit moving behind/beside the protagonist as they halt at the Sanctuary threshold
 * Act 4 (0.66-0.82): Monumental slow dolly-out & rise revealing the Solstice Sunrise over distant mountains
 * Act 5 (0.82-1.00): Slow tilt upward into atmospheric dusk & dark dissolve into the official Virtuoso emblem
 */
const CAMERA_KEYFRAMES: CameraControlPoint[] = [
  { t: 0.0, pos: [0.55, 1.32, 14.4], target: [0.0, 1.48, 2.0], fov: 40 },
  { t: 0.16, pos: [1.15, 1.38, 10.9], target: [-0.05, 1.45, 5.2], fov: 38 },
  { t: 0.3, pos: [-2.05, 1.42, 6.2], target: [0.0, 1.38, 3.6], fov: 36 },
  { t: 0.45, pos: [-2.18, 1.46, 2.35], target: [0.0, 1.44, 0.7], fov: 35 },
  { t: 0.58, pos: [-1.42, 1.62, 3.25], target: [0.0, 1.48, -2.5], fov: 34 },
  { t: 0.68, pos: [0.0, 1.68, 4.15], target: [0.0, 1.56, -12.0], fov: 33 },
  { t: 0.81, pos: [0.0, 1.88, 5.55], target: [0.0, 1.72, -18.0], fov: 35 },
  { t: 0.92, pos: [0.0, 2.15, 5.2], target: [0.0, 3.55, -20.0], fov: 36 },
  { t: 1.0, pos: [0.0, 2.25, 5.0], target: [0.0, 4.15, -22.0], fov: 36 },
];

function evaluateCameraSpline(progress: number): CinemaCameraKeyframe {
  const p = clamp01(progress);
  let seg = CAMERA_KEYFRAMES.length - 2;
  for (let i = 0; i < CAMERA_KEYFRAMES.length - 1; i++) {
    if (p <= CAMERA_KEYFRAMES[i + 1].t) {
      seg = i;
      break;
    }
  }

  const k0 = CAMERA_KEYFRAMES[Math.max(0, seg - 1)];
  const k1 = CAMERA_KEYFRAMES[seg];
  const k2 = CAMERA_KEYFRAMES[seg + 1];
  const k3 = CAMERA_KEYFRAMES[Math.min(CAMERA_KEYFRAMES.length - 1, seg + 2)];

  const span = Math.max(1e-5, k2.t - k1.t);
  const localT = clamp01((p - k1.t) / span);

  return {
    position: [
      catmullRom1D(k0.pos[0], k1.pos[0], k2.pos[0], k3.pos[0], localT),
      catmullRom1D(k0.pos[1], k1.pos[1], k2.pos[1], k3.pos[1], localT),
      catmullRom1D(k0.pos[2], k1.pos[2], k2.pos[2], k3.pos[2], localT),
    ],
    target: [
      catmullRom1D(k0.target[0], k1.target[0], k2.target[0], k3.target[0], localT),
      catmullRom1D(k0.target[1], k1.target[1], k2.target[1], k3.target[1], localT),
      catmullRom1D(k0.target[2], k1.target[2], k2.target[2], k3.target[2], localT),
    ],
    fov: catmullRom1D(k0.fov, k1.fov, k2.fov, k3.fov, localT),
  };
}

/**
 * Clinical human walking gait keyframe table (normalized cycle u in [0, 1), 0 = Heel Strike):
 * Angles follow Three.js +X right-hand rule for downward limbs facing +Z:
 * - hipX < 0: thigh forward (flexion), hipX > 0: thigh back (extension)
 * - kneeX > 0: lower leg bends backward (anatomical knee flexion)
 * - ankleX < 0: dorsiflexion (toe up), ankleX > 0: plantarflexion (heel lift)
 * - toeX < 0: toe extension keeping forefoot pressed flat on ground during heel-off push-off
 */
interface GaitLegKeyframe {
  u: number;
  hipX: number;
  kneeX: number;
  ankleX: number;
  toeX: number;
  pelvisY: number;
}

const GAIT_LEG_KEYS: GaitLegKeyframe[] = [
  { u: 0.0, hipX: -0.36, kneeX: 0.06, ankleX: -0.14, toeX: -0.06, pelvisY: -0.016 }, // Heel strike
  { u: 0.12, hipX: -0.22, kneeX: 0.24, ankleX: 0.02, toeX: -0.02, pelvisY: -0.024 }, // Loading response cushion
  { u: 0.28, hipX: 0.02, kneeX: 0.05, ankleX: -0.05, toeX: 0.0, pelvisY: 0.014 }, // Mid-stance vault peak
  { u: 0.44, hipX: 0.24, kneeX: 0.1, ankleX: 0.22, toeX: -0.32, pelvisY: -0.008 }, // Terminal stance heel-off
  { u: 0.56, hipX: 0.26, kneeX: 0.48, ankleX: 0.34, toeX: -0.44, pelvisY: -0.022 }, // Pre-swing toe push-off
  { u: 0.68, hipX: 0.04, kneeX: 0.92, ankleX: 0.08, toeX: -0.12, pelvisY: 0.006 }, // Initial swing clearance
  { u: 0.82, hipX: -0.26, kneeX: 0.68, ankleX: -0.08, toeX: -0.04, pelvisY: 0.014 }, // Mid-swing reach
  { u: 0.93, hipX: -0.39, kneeX: 0.14, ankleX: -0.15, toeX: -0.06, pelvisY: -0.006 }, // Terminal swing prep
];

function sampleClosedGaitLeg(rawU: number): Omit<GaitLegKeyframe, 'u'> {
  const u = ((rawU % 1) + 1) % 1;
  const n = GAIT_LEG_KEYS.length;

  let i1 = n - 1;
  for (let i = 0; i < n; i++) {
    const nextU = i + 1 < n ? GAIT_LEG_KEYS[i + 1].u : 1.0;
    if (u >= GAIT_LEG_KEYS[i].u && u < nextU) {
      i1 = i;
      break;
    }
  }

  const i0 = (i1 - 1 + n) % n;
  const i2 = (i1 + 1) % n;
  const i3 = (i1 + 2) % n;

  const k0 = GAIT_LEG_KEYS[i0];
  const k1 = GAIT_LEG_KEYS[i1];
  const k2 = GAIT_LEG_KEYS[i2];
  const k3 = GAIT_LEG_KEYS[i3];

  const u1 = k1.u;
  const u2 = k2.u <= u1 ? k2.u + 1.0 : k2.u;
  const localT = clamp01((u - u1) / Math.max(1e-5, u2 - u1));

  return {
    hipX: catmullRom1D(k0.hipX, k1.hipX, k2.hipX, k3.hipX, localT),
    kneeX: Math.max(0.02, catmullRom1D(k0.kneeX, k1.kneeX, k2.kneeX, k3.kneeX, localT)),
    ankleX: catmullRom1D(k0.ankleX, k1.ankleX, k2.ankleX, k3.ankleX, localT),
    toeX: Math.min(0.08, catmullRom1D(k0.toeX, k1.toeX, k2.toeX, k3.toeX, localT)),
    pelvisY: catmullRom1D(k0.pelvisY, k1.pelvisY, k2.pelvisY, k3.pelvisY, localT),
  };
}

/**
 * Computes natural biomechanical walking & poised-standing articulation.
 * Walk phase is monotonically integrated from travel progress so feet never slip backwards as stride slows.
 */
function computeBiomechanicalPose(progress: number, elapsedMs: number): BiomechanicalPose {
  // Distance traveled from z = 9.2m down to z = 0.0m (Sanctuary threshold)
  const travelEase = smootherstep(0.02, 0.51, progress);
  const rawZ = 9.2 * (1 - travelEase);
  const characterZ = rawZ === 0 ? 0 : rawZ;

  // Smooth blend from composed purposeful stride into grounded athletic stance
  const walkWeight = 1 - smootherstep(0.41, 0.52, progress);

  // Calibrated anatomical stride cycle (~1.42m per full left+right gait cycle for 1.84m athlete)
  const distanceCovered = 9.2 - characterZ;
  const cycleProgress = distanceCovered / 1.42;
  const walkPhase = cycleProgress * Math.PI * 2;

  const leftSample = sampleClosedGaitLeg(cycleProgress + 0.44);
  const rightSample = sampleClosedGaitLeg(cycleProgress + 0.94);

  const breathe = Math.sin(elapsedMs * 0.0017) * (1 - walkWeight * 0.6);

  // Blend cleanly from gait curves into grounded standing stance (slight relaxed knee ease)
  const leftHipX = lerp(0.015, leftSample.hipX, walkWeight);
  const leftKneeX = lerp(0.03, leftSample.kneeX, walkWeight);
  const leftAnkleX = lerp(-0.02, leftSample.ankleX, walkWeight);
  const leftToeX = lerp(0.0, leftSample.toeX, walkWeight);

  const rightHipX = lerp(-0.015, rightSample.hipX, walkWeight);
  const rightKneeX = lerp(0.03, rightSample.kneeX, walkWeight);
  const rightAnkleX = lerp(0.0, rightSample.ankleX, walkWeight);
  const rightToeX = lerp(0.0, rightSample.toeX, walkWeight);

  // Opposite arm swing coupled directly to leg swing with natural relaxed elbow bend (negative elbowX flexes forward)
  const armPhaseSin = Math.sin(walkPhase + 0.25) * walkWeight;
  const leftShoulderX = lerp(0.04, armPhaseSin * 0.24, walkWeight);
  const rightShoulderX = lerp(0.04, -armPhaseSin * 0.24, walkWeight);
  // Subtle natural abduction outward away from broad lats (~5 deg)
  const leftShoulderZ = -0.085 - Math.max(0, -leftShoulderX) * 0.04;
  const rightShoulderZ = 0.085 + Math.max(0, -rightShoulderX) * 0.04;

  const leftElbowX = lerp(-0.18, -0.22 - Math.max(0, -armPhaseSin) * 0.16, walkWeight);
  const rightElbowX = lerp(-0.18, -0.22 - Math.max(0, armPhaseSin) * 0.16, walkWeight);

  // Pelvis weight transfer, list, and counter-rotating ribcage
  const strideSin = Math.sin(walkPhase + 0.25) * walkWeight;
  const strideCos = Math.cos(walkPhase + 0.25) * walkWeight;
  const pelvisBobY = (leftSample.pelvisY + rightSample.pelvisY) * 0.5 * walkWeight + breathe * 0.003;
  const pelvisShiftX = strideCos * 0.022 || 0;
  const pelvisYaw = -strideSin * 0.068 || 0;
  const pelvisRoll = strideCos * 0.032 || 0;
  const chestYaw = strideSin * 0.085 || 0;

  // Confident upright posture settling toward the rising Solstice sun
  const confidence = smootherstep(0.16, 0.64, progress);
  const torsoPitch = lerp(0.055, -0.015, confidence) + Math.abs(strideSin) * 0.012;
  const headPitch = lerp(0.02, -0.055, confidence) + breathe * 0.012;
  const headYaw = -chestYaw * 0.45;

  // Stands facing -Z down corridor toward sunrise (Math.PI from +Z bind pose)
  const characterYaw = Math.PI;

  return {
    characterZ,
    characterYaw,
    walkWeight,
    walkPhase,
    pelvisBobY,
    pelvisShiftX,
    pelvisYaw,
    pelvisRoll,
    chestYaw,
    torsoPitch,
    headPitch,
    headYaw,
    leftHipX,
    leftKneeX,
    leftAnkleX,
    leftToeX,
    rightHipX,
    rightKneeX,
    rightAnkleX,
    rightToeX,
    leftShoulderX,
    leftShoulderZ,
    leftElbowX,
    rightShoulderX,
    rightShoulderZ,
    rightElbowX,
    coatSpeedFactor: walkWeight,
  };
}

/**
 * Pure deterministic storyboard state for the 5-stage cinematic opening sequence:
 * - Stage 1 (0.00 - 0.19): The Beginning — midnight palace darkness, lone traveler walking toward distant light
 * - Stage 2 (0.19 - 0.45): The Journey — smooth tracking shot alongside colonnade, passing volumetric light shafts
 * - Stage 3 (0.45 - 0.65): The Transformation — graceful camera arc as traveler halts in champagne rim-light
 * - Stage 4 (0.65 - 0.82): The Virtuoso / Mastery — wide heroic composition against Solstice sunrise horizon
 * - Stage 5 (0.82 - 1.00): The Event Reveal — restrained dissolve into official Virtuoso emblem & event lockup
 */
export function getStoryboardState(elapsedMs: number, durationMs: number): StoryboardState {
  const safeDuration = Math.max(1000, durationMs);
  const progress = clamp01(elapsedMs / safeDuration);

  let scene: StoryboardSceneId = 1;
  let sceneProgress = 0;

  if (progress < 0.19) {
    scene = 1;
    sceneProgress = clamp01(progress / 0.19);
  } else if (progress < 0.45) {
    scene = 2;
    sceneProgress = clamp01((progress - 0.19) / 0.26);
  } else if (progress < 0.65) {
    scene = 3;
    sceneProgress = clamp01((progress - 0.45) / 0.2);
  } else if (progress < 0.82) {
    scene = 4;
    sceneProgress = clamp01((progress - 0.65) / 0.17);
  } else {
    scene = 5;
    sceneProgress = clamp01((progress - 0.82) / 0.18);
  }

  const pose = computeBiomechanicalPose(progress, elapsedMs);
  const camera = evaluateCameraSpline(progress);

  const horizonGlow = smootherstep(0.0, 0.72, progress);
  const journeyDepth = smootherstep(0.0, 0.52, progress);

  const rawXNorm = -0.22 * (1 - smootherstep(0.0, 0.45, progress));
  const figureXNorm = rawXNorm === 0 ? 0 : rawXNorm;

  const profileBlend = 1 - smootherstep(0.38, 0.49, progress);
  const figureScale = 0.24 + 0.76 * smootherstep(0.0, 0.54, progress);

  const sceneFadeIn = smootherstep(0.0, 0.085, progress);
  const sceneVeil = smootherstep(0.745, 0.84, progress) * 0.9;
  const figureOpacity = clamp01(sceneFadeIn * (1 - smootherstep(0.745, 0.825, progress)));

  const postureConfidence = smootherstep(0.14, 0.62, progress);
  const obstacleIntensity = clamp01(
    smootherstep(0.16, 0.24, progress) * (1 - smootherstep(0.42, 0.49, progress))
  );
  const ringFormation = smootherstep(0.45, 0.64, progress);

  const sunRise = smootherstep(0.52, 0.77, progress);
  const sunSettle = 1 - 0.32 * smootherstep(0.79, 0.92, progress);
  const sunElevation = clamp01(sunRise * sunSettle);

  const shaftIntensity = clamp01(0.24 + 0.76 * smootherstep(0.12, 0.68, progress));
  const rimIntensity = clamp01(0.28 + 0.72 * smootherstep(0.22, 0.64, progress));

  const flashRaw =
    clamp01((progress - 0.76) / 0.04) * (1 - clamp01((progress - 0.8) / 0.05));
  const convergenceFlash = Math.sin(flashRaw * Math.PI * 0.5);

  const revealActive = progress >= 0.785;
  const revealOpacity = revealActive
    ? smootherstep(0.785, 0.85, progress)
    : 0;

  const isExiting = elapsedMs >= safeDuration - 540;

  return {
    elapsedMs,
    progress,
    scene,
    sceneProgress,
    horizonGlow,
    journeyDepth,
    figureXNorm,
    profileBlend,
    figureScale,
    figureOpacity,
    walkCyclePhase: pose.walkPhase,
    walkAmplitude: pose.walkWeight,
    postureConfidence,
    obstacleIntensity,
    ringFormation,
    sunElevation,
    convergenceFlash,
    revealActive,
    revealOpacity,
    isExiting,
    sceneFadeIn,
    sceneVeil,
    shaftIntensity,
    rimIntensity,
    camera,
    pose,
  };
}

export interface CelestialParticle {
  xNorm: number;
  yNorm: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  color: string;
  phase: number;
}

export function createCelestialParticles(count: number): CelestialParticle[] {
  const colors = [
    OFFICIAL_PALETTE.antiqueGold,
    OFFICIAL_PALETTE.champagneGold,
    OFFICIAL_PALETTE.lightGold,
  ];
  const particles: CelestialParticle[] = [];

  for (let i = 0; i < count; i++) {
    const seedA = Math.sin(i * 12.9898) * 43758.5453;
    const seedB = Math.sin(i * 78.233 + 1.7) * 43758.5453;
    const randA = seedA - Math.floor(seedA);
    const randB = seedB - Math.floor(seedB);

    particles.push({
      xNorm: randA - 0.5,
      yNorm: randB - 0.5,
      vx: ((i % 7) - 3) * 0.000018,
      vy: -0.000038 - (i % 5) * 0.000015,
      radius: 0.9 + (i % 4) * 0.7,
      alpha: 0.28 + (i % 5) * 0.14,
      color: colors[i % colors.length],
      phase: i * 0.6180339 * Math.PI * 2,
    });
  }

  return particles;
}
