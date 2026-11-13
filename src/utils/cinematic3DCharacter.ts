/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { BiomechanicalPose, OFFICIAL_PALETTE } from './cinematicStoryboard';
import { ClothTextureSet } from './cinematic3DTextures';

const _tmpVec = new THREE.Vector3();

// Bone index map (21 anatomical bones)
const BONE = {
  HIPS: 0,
  SPINE: 1,
  CHEST: 2,
  NECK: 3,
  HEAD: 4,
  L_SHOULDER: 5,
  L_UPPER_ARM: 6,
  L_FOREARM: 7,
  L_HAND: 8,
  R_SHOULDER: 9,
  R_UPPER_ARM: 10,
  R_FOREARM: 11,
  R_HAND: 12,
  L_THIGH: 13,
  L_SHIN: 14,
  L_FOOT: 15,
  L_TOE: 16,
  R_THIGH: 17,
  R_SHIN: 18,
  R_FOOT: 19,
  R_TOE: 20,
} as const;

export interface CharacterRig {
  root: THREE.Group;
  skeleton: THREE.Skeleton;
  bones: THREE.Bone[];
  skinMesh: THREE.SkinnedMesh;
  apparelMesh: THREE.SkinnedMesh;
  footwearMesh: THREE.SkinnedMesh;
  leftHeelContact: THREE.Object3D;
  leftToeContact: THREE.Object3D;
  rightHeelContact: THREE.Object3D;
  rightToeContact: THREE.Object3D;
  contactShadow: THREE.Mesh;
  dispose: () => void;
}

type BoneWeightPair = [number, number];

interface LoftRing {
  x: number;
  y: number;
  z: number;
  rx: number;
  rz: number;
  weights: BoneWeightPair[];
  /**
   * Optional cross-section modulation taking polar angle theta (0 = +Z front, PI/2 = +X, PI = -Z back)
   * and returning [scaleR, offsetX, offsetZ].
   */
  contour?: (theta: number) => [number, number, number];
}

interface SkinnedGeometryBuilder {
  positions: number[];
  uvs: number[];
  skinIndices: number[];
  skinWeights: number[];
  indices: number[];
}

function createBuilder(): SkinnedGeometryBuilder {
  return {
    positions: [],
    uvs: [],
    skinIndices: [],
    skinWeights: [],
    indices: [],
  };
}

function packWeights(weights: BoneWeightPair[]): [number, number, number, number, number, number, number, number] {
  const idx = [0, 0, 0, 0];
  const w = [0, 0, 0, 0];
  let sum = 0;
  for (let i = 0; i < Math.min(4, weights.length); i++) {
    idx[i] = weights[i][0];
    w[i] = Math.max(0, weights[i][1]);
    sum += w[i];
  }
  if (sum > 1e-6) {
    for (let i = 0; i < 4; i++) w[i] /= sum;
  } else {
    w[0] = 1;
  }
  return [idx[0], idx[1], idx[2], idx[3], w[0], w[1], w[2], w[3]];
}

function pushVertex(
  b: SkinnedGeometryBuilder,
  x: number,
  y: number,
  z: number,
  u: number,
  v: number,
  packed: [number, number, number, number, number, number, number, number]
): number {
  const vertIndex = b.positions.length / 3;
  b.positions.push(x, y, z);
  b.uvs.push(u, v);
  b.skinIndices.push(packed[0], packed[1], packed[2], packed[3]);
  b.skinWeights.push(packed[4], packed[5], packed[6], packed[7]);
  return vertIndex;
}

/**
 * Appends a watertight skinned anatomical tube/loft across arbitrary cross-section rings.
 * Assumes rings progress bottom-up along +Y (or set invertWinding = true for top-down limbs).
 */
function appendSkinnedLoft(
  b: SkinnedGeometryBuilder,
  rings: LoftRing[],
  radialSegments: number,
  capBottom: boolean,
  capTop: boolean,
  invertWinding = false
): void {
  const cols = radialSegments + 1;
  const startVert = b.positions.length / 3;

  for (let iy = 0; iy < rings.length; iy++) {
    const ring = rings[iy];
    const v = iy / Math.max(1, rings.length - 1);
    const packed = packWeights(ring.weights);

    for (let ix = 0; ix <= radialSegments; ix++) {
      const u = ix / radialSegments;
      const theta = u * Math.PI * 2;
      let scaleR = 1;
      let offX = 0;
      let offZ = 0;
      if (ring.contour) {
        [scaleR, offX, offZ] = ring.contour(theta);
      }
      const x = ring.x + Math.sin(theta) * ring.rx * scaleR + offX;
      const z = ring.z + Math.cos(theta) * ring.rz * scaleR + offZ;
      pushVertex(b, x, ring.y, z, u, v, packed);
    }
  }

  for (let iy = 0; iy < rings.length - 1; iy++) {
    for (let ix = 0; ix < radialSegments; ix++) {
      const a = startVert + iy * cols + ix;
      const c = startVert + iy * cols + (ix + 1);
      const bVert = startVert + (iy + 1) * cols + ix;
      const d = startVert + (iy + 1) * cols + (ix + 1);
      if (invertWinding) {
        b.indices.push(a, c, bVert);
        b.indices.push(c, d, bVert);
      } else {
        b.indices.push(a, bVert, c);
        b.indices.push(c, bVert, d);
      }
    }
  }

  if (capBottom) {
    const r0 = rings[0];
    const centerIdx = pushVertex(b, r0.x, r0.y, r0.z, 0.5, 0, packWeights(r0.weights));
    for (let ix = 0; ix < radialSegments; ix++) {
      const v1 = startVert + ix;
      const v2 = startVert + ix + 1;
      if (invertWinding) {
        b.indices.push(centerIdx, v2, v1);
      } else {
        b.indices.push(centerIdx, v1, v2);
      }
    }
  }

  if (capTop) {
    const lastRingIdx = rings.length - 1;
    const rTop = rings[lastRingIdx];
    const rowStart = startVert + lastRingIdx * cols;
    const centerIdx = pushVertex(b, rTop.x, rTop.y, rTop.z, 0.5, 1, packWeights(rTop.weights));
    for (let ix = 0; ix < radialSegments; ix++) {
      const v1 = rowStart + ix;
      const v2 = rowStart + ix + 1;
      if (invertWinding) {
        b.indices.push(centerIdx, v1, v2);
      } else {
        b.indices.push(centerIdx, v2, v1);
      }
    }
  }
}

function finalizeSkinnedGeometry(b: SkinnedGeometryBuilder): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uvs, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(b.skinIndices, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(b.skinWeights, 4));
  geo.setIndex(b.indices);
  geo.computeVertexNormals();
  return geo;
}

function createBodyAndLimbsGeometry(): THREE.BufferGeometry {
  const b = createBuilder();

  // 1. Continuous Torso -> Trapezius -> Neck -> Head -> Curly Hair Crown (bottom-up +Y)
  const torsoHeadRings: LoftRing[] = [
    // Pelvis / Glute foundation
    { x: 0, y: 0.88, z: -0.015, rx: 0.162, rz: 0.115, weights: [[BONE.HIPS, 1]] },
    {
      x: 0,
      y: 0.96,
      z: -0.012,
      rx: 0.168,
      rz: 0.118,
      weights: [[BONE.HIPS, 0.85], [BONE.SPINE, 0.15]],
      contour: (th) => {
        // Subtle glute/lower-back definition on -Z
        const backPeak = Math.max(0, -Math.cos(th)) * Math.pow(Math.sin(th), 2) * 0.12;
        return [1 + backPeak, 0, 0];
      },
    },
    // Narrow athletic waist (tapered V foundation matching reference)
    {
      x: 0,
      y: 1.08,
      z: 0.0,
      rx: 0.154,
      rz: 0.112,
      weights: [[BONE.HIPS, 0.3], [BONE.SPINE, 0.7]],
    },
    // Mid-torso ribcage / lats expansion
    {
      x: 0,
      y: 1.22,
      z: 0.005,
      rx: 0.194,
      rz: 0.126,
      weights: [[BONE.SPINE, 0.55], [BONE.CHEST, 0.45]],
      contour: (th) => {
        // V-taper latissimus wing widening at lateral-back
        const lat = Math.pow(Math.abs(Math.sin(th)), 1.6) * (Math.cos(th) < 0 ? 0.09 : 0.03);
        return [1 + lat, 0, 0];
      },
    },
    // Upper chest & broad athletic back
    {
      x: 0,
      y: 1.37,
      z: 0.0,
      rx: 0.228,
      rz: 0.132,
      weights: [[BONE.CHEST, 0.92], [BONE.SPINE, 0.08]],
      contour: (th) => {
        // Subtle pectoral & upper-back scapula contour
        const latSpread = Math.pow(Math.abs(Math.sin(th)), 2.2) * 0.06;
        const chestFull = Math.max(0, Math.cos(th)) * 0.05;
        return [1 + latSpread + chestFull, 0, 0];
      },
    },
    // Clavicle & trapezius shoulder slope
    {
      x: 0,
      y: 1.47,
      z: -0.006,
      rx: 0.168,
      rz: 0.098,
      weights: [[BONE.CHEST, 0.65], [BONE.NECK, 0.35]],
      contour: (th) => {
        // Trapezius ridge sloping cleanly toward neck
        const trap = Math.max(0, -Math.cos(th)) * 0.08;
        return [1 + trap, 0, 0];
      },
    },
    // Muscular neck base & mid-neck
    {
      x: 0,
      y: 1.52,
      z: 0.0,
      rx: 0.072,
      rz: 0.072,
      weights: [[BONE.CHEST, 0.2], [BONE.NECK, 0.8]],
    },
    {
      x: 0,
      y: 1.59,
      z: 0.008,
      rx: 0.064,
      rz: 0.066,
      weights: [[BONE.NECK, 0.6], [BONE.HEAD, 0.4]],
    },
    // Jawline & chin base
    {
      x: 0,
      y: 1.63,
      z: 0.022,
      rx: 0.072,
      rz: 0.082,
      weights: [[BONE.NECK, 0.15], [BONE.HEAD, 0.85]],
      contour: (th) => {
        // Chin taper forward (+Z) & clean mandible corner
        const front = Math.max(0, Math.cos(th));
        return [1 - front * 0.12, 0, front * 0.018];
      },
    },
    // Mid-face, ears, brow & nose profile
    {
      x: 0,
      y: 1.71,
      z: 0.014,
      rx: 0.086,
      rz: 0.104,
      weights: [[BONE.HEAD, 1]],
      contour: (th) => {
        // Subtle nose bridge at theta=0 and natural ear silhouette at +/-PI/2
        const nose = Math.pow(Math.max(0, Math.cos(th)), 12) * 0.14;
        const ear = Math.pow(Math.max(0, Math.abs(Math.sin(th)) - 0.9), 1.4) * 1.1;
        return [1 + nose + ear, 0, 0];
      },
    },
    // Upper cranium & textured athletic hair contour (matches reference silhouette)
    {
      x: 0,
      y: 1.78,
      z: 0.006,
      rx: 0.09,
      rz: 0.106,
      weights: [[BONE.HEAD, 1]],
      contour: (th) => {
        // Textured short curly crown edge visible against golden light
        const curl = 0.032 * Math.sin(th * 9) + 0.018 * Math.cos(th * 15);
        return [1.04 + curl, 0, 0];
      },
    },
    {
      x: 0,
      y: 1.835,
      z: 0.002,
      rx: 0.058,
      rz: 0.072,
      weights: [[BONE.HEAD, 1]],
      contour: (th) => [1.05 + 0.038 * Math.sin(th * 7), 0, 0],
    },
    { x: 0, y: 1.855, z: 0.002, rx: 0.018, rz: 0.022, weights: [[BONE.HEAD, 1]] },
  ];
  appendSkinnedLoft(b, torsoHeadRings, 28, true, true, false);

  // 2. Left (+1) & Right (-1) Muscular Arms seamlessly rooted inside Chest/Shoulder sockets
  const buildSkinnedArm = (side: 1 | -1) => {
    const bSh = side > 0 ? BONE.L_SHOULDER : BONE.R_SHOULDER;
    const bUp = side > 0 ? BONE.L_UPPER_ARM : BONE.R_UPPER_ARM;
    const bFo = side > 0 ? BONE.L_FOREARM : BONE.R_FOREARM;
    const bHa = side > 0 ? BONE.L_HAND : BONE.R_HAND;

    // Rings flow top-down from shoulder socket -> deltoid -> biceps/triceps -> elbow -> forearm -> wrist -> hand
    const armRings: LoftRing[] = [
      // Rooted deep inside upper torso so shoulder rotation never shows a seam or gap
      {
        x: side * 0.165,
        y: 1.39,
        z: -0.005,
        rx: 0.068,
        rz: 0.072,
        weights: [[BONE.CHEST, 0.72], [bSh, 0.28]],
      },
      // Broad muscular deltoid cap peaking cleanly like the reference photo
      {
        x: side * 0.228,
        y: 1.405,
        z: -0.006,
        rx: 0.078,
        rz: 0.076,
        weights: [[bSh, 0.45], [bUp, 0.55]],
        contour: (th) => {
          // Lateral deltoid roundness
          const lat = Math.max(0, side * Math.sin(th)) * 0.14;
          return [1 + lat, 0, 0];
        },
      },
      // Deltoid taper into upper arm
      {
        x: side * 0.244,
        y: 1.32,
        z: -0.008,
        rx: 0.062,
        rz: 0.064,
        weights: [[bUp, 0.92], [bSh, 0.08]],
      },
      // Biceps / Triceps muscular fullness
      {
        x: side * 0.248,
        y: 1.22,
        z: -0.01,
        rx: 0.056,
        rz: 0.062,
        weights: [[bUp, 1]],
        contour: (th) => {
          // Subtle triceps sweep back (-Z) & biceps curve forward (+Z)
          const curve = Math.abs(Math.cos(th)) * 0.08;
          return [1 + curve, 0, 0];
        },
      },
      // Elbow transition
      {
        x: side * 0.246,
        y: 1.11,
        z: -0.012,
        rx: 0.046,
        rz: 0.048,
        weights: [[bUp, 0.5], [bFo, 0.5]],
      },
      // Upper forearm muscular belly (brachioradialis)
      {
        x: side * 0.25,
        y: 1.02,
        z: -0.004,
        rx: 0.049,
        rz: 0.052,
        weights: [[bFo, 0.92], [bUp, 0.08]],
      },
      // Lower forearm taper
      {
        x: side * 0.252,
        y: 0.91,
        z: 0.004,
        rx: 0.036,
        rz: 0.038,
        weights: [[bFo, 0.9], [bHa, 0.1]],
      },
      // Wrist
      {
        x: side * 0.252,
        y: 0.845,
        z: 0.008,
        rx: 0.029,
        rz: 0.034,
        weights: [[bFo, 0.35], [bHa, 0.65]],
      },
      // Palm & thumb heel silhouette
      {
        x: side * 0.252,
        y: 0.78,
        z: 0.014,
        rx: 0.025,
        rz: 0.046,
        weights: [[bHa, 1]],
        contour: (th) => {
          const thumbRidge = Math.pow(Math.max(0, Math.cos(th)), 3) * 0.18;
          return [1 + thumbRidge, 0, 0];
        },
      },
      // Fingers resting relaxed
      {
        x: side * 0.252,
        y: 0.71,
        z: 0.012,
        rx: 0.018,
        rz: 0.036,
        weights: [[bHa, 1]],
      },
      {
        x: side * 0.25,
        y: 0.672,
        z: 0.01,
        rx: 0.01,
        rz: 0.02,
        weights: [[bHa, 1]],
      },
    ];
    appendSkinnedLoft(b, armRings, 18, true, true, true);
  };

  buildSkinnedArm(1);
  buildSkinnedArm(-1);

  // 3. Left (+1) & Right (-1) Muscular Legs (Thigh -> Knee -> Sculpted Calf -> Ankle)
  const buildSkinnedLeg = (side: 1 | -1) => {
    const bTh = side > 0 ? BONE.L_THIGH : BONE.R_THIGH;
    const bSh = side > 0 ? BONE.L_SHIN : BONE.R_SHIN;
    const bFo = side > 0 ? BONE.L_FOOT : BONE.R_FOOT;

    const legRings: LoftRing[] = [
      // Rooted seamlessly inside pelvis
      {
        x: side * 0.098,
        y: 0.94,
        z: -0.008,
        rx: 0.094,
        rz: 0.096,
        weights: [[BONE.HIPS, 0.65], [bTh, 0.35]],
      },
      // Upper thigh / quads & hamstring sweep
      {
        x: side * 0.106,
        y: 0.76,
        z: -0.004,
        rx: 0.088,
        rz: 0.094,
        weights: [[bTh, 1]],
      },
      // Lower thigh above knee (emerging cleanly from shorts hem)
      {
        x: side * 0.104,
        y: 0.59,
        z: 0.002,
        rx: 0.072,
        rz: 0.076,
        weights: [[bTh, 0.94], [bSh, 0.06]],
      },
      // Knee joint
      {
        x: side * 0.104,
        y: 0.5,
        z: 0.006,
        rx: 0.058,
        rz: 0.062,
        weights: [[bTh, 0.5], [bSh, 0.5]],
      },
      // Upper shin below patella
      {
        x: side * 0.104,
        y: 0.43,
        z: -0.002,
        rx: 0.058,
        rz: 0.062,
        weights: [[bTh, 0.1], [bSh, 0.9]],
      },
      // Prominent sculpted gastrocnemius calf belly (iconic silhouette feature in reference photo!)
      {
        x: side * 0.104,
        y: 0.335,
        z: -0.012,
        rx: 0.067,
        rz: 0.073,
        weights: [[bSh, 1]],
        contour: (th) => {
          // Posterior calf muscle fullness (-Z)
          const calfPeak = Math.max(0, -Math.cos(th)) * 0.16;
          return [1 + calfPeak, 0, 0];
        },
      },
      // Taper down toward Achilles tendon
      {
        x: side * 0.104,
        y: 0.21,
        z: -0.006,
        rx: 0.044,
        rz: 0.05,
        weights: [[bSh, 1]],
      },
      // Slim athletic ankle entering sock/shoe collar
      {
        x: side * 0.104,
        y: 0.095,
        z: -0.002,
        rx: 0.038,
        rz: 0.044,
        weights: [[bSh, 0.55], [bFo, 0.45]],
      },
      {
        x: side * 0.104,
        y: 0.06,
        z: 0.0,
        rx: 0.036,
        rz: 0.044,
        weights: [[bFo, 1]],
      },
    ];
    appendSkinnedLoft(b, legRings, 20, true, true, true);
  };

  buildSkinnedLeg(1);
  buildSkinnedLeg(-1);

  return finalizeSkinnedGeometry(b);
}

function createApparelGeometry(): THREE.BufferGeometry {
  const b = createBuilder();

  // 1. Fitted Sleeveless Athletic Top (hugging broad upper torso with subtle natural fabric folds)
  const vestRings: LoftRing[] = [
    // Hem resting slightly above hips
    {
      x: 0,
      y: 0.95,
      z: -0.01,
      rx: 0.172,
      rz: 0.124,
      weights: [[BONE.HIPS, 0.78], [BONE.SPINE, 0.22]],
      contour: (th) => [1 + 0.018 * Math.sin(th * 6), 0, 0],
    },
    // Fitted waist crease
    {
      x: 0,
      y: 1.08,
      z: 0.0,
      rx: 0.162,
      rz: 0.12,
      weights: [[BONE.HIPS, 0.28], [BONE.SPINE, 0.72]],
      contour: (th) => [1 + 0.022 * Math.cos(th * 5 + 0.4), 0, 0],
    },
    // Ribcage / lats
    {
      x: 0,
      y: 1.23,
      z: 0.004,
      rx: 0.203,
      rz: 0.133,
      weights: [[BONE.SPINE, 0.52], [BONE.CHEST, 0.48]],
      contour: (th) => {
        const lat = Math.pow(Math.abs(Math.sin(th)), 1.6) * (Math.cos(th) < 0 ? 0.095 : 0.035);
        return [1 + lat + 0.012 * Math.sin(th * 8), 0, 0];
      },
    },
    // Sleeveless armhole cut shaping: narrows gracefully across shoulders to expose deltoids!
    {
      x: 0,
      y: 1.37,
      z: 0.0,
      rx: 0.205,
      rz: 0.138,
      weights: [[BONE.CHEST, 0.94], [BONE.SPINE, 0.06]],
      contour: (th) => {
        // Sculpted racer/sleeveless armhole pull inward laterally
        const sidePinch = Math.pow(Math.abs(Math.sin(th)), 4) * 0.13;
        const chestFull = Math.max(0, Math.cos(th)) * 0.05;
        return [1 - sidePinch + chestFull, 0, 0];
      },
    },
    // Sleeveless shoulder straps meeting base of neck collar
    {
      x: 0,
      y: 1.465,
      z: -0.004,
      rx: 0.148,
      rz: 0.104,
      weights: [[BONE.CHEST, 0.75], [BONE.NECK, 0.25]],
      contour: (th) => {
        const sidePinch = Math.pow(Math.abs(Math.sin(th)), 3) * 0.16;
        return [1 - sidePinch, 0, 0];
      },
    },
    // Crew collar edge cleanly seated at lower neck
    {
      x: 0,
      y: 1.495,
      z: 0.0,
      rx: 0.088,
      rz: 0.086,
      weights: [[BONE.CHEST, 0.4], [BONE.NECK, 0.6]],
    },
  ];
  appendSkinnedLoft(b, vestRings, 28, true, true, false);

  // 2. Tailored Shorts Waistband & Pelvis Wrap
  const shortsWaistRings: LoftRing[] = [
    {
      x: 0,
      y: 0.85,
      z: -0.014,
      rx: 0.184,
      rz: 0.134,
      weights: [[BONE.HIPS, 0.9], [BONE.L_THIGH, 0.05], [BONE.R_THIGH, 0.05]],
    },
    {
      x: 0,
      y: 0.98,
      z: -0.01,
      rx: 0.175,
      rz: 0.127,
      weights: [[BONE.HIPS, 0.95], [BONE.SPINE, 0.05]],
      contour: (th) => [1 + 0.015 * Math.sin(th * 6), 0, 0],
    },
  ];
  appendSkinnedLoft(b, shortsWaistRings, 26, true, true, false);

  // 3. Tailored Shorts Thigh Sleeves (Left & Right, clean mid-thigh hem matching reference)
  const buildShortSleeve = (side: 1 | -1) => {
    const bTh = side > 0 ? BONE.L_THIGH : BONE.R_THIGH;
    const sleeveRings: LoftRing[] = [
      {
        x: side * 0.095,
        y: 0.94,
        z: -0.01,
        rx: 0.106,
        rz: 0.114,
        weights: [[BONE.HIPS, 0.55], [bTh, 0.45]],
      },
      {
        x: side * 0.106,
        y: 0.76,
        z: -0.005,
        rx: 0.104,
        rz: 0.112,
        weights: [[bTh, 0.95], [BONE.HIPS, 0.05]],
        contour: (th) => [1 + 0.025 * Math.sin(th * 5 + side), 0, 0],
      },
      // Relaxed athletic above-knee hem (~0.56m above ground)
      {
        x: side * 0.106,
        y: 0.565,
        z: -0.002,
        rx: 0.096,
        rz: 0.102,
        weights: [[bTh, 1]],
        contour: (th) => [1 + 0.03 * Math.cos(th * 4 + side), 0, 0],
      },
    ];
    appendSkinnedLoft(b, sleeveRings, 20, true, true, true);
  };

  buildShortSleeve(1);
  buildShortSleeve(-1);

  return finalizeSkinnedGeometry(b);
}

function createFootwearGeometry(): THREE.BufferGeometry {
  const b = createBuilder();

  const buildSockAndShoe = (side: 1 | -1) => {
    const bSh = side > 0 ? BONE.L_SHIN : BONE.R_SHIN;
    const bFo = side > 0 ? BONE.L_FOOT : BONE.R_FOOT;
    const bTo = side > 0 ? BONE.L_TOE : BONE.R_TOE;
    const cx = side * 0.104;

    // 1. Mid-Calf Athletic Socks (y = 0.245 down to ankle 0.075, just like reference!)
    const sockRings: LoftRing[] = [
      { x: cx, y: 0.245, z: -0.008, rx: 0.052, rz: 0.058, weights: [[bSh, 1]] },
      { x: cx, y: 0.16, z: -0.004, rx: 0.043, rz: 0.049, weights: [[bSh, 0.9], [bFo, 0.1]] },
      { x: cx, y: 0.078, z: -0.002, rx: 0.041, rz: 0.047, weights: [[bSh, 0.4], [bFo, 0.6]] },
    ];
    appendSkinnedLoft(b, sockRings, 16, true, true, true);

    // 2. Sculpted Low-Top Athletic Trainer (spans Heel -> Midfoot -> Articulated Forefoot Toe Box)
    // Built back-to-front along +Z so Foot -> Toe bone weight transition bends cleanly during push-off!
    const shoeSlices: Array<{
      z: number;
      yCenter: number;
      rx: number;
      ry: number;
      weights: BoneWeightPair[];
    }> = [
      // Heel cup rear
      { z: -0.058, yCenter: 0.044, rx: 0.032, ry: 0.044, weights: [[bFo, 1]] },
      // Heel cushion & ankle collar
      { z: -0.025, yCenter: 0.047, rx: 0.046, ry: 0.047, weights: [[bFo, 1]] },
      // Instep / tongue peak
      { z: 0.042, yCenter: 0.05, rx: 0.049, ry: 0.05, weights: [[bFo, 0.92], [bTo, 0.08]] },
      // Ball of foot (flex hinge at z = 0.125 where Toe bone sits!)
      { z: 0.125, yCenter: 0.036, rx: 0.051, ry: 0.036, weights: [[bFo, 0.45], [bTo, 0.55]] },
      // Forefoot vamp
      { z: 0.175, yCenter: 0.026, rx: 0.043, ry: 0.026, weights: [[bTo, 1]] },
      // Rounded athletic toe tip
      { z: 0.212, yCenter: 0.018, rx: 0.026, ry: 0.017, weights: [[bTo, 1]] },
    ];

    const segs = 16;
    const cols = segs + 1;
    const startVert = b.positions.length / 3;

    for (let iz = 0; iz < shoeSlices.length; iz++) {
      const s = shoeSlices[iz];
      const v = iz / (shoeSlices.length - 1);
      const packed = packWeights(s.weights);

      for (let ix = 0; ix <= segs; ix++) {
        const u = ix / segs;
        const th = u * Math.PI * 2;
        const cosTh = Math.cos(th);
        const sinTh = Math.sin(th);
        // Flatten bottom sole cleanly at y = 0.0 while keeping rounded upper arch
        const yOff = sinTh < 0 ? sinTh * s.yCenter : sinTh * s.ry;
        const x = cx + cosTh * s.rx;
        const y = Math.max(0.0, s.yCenter + yOff);
        pushVertex(b, x, y, s.z, u, v, packed);
      }
    }

    for (let iz = 0; iz < shoeSlices.length - 1; iz++) {
      for (let ix = 0; ix < segs; ix++) {
        const a = startVert + iz * cols + ix;
        const c = startVert + iz * cols + (ix + 1);
        const bVert = startVert + (iz + 1) * cols + ix;
        const d = startVert + (iz + 1) * cols + (ix + 1);
        b.indices.push(a, c, bVert);
        b.indices.push(c, d, bVert);
      }
    }

    // Cap heel & toe
    const sFirst = shoeSlices[0];
    const heelCenter = pushVertex(b, cx, sFirst.yCenter, sFirst.z - 0.005, 0.5, 0, packWeights(sFirst.weights));
    for (let ix = 0; ix < segs; ix++) {
      b.indices.push(heelCenter, startVert + ix, startVert + ix + 1);
    }

    const sLast = shoeSlices[shoeSlices.length - 1];
    const lastStart = startVert + (shoeSlices.length - 1) * cols;
    const toeCenter = pushVertex(b, cx, sLast.yCenter, sLast.z + 0.008, 0.5, 1, packWeights(sLast.weights));
    for (let ix = 0; ix < segs; ix++) {
      b.indices.push(toeCenter, lastStart + ix + 1, lastStart + ix);
    }
  };

  buildSockAndShoe(1);
  buildSockAndShoe(-1);

  return finalizeSkinnedGeometry(b);
}

function buildSkeletonHierarchy(): {
  bones: THREE.Bone[];
  skeleton: THREE.Skeleton;
  leftHeelContact: THREE.Object3D;
  leftToeContact: THREE.Object3D;
  rightHeelContact: THREE.Object3D;
  rightToeContact: THREE.Object3D;
} {
  const bones: THREE.Bone[] = Array.from({ length: 21 }, () => new THREE.Bone());

  // Root / Torso / Head chain
  bones[BONE.HIPS].position.set(0, 0.94, 0);
  bones[BONE.SPINE].position.set(0, 0.14, 0);
  bones[BONE.CHEST].position.set(0, 0.24, 0);
  bones[BONE.NECK].position.set(0, 0.18, 0.005);
  bones[BONE.HEAD].position.set(0, 0.11, 0.01);

  bones[BONE.HIPS].add(bones[BONE.SPINE]);
  bones[BONE.SPINE].add(bones[BONE.CHEST]);
  bones[BONE.CHEST].add(bones[BONE.NECK]);
  bones[BONE.NECK].add(bones[BONE.HEAD]);

  // Left Arm (+X)
  bones[BONE.L_SHOULDER].position.set(0.055, 0.11, -0.006);
  bones[BONE.L_UPPER_ARM].position.set(0.173, -0.015, -0.002);
  bones[BONE.L_FOREARM].position.set(0, -0.305, 0);
  bones[BONE.L_HAND].position.set(0, -0.265, 0);

  bones[BONE.CHEST].add(bones[BONE.L_SHOULDER]);
  bones[BONE.L_SHOULDER].add(bones[BONE.L_UPPER_ARM]);
  bones[BONE.L_UPPER_ARM].add(bones[BONE.L_FOREARM]);
  bones[BONE.L_FOREARM].add(bones[BONE.L_HAND]);

  // Right Arm (-X)
  bones[BONE.R_SHOULDER].position.set(-0.055, 0.11, -0.006);
  bones[BONE.R_UPPER_ARM].position.set(-0.173, -0.015, -0.002);
  bones[BONE.R_FOREARM].position.set(0, -0.305, 0);
  bones[BONE.R_HAND].position.set(0, -0.265, 0);

  bones[BONE.CHEST].add(bones[BONE.R_SHOULDER]);
  bones[BONE.R_SHOULDER].add(bones[BONE.R_UPPER_ARM]);
  bones[BONE.R_UPPER_ARM].add(bones[BONE.R_FOREARM]);
  bones[BONE.R_FOREARM].add(bones[BONE.R_HAND]);

  // Left Leg (+X)
  bones[BONE.L_THIGH].position.set(0.104, -0.02, 0);
  bones[BONE.L_SHIN].position.set(0, -0.42, 0);
  bones[BONE.L_FOOT].position.set(0, -0.415, 0);
  bones[BONE.L_TOE].position.set(0, -0.06, 0.125);

  bones[BONE.HIPS].add(bones[BONE.L_THIGH]);
  bones[BONE.L_THIGH].add(bones[BONE.L_SHIN]);
  bones[BONE.L_SHIN].add(bones[BONE.L_FOOT]);
  bones[BONE.L_FOOT].add(bones[BONE.L_TOE]);

  // Right Leg (-X)
  bones[BONE.R_THIGH].position.set(-0.104, -0.02, 0);
  bones[BONE.R_SHIN].position.set(0, -0.42, 0);
  bones[BONE.R_FOOT].position.set(0, -0.415, 0);
  bones[BONE.R_TOE].position.set(0, -0.06, 0.125);

  bones[BONE.HIPS].add(bones[BONE.R_THIGH]);
  bones[BONE.R_THIGH].add(bones[BONE.R_SHIN]);
  bones[BONE.R_SHIN].add(bones[BONE.R_FOOT]);
  bones[BONE.R_FOOT].add(bones[BONE.R_TOE]);

  // Floor contact probes sitting precisely at shoe sole level (world Y = 0.000 in bind pose)
  const leftHeelContact = new THREE.Object3D();
  leftHeelContact.position.set(0, -0.085, -0.035);
  bones[BONE.L_FOOT].add(leftHeelContact);

  const leftToeContact = new THREE.Object3D();
  leftToeContact.position.set(0, -0.025, 0.072);
  bones[BONE.L_TOE].add(leftToeContact);

  const rightHeelContact = new THREE.Object3D();
  rightHeelContact.position.set(0, -0.085, -0.035);
  bones[BONE.R_FOOT].add(rightHeelContact);

  const rightToeContact = new THREE.Object3D();
  rightToeContact.position.set(0, -0.025, 0.072);
  bones[BONE.R_TOE].add(rightToeContact);

  const skeleton = new THREE.Skeleton(bones);
  return {
    bones,
    skeleton,
    leftHeelContact,
    leftToeContact,
    rightHeelContact,
    rightToeContact,
  };
}

export function createCinematicCharacter(clothTextures: ClothTextureSet): CharacterRig {
  const disposables: Array<{ dispose: () => void }> = [];

  // Shadowed silhouette skin: catches warm golden sunrise rim light naturally across deltoids, forearms, and calves
  const skinMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(OFFICIAL_PALETTE.deepWineRed),
    roughness: 0.62,
    metalness: 0.02,
    sheen: 0.25,
    sheenRoughness: 0.7,
    sheenColor: new THREE.Color(OFFICIAL_PALETTE.darkBronze),
    envMapIntensity: 0.22,
  });
  disposables.push(skinMaterial);

  // Fitted dark athletic clothing (matte midnight-burgundy weave with restrained golden rim sheen)
  const apparelMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(OFFICIAL_PALETTE.midnightBurgundy),
    roughness: 0.88,
    metalness: 0.02,
    sheen: 0.34,
    sheenRoughness: 0.75,
    sheenColor: new THREE.Color(OFFICIAL_PALETTE.royalBurgundy),
    roughnessMap: clothTextures.roughnessMap,
    bumpMap: clothTextures.bumpMap,
    bumpScale: 0.007,
    envMapIntensity: 0.16,
  });
  disposables.push(apparelMaterial);

  // Mid-calf socks & low-top dark athletic shoes
  const footwearMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(OFFICIAL_PALETTE.midnightBurgundy),
    roughness: 0.48,
    metalness: 0.08,
    envMapIntensity: 0.32,
  });
  disposables.push(footwearMaterial);

  const skinGeo = createBodyAndLimbsGeometry();
  const apparelGeo = createApparelGeometry();
  const footwearGeo = createFootwearGeometry();
  disposables.push(skinGeo, apparelGeo, footwearGeo);

  // Grounding contact shadow disc beneath feet
  const contactCanvas = document.createElement('canvas');
  contactCanvas.width = contactCanvas.height = 128;
  const cCtx = contactCanvas.getContext('2d')!;
  const cGrad = cCtx.createRadialGradient(64, 64, 4, 64, 64, 60);
  cGrad.addColorStop(0, 'rgba(10, 0, 0, 0.86)');
  cGrad.addColorStop(0.52, 'rgba(20, 0, 0, 0.4)');
  cGrad.addColorStop(1, 'rgba(32, 0, 0, 0.0)');
  cCtx.fillStyle = cGrad;
  cCtx.fillRect(0, 0, 128, 128);
  const contactTex = new THREE.CanvasTexture(contactCanvas);
  contactTex.colorSpace = THREE.SRGBColorSpace;
  const contactGeo = new THREE.CircleGeometry(0.56, 24);
  contactGeo.rotateX(-Math.PI / 2);
  const contactMat = new THREE.MeshBasicMaterial({
    map: contactTex,
    transparent: true,
    opacity: 0.76,
    depthWrite: false,
  });
  disposables.push(contactTex, contactGeo, contactMat);

  const root = new THREE.Group();
  const contactShadow = new THREE.Mesh(contactGeo, contactMat);
  contactShadow.position.y = 0.014;
  root.add(contactShadow);

  const {
    bones,
    skeleton,
    leftHeelContact,
    leftToeContact,
    rightHeelContact,
    rightToeContact,
  } = buildSkeletonHierarchy();

  root.add(bones[BONE.HIPS]);
  root.updateMatrixWorld(true);

  const skinMesh = new THREE.SkinnedMesh(skinGeo, skinMaterial);
  skinMesh.castShadow = true;
  skinMesh.receiveShadow = true;
  skinMesh.frustumCulled = false;
  skinMesh.bind(skeleton);

  const apparelMesh = new THREE.SkinnedMesh(apparelGeo, apparelMaterial);
  apparelMesh.castShadow = true;
  apparelMesh.receiveShadow = true;
  apparelMesh.frustumCulled = false;
  apparelMesh.bind(skeleton);

  const footwearMesh = new THREE.SkinnedMesh(footwearGeo, footwearMaterial);
  footwearMesh.castShadow = true;
  footwearMesh.receiveShadow = true;
  footwearMesh.frustumCulled = false;
  footwearMesh.bind(skeleton);

  root.add(skinMesh, apparelMesh, footwearMesh);

  return {
    root,
    skeleton,
    bones,
    skinMesh,
    apparelMesh,
    footwearMesh,
    leftHeelContact,
    leftToeContact,
    rightHeelContact,
    rightToeContact,
    contactShadow,
    dispose: () => {
      skeleton.dispose();
      for (const item of disposables) {
        item.dispose();
      }
    },
  };
}

/**
 * Updates skeletal articulation and locks the lowest planted shoe contact cleanly to floor level (y = 0)
 * so strides have authentic heel-to-toe roll with zero foot floating or floor clipping.
 */
export function updateCharacterPose(
  rig: CharacterRig,
  pose: BiomechanicalPose,
  _elapsedSec: number
): void {
  const { bones } = rig;

  rig.root.position.set(0, 0, pose.characterZ);
  rig.root.rotation.y = pose.characterYaw;

  // Pelvis base height + lateral weight transfer & counter-rotation
  bones[BONE.HIPS].position.set(pose.pelvisShiftX, 0.94 + pose.pelvisBobY, 0);
  bones[BONE.HIPS].rotation.set(0, pose.pelvisYaw, pose.pelvisRoll);

  // Spine & Chest distribute counter-rotation naturally upward
  bones[BONE.SPINE].rotation.set(pose.torsoPitch * 0.45, pose.chestYaw * 0.45, -pose.pelvisRoll * 0.4);
  bones[BONE.CHEST].rotation.set(pose.torsoPitch * 0.55, pose.chestYaw * 0.55, -pose.pelvisRoll * 0.4);

  // Head stabilized smoothly toward the Solstice sunrise horizon
  bones[BONE.NECK].rotation.set(pose.headPitch * 0.45, pose.headYaw * 0.4, 0);
  bones[BONE.HEAD].rotation.set(pose.headPitch * 0.55, pose.headYaw * 0.6, 0);

  // Left Leg (+X)
  bones[BONE.L_THIGH].rotation.set(pose.leftHipX, 0, 0);
  bones[BONE.L_SHIN].rotation.set(pose.leftKneeX, 0, 0);
  bones[BONE.L_FOOT].rotation.set(pose.leftAnkleX, 0, 0);
  bones[BONE.L_TOE].rotation.set(pose.leftToeX, 0, 0);

  // Right Leg (-X)
  bones[BONE.R_THIGH].rotation.set(pose.rightHipX, 0, 0);
  bones[BONE.R_SHIN].rotation.set(pose.rightKneeX, 0, 0);
  bones[BONE.R_FOOT].rotation.set(pose.rightAnkleX, 0, 0);
  bones[BONE.R_TOE].rotation.set(pose.rightToeX, 0, 0);

  // Left & Right Arms (relaxed natural shoulder protraction & coordinated opposite swing)
  bones[BONE.L_SHOULDER].rotation.set(0, pose.leftShoulderX * 0.14, 0);
  bones[BONE.L_UPPER_ARM].rotation.set(pose.leftShoulderX, 0, pose.leftShoulderZ);
  bones[BONE.L_FOREARM].rotation.set(pose.leftElbowX, 0, 0);
  bones[BONE.L_HAND].rotation.set(pose.leftElbowX * 0.15, 0, -0.05);

  bones[BONE.R_SHOULDER].rotation.set(0, pose.rightShoulderX * 0.14, 0);
  bones[BONE.R_UPPER_ARM].rotation.set(pose.rightShoulderX, 0, pose.rightShoulderZ);
  bones[BONE.R_FOREARM].rotation.set(pose.rightElbowX, 0, 0);
  bones[BONE.R_HAND].rotation.set(pose.rightElbowX * 0.15, 0, 0.05);

  // World-space sole ground contact lock (pins lowest heel/toe strictly at y = 0.002)
  rig.root.updateMatrixWorld(true);
  rig.leftHeelContact.getWorldPosition(_tmpVec);
  let minY = _tmpVec.y;
  rig.leftToeContact.getWorldPosition(_tmpVec);
  if (_tmpVec.y < minY) minY = _tmpVec.y;
  rig.rightHeelContact.getWorldPosition(_tmpVec);
  if (_tmpVec.y < minY) minY = _tmpVec.y;
  rig.rightToeContact.getWorldPosition(_tmpVec);
  if (_tmpVec.y < minY) minY = _tmpVec.y;

  const groundAdjust = Math.max(-0.08, Math.min(0.08, -minY + 0.002));
  bones[BONE.HIPS].position.y += groundAdjust;
  rig.root.updateMatrixWorld(true);
}
