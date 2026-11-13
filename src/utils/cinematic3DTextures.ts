/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { OFFICIAL_PALETTE } from './cinematicStoryboard';

export interface MarbleTextureSet {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  dispose: () => void;
}

export interface ClothTextureSet {
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  dispose: () => void;
}

function seededNoise(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const a = seededNoise(ix, iy);
  const b = seededNoise(ix + 1, iy);
  const c = seededNoise(ix, iy + 1);
  const d = seededNoise(ix + 1, iy + 1);

  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < 4; i++) {
    value += amp * smoothNoise(x * freq, y * freq);
    freq *= 2.02;
    amp *= 0.5;
  }
  return value;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

export function createMarbleFloorTextures(maxAnisotropy: number): MarbleTextureSet {
  const size = 512;
  const albedoCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  albedoCanvas.width = roughCanvas.width = bumpCanvas.width = size;
  albedoCanvas.height = roughCanvas.height = bumpCanvas.height = size;

  const aCtx = albedoCanvas.getContext('2d')!;
  const rCtx = roughCanvas.getContext('2d')!;
  const bCtx = bumpCanvas.getContext('2d')!;

  const aImg = aCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);
  const bImg = bCtx.createImageData(size, size);

  const cBase = hexToRgb(OFFICIAL_PALETTE.midnightBurgundy);
  const cMid = hexToRgb(OFFICIAL_PALETTE.deepWineRed);
  const cRoyal = hexToRgb(OFFICIAL_PALETTE.royalBurgundy);
  const cBronze = hexToRgb(OFFICIAL_PALETTE.darkBronze);
  const cGold = hexToRgb(OFFICIAL_PALETTE.antiqueGold);

  const tileGrid = 2; // 2x2 slab grid per UV repeat

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;

      // Subtle thin dark joint between large honed stone slabs
      const gx = (u * tileGrid) % 1;
      const gy = (v * tileGrid) % 1;
      const isSeam = gx < 0.007 || gx > 0.993 || gy < 0.007 || gy > 0.993;

      // Tile-specific offset so marble veins shift naturally per slab
      const tileId = Math.floor(u * tileGrid) * 7 + Math.floor(v * tileGrid) * 13;
      const nx = u * 4.5 + tileId * 0.73;
      const ny = v * 4.5 + tileId * 0.41;

      const turbulence = fbm(nx, ny);
      const veinWave = Math.abs(Math.sin((u * 3.0 + v * 1.4 + turbulence * 2.2) * Math.PI));
      const thinGoldVein = Math.pow(1 - Math.min(1, veinWave), 14);
      const broadCloud = fbm(nx * 0.65 + 4.1, ny * 0.65 + 1.9);

      const idx = (y * size + x) * 4;

      if (isSeam) {
        // Recessed deep midnight burgundy shadow joint with subtle dark bronze undertone
        aImg.data[idx] = Math.round(cBase[0] * 0.7 + cBronze[0] * 0.12);
        aImg.data[idx + 1] = Math.round(cBase[1] * 0.7 + cBronze[1] * 0.12);
        aImg.data[idx + 2] = Math.round(cBase[2] * 0.7 + cBronze[2] * 0.12);
        aImg.data[idx + 3] = 255;

        rImg.data[idx] = rImg.data[idx + 1] = rImg.data[idx + 2] = 175;
        rImg.data[idx + 3] = 255;

        bImg.data[idx] = bImg.data[idx + 1] = bImg.data[idx + 2] = 36;
        bImg.data[idx + 3] = 255;
      } else {
        const blend1 = broadCloud * 0.55;
        const blend2 = Math.pow(broadCloud, 2.6) * 0.28;
        const goldMix = thinGoldVein * 0.18;

        let r = cBase[0] + (cMid[0] - cBase[0]) * blend1 + (cRoyal[0] - cMid[0]) * blend2;
        let g = cBase[1] + (cMid[1] - cBase[1]) * blend1 + (cRoyal[1] - cMid[1]) * blend2;
        let b = cBase[2] + (cMid[2] - cBase[2]) * blend1 + (cRoyal[2] - cMid[2]) * blend2;

        r = r * (1 - goldMix) + cGold[0] * goldMix;
        g = g * (1 - goldMix) + cGold[1] * goldMix;
        b = b * (1 - goldMix) + cGold[2] * goldMix;

        aImg.data[idx] = Math.min(255, Math.max(0, Math.round(r * 0.78)));
        aImg.data[idx + 1] = Math.min(255, Math.max(0, Math.round(g * 0.78)));
        aImg.data[idx + 2] = Math.min(255, Math.max(0, Math.round(b * 0.78)));
        aImg.data[idx + 3] = 255;

        // Subtle mineral polish variation
        const roughVal = Math.round(68 + (1 - broadCloud) * 62 - thinGoldVein * 18);
        rImg.data[idx] = rImg.data[idx + 1] = rImg.data[idx + 2] = Math.max(40, Math.min(155, roughVal));
        rImg.data[idx + 3] = 255;

        const bumpVal = Math.round(122 + turbulence * 26 - thinGoldVein * 12);
        bImg.data[idx] = bImg.data[idx + 1] = bImg.data[idx + 2] = Math.max(60, Math.min(200, bumpVal));
        bImg.data[idx + 3] = 255;
      }
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(6, 22);
  map.anisotropy = maxAnisotropy;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(6, 22);
  roughnessMap.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(6, 22);
  bumpMap.anisotropy = maxAnisotropy;

  return {
    map,
    roughnessMap,
    bumpMap,
    dispose: () => {
      map.dispose();
      roughnessMap.dispose();
      bumpMap.dispose();
    },
  };
}

export function createColumnStoneTextures(maxAnisotropy: number): MarbleTextureSet {
  const size = 256;
  const albedoCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  albedoCanvas.width = roughCanvas.width = bumpCanvas.width = size;
  albedoCanvas.height = roughCanvas.height = bumpCanvas.height = size;

  const aCtx = albedoCanvas.getContext('2d')!;
  const rCtx = roughCanvas.getContext('2d')!;
  const bCtx = bumpCanvas.getContext('2d')!;

  const aImg = aCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);
  const bImg = bCtx.createImageData(size, size);

  const cBase = hexToRgb(OFFICIAL_PALETTE.deepWineRed);
  const cHigh = hexToRgb(OFFICIAL_PALETTE.royalBurgundy);
  const cDark = hexToRgb(OFFICIAL_PALETTE.midnightBurgundy);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // 20 classical vertical column flutes
      const flute = Math.sin(u * Math.PI * 40);
      const fluteHeight = Math.max(0, flute);
      const stoneNoise = fbm(u * 5.0, v * 8.0);
      const idx = (y * size + x) * 4;

      const mixVal = stoneNoise * 0.65 + fluteHeight * 0.2;
      const shadowVal = (1 - fluteHeight) * 0.35;

      const r = cBase[0] * (1 - shadowVal) + cDark[0] * shadowVal + (cHigh[0] - cBase[0]) * mixVal * 0.45;
      const g = cBase[1] * (1 - shadowVal) + cDark[1] * shadowVal + (cHigh[1] - cBase[1]) * mixVal * 0.45;
      const b = cBase[2] * (1 - shadowVal) + cDark[2] * shadowVal + (cHigh[2] - cBase[2]) * mixVal * 0.45;

      aImg.data[idx] = Math.round(r);
      aImg.data[idx + 1] = Math.round(g);
      aImg.data[idx + 2] = Math.round(b);
      aImg.data[idx + 3] = 255;

      const rVal = Math.round(92 + (1 - fluteHeight) * 58 + stoneNoise * 35);
      rImg.data[idx] = rImg.data[idx + 1] = rImg.data[idx + 2] = rVal;
      rImg.data[idx + 3] = 255;

      const bVal = Math.round(96 + fluteHeight * 110 + stoneNoise * 24);
      bImg.data[idx] = bImg.data[idx + 1] = bImg.data[idx + 2] = bVal;
      bImg.data[idx + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = maxAnisotropy;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.anisotropy = maxAnisotropy;

  return {
    map,
    roughnessMap,
    bumpMap,
    dispose: () => {
      map.dispose();
      roughnessMap.dispose();
      bumpMap.dispose();
    },
  };
}

export function createWoolClothTextures(maxAnisotropy: number): ClothTextureSet {
  const size = 128;
  const roughCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  roughCanvas.width = bumpCanvas.width = size;
  roughCanvas.height = bumpCanvas.height = size;

  const rCtx = roughCanvas.getContext('2d')!;
  const bCtx = bumpCanvas.getContext('2d')!;
  const rImg = rCtx.createImageData(size, size);
  const bImg = bCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Subtle luxury diagonal twill wool weave
      const twill = Math.sin((x + y) * 0.95) * 0.5 + 0.5;
      const cross = Math.cos((x - y) * 0.45) * 0.25;
      const val = Math.max(0, Math.min(1, 0.5 + (twill - 0.5) * 0.4 + cross));
      const idx = (y * size + x) * 4;

      rImg.data[idx] = rImg.data[idx + 1] = rImg.data[idx + 2] = Math.round(170 + val * 45);
      rImg.data[idx + 3] = 255;

      bImg.data[idx] = bImg.data[idx + 1] = bImg.data[idx + 2] = Math.round(100 + val * 80);
      bImg.data[idx + 3] = 255;
    }
  }

  rCtx.putImageData(rImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(8, 12);
  roughnessMap.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(8, 12);
  bumpMap.anisotropy = maxAnisotropy;

  return {
    roughnessMap,
    bumpMap,
    dispose: () => {
      roughnessMap.dispose();
      bumpMap.dispose();
    },
  };
}

export function createDustSpriteTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(240, 209, 139, 1.0)');
  grad.addColorStop(0.28, 'rgba(217, 173, 97, 0.55)');
  grad.addColorStop(0.65, 'rgba(185, 135, 63, 0.14)');
  grad.addColorStop(1, 'rgba(120, 80, 32, 0.0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
