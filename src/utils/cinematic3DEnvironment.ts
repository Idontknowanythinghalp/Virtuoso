/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { OFFICIAL_PALETTE, StoryboardState } from './cinematicStoryboard';
import { MarbleTextureSet, createDustSpriteTexture } from './cinematic3DTextures';

export interface CinematicEnvironmentRig {
  group: THREE.Group;
  update: (state: StoryboardState, elapsedSec: number) => void;
  dispose: () => void;
}

function createArchRibGeometry(spanHalfWidth: number, springY: number, archHeight: number): THREE.ExtrudeGeometry {
  const outerR = spanHalfWidth + 0.55;
  const innerR = spanHalfWidth;
  const shape = new THREE.Shape();

  // Left pier base up to arch spring, across grand semi-circular vault rib, down right pier
  shape.moveTo(-outerR, 0);
  shape.lineTo(-outerR, springY);
  shape.absarc(0, springY, outerR, Math.PI, 0, true);
  shape.lineTo(outerR, 0);
  shape.lineTo(innerR, 0);
  shape.lineTo(innerR, springY);
  shape.absarc(0, springY, innerR, 0, Math.PI, false);
  shape.lineTo(-innerR, 0);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.85,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 2,
    curveSegments: 32,
  });
  // Center extrusion depth along Z
  geo.translate(0, 0, -0.425);
  // Subtle proportional stretch if vault height differs from circular
  if (archHeight > 0 && Math.abs(archHeight - innerR) > 0.01) {
    geo.scale(1, (springY + archHeight) / (springY + innerR), 1);
  }
  geo.computeVertexNormals();
  return geo;
}

function createMountainRidgeMesh(
  width: number,
  maxPeak: number,
  seedOffset: number,
  colorHex: string,
  zPos: number
): THREE.Mesh {
  const segs = 96;
  const shape = new THREE.Shape();
  shape.moveTo(-width * 0.5, -4);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = (t - 0.5) * width;
    // Leave a natural central valley pass directly behind the Sanctuary portal so sunrise peaks cleanly
    const valleyDip = 1.0 - 0.52 * Math.exp(-Math.pow(x / 18.0, 2));
    const ridge1 = Math.sin(t * 14.0 + seedOffset) * 0.5 + 0.5;
    const ridge2 = Math.sin(t * 31.0 + seedOffset * 2.1) * 0.35 + 0.35;
    const ridge3 = Math.cos(t * 67.0 + seedOffset * 0.7) * 0.18 + 0.18;
    const h = (ridge1 * 0.55 + ridge2 * 0.3 + ridge3 * 0.15) * maxPeak * valleyDip;
    shape.lineTo(x, h);
  }
  shape.lineTo(width * 0.5, -4);
  shape.closePath();

  const geo = new THREE.ShapeGeometry(shape);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(colorHex),
    fog: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, -0.6, zPos);
  return mesh;
}

function createVolumetricBeamMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0.5 },
      uColorCore: { value: new THREE.Color(OFFICIAL_PALETTE.lightGold) },
      uColorEdge: { value: new THREE.Color(OFFICIAL_PALETTE.antiqueGold) },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;

      void main() {
        vUv = uv;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vNormalView = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uIntensity;
      uniform vec3 uColorCore;
      uniform vec3 uColorEdge;
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      void main() {
        // Soft edge falloff so volumetric shaft never looks like a hard geometric cone
        float edgeFade = pow(abs(dot(normalize(vNormalView), normalize(vViewDir))), 2.1);
        // Vertical attenuation along beam length (uv.y = 1 near window source, 0 near floor)
        float topFade = smoothstep(1.0, 0.72, vUv.y);
        float bottomFade = smoothstep(0.0, 0.42, vUv.y);
        float longitudinal = topFade * bottomFade;

        // Subtle drifting atmospheric haze streaks
        float haze = 0.75 + 0.25 * noise(vec2(vUv.x * 7.0 + uTime * 0.08, vUv.y * 2.5 - uTime * 0.05));

        float alpha = edgeFade * longitudinal * haze * uIntensity * 0.16;
        vec3 col = mix(uColorEdge, uColorCore, edgeFade * 0.75);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

function createSolsticeSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: new THREE.Vector3(0, 0.04, -1).normalize() },
      uSunWarmth: { value: 0.4 },
      uDarkMidnight: { value: new THREE.Color(OFFICIAL_PALETTE.midnightBurgundy) },
      uDeepWine: { value: new THREE.Color(OFFICIAL_PALETTE.deepWineRed) },
      uCrimson: { value: new THREE.Color(OFFICIAL_PALETTE.crimsonWine) },
      uDarkBronze: { value: new THREE.Color(OFFICIAL_PALETTE.darkBronze) },
      uAntiqueGold: { value: new THREE.Color(OFFICIAL_PALETTE.antiqueGold) },
      uChampagne: { value: new THREE.Color(OFFICIAL_PALETTE.champagneGold) },
      uLightGold: { value: new THREE.Color(OFFICIAL_PALETTE.lightGold) },
    },
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform float uSunWarmth;
      uniform vec3 uDarkMidnight;
      uniform vec3 uDeepWine;
      uniform vec3 uCrimson;
      uniform vec3 uDarkBronze;
      uniform vec3 uAntiqueGold;
      uniform vec3 uChampagne;
      uniform vec3 uLightGold;
      varying vec3 vWorldDir;

      void main() {
        vec3 dir = normalize(vWorldDir);
        float elev = clamp(dir.y, -0.2, 1.0);
        float horizonBand = exp(-max(0.0, elev) * 9.0);

        // Luxury twilight palette: deep Midnight Burgundy zenith -> Royal/Crimson horizon -> subtle Dark Bronze glow
        vec3 skyCol = mix(uDeepWine, uDarkMidnight, smoothstep(0.04, 0.42, elev));
        skyCol = mix(skyCol, uCrimson, horizonBand * (0.28 + 0.34 * uSunWarmth));
        skyCol = mix(skyCol, uDarkBronze, pow(horizonBand, 2.4) * uSunWarmth * 0.58);

        // Atmospheric Mie solar scatter & crisp smaller solstice sun disk cresting the mountain pass
        float sunDot = max(0.0, dot(dir, normalize(uSunDir)));
        float wideScatter = pow(sunDot, 12.0) * (0.25 + 0.5 * uSunWarmth);
        float innerCorona = pow(sunDot, 95.0) * uSunWarmth;
        float solarDisk = smoothstep(0.9987, 0.99945, sunDot) * uSunWarmth;

        skyCol += uAntiqueGold * wideScatter * 0.34;
        skyCol += uChampagne * innerCorona * 0.72;
        skyCol = mix(skyCol, uLightGold, clamp(solarDisk, 0.0, 1.0));

        gl_FragColor = vec4(skyCol, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  });
}

export function createCinematicEnvironment(
  floorTextures: MarbleTextureSet,
  columnTextures: MarbleTextureSet,
  isSoftwareGl: boolean
): CinematicEnvironmentRig {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  // 1. Atmospheric Solstice Sky Dome
  const skyGeo = new THREE.SphereGeometry(210, 40, 24);
  const skyMat = createSolsticeSkyMaterial();
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  group.add(skyMesh);
  disposables.push(skyGeo, skyMat);

  // 2. Layered Distant Horizon Mountain Silhouettes (visible through open Palace Portal)
  const ridgeFar = createMountainRidgeMesh(260, 18, 1.4, OFFICIAL_PALETTE.royalBurgundy, -145);
  const ridgeMid = createMountainRidgeMesh(220, 13, 3.8, OFFICIAL_PALETTE.deepWineRed, -108);
  const ridgeNear = createMountainRidgeMesh(180, 8.5, 6.2, OFFICIAL_PALETTE.midnightBurgundy, -74);
  group.add(ridgeFar, ridgeMid, ridgeNear);
  disposables.push(
    ridgeFar.geometry,
    ridgeFar.material as THREE.Material,
    ridgeMid.geometry,
    ridgeMid.material as THREE.Material,
    ridgeNear.geometry,
    ridgeNear.material as THREE.Material
  );

  // 3. Polished Obsidian-Burgundy Marble Corridor Floor (y = 0)
  const floorGeo = new THREE.PlaneGeometry(16, 58, 1, 1);
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: floorTextures.map,
    roughnessMap: floorTextures.roughnessMap,
    bumpMap: floorTextures.bumpMap,
    bumpScale: 0.012,
    roughness: 0.42,
    metalness: 0.06,
    clearcoat: 0.42,
    clearcoatRoughness: 0.24,
    envMapIntensity: 0.48,
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.position.set(0, 0, -6);
  floorMesh.receiveShadow = true;
  group.add(floorMesh);
  disposables.push(floorGeo, floorMat);

  // Architectural brushed dark-bronze longitudinal runner inlays framing the Sanctuary processional aisle
  const runnerGeo = new THREE.PlaneGeometry(0.06, 44);
  runnerGeo.rotateX(-Math.PI / 2);
  const bronzeMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(OFFICIAL_PALETTE.darkBronze),
    roughness: 0.32,
    metalness: 0.86,
    envMapIntensity: 0.72,
  });
  for (const rx of [-1.45, 1.45]) {
    const runner = new THREE.Mesh(runnerGeo, bronzeMat);
    runner.position.set(rx, 0.015, -5);
    runner.receiveShadow = true;
    group.add(runner);
  }
  disposables.push(runnerGeo, bronzeMat);

  // Architectural Masonry Material (Deep Shadowed Burgundy Stone)
  const stoneWallMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(OFFICIAL_PALETTE.deepWineRed),
    roughness: 0.82,
    metalness: 0.04,
    bumpMap: floorTextures.bumpMap,
    bumpScale: 0.02,
    envMapIntensity: 0.22,
  });
  const columnMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: columnTextures.map,
    roughnessMap: columnTextures.roughnessMap,
    bumpMap: columnTextures.bumpMap,
    bumpScale: 0.036,
    roughness: 0.72,
    metalness: 0.06,
    envMapIntensity: 0.26,
  });
  disposables.push(stoneWallMat, columnMat);

  // Raised Side Plinth Walkways (left & right colonnade decks at y = 0.14)
  const plinthGeo = new THREE.BoxGeometry(4.2, 0.28, 54);
  disposables.push(plinthGeo);
  for (const side of [-1, 1]) {
    const plinth = new THREE.Mesh(plinthGeo, stoneWallMat);
    plinth.position.set(side * 5.7, 0.14, -5);
    plinth.receiveShadow = true;
    plinth.castShadow = true;
    group.add(plinth);
  }

  // 4. Composite Multi-Part Monumental Fluted Palace Columns + Arched Bays
  const colPlinthGeo = new THREE.BoxGeometry(1.28, 0.52, 1.28);
  const colShaftGeo = new THREE.CylinderGeometry(0.42, 0.5, 6.8, 24, 1);
  const colCollarGeo = new THREE.TorusGeometry(0.45, 0.055, 10, 24);
  colCollarGeo.rotateX(Math.PI / 2);
  const colCapitalGeo = new THREE.BoxGeometry(1.36, 0.44, 1.36);
  const archRibGeo = createArchRibGeometry(4.35, 7.3, 3.8);
  const ceilingVaultGeo = new THREE.PlaneGeometry(14, 54);
  ceilingVaultGeo.rotateX(Math.PI / 2);

  disposables.push(colPlinthGeo, colShaftGeo, colCollarGeo, colCapitalGeo, archRibGeo, ceilingVaultGeo);

  const columnZPositions = [12, 4, -4, -12, -20, -28];

  for (const zPos of columnZPositions) {
    for (const side of [-1, 1]) {
      const colGroup = new THREE.Group();
      colGroup.position.set(side * 4.45, 0.28, zPos);

      const base = new THREE.Mesh(colPlinthGeo, stoneWallMat);
      base.position.y = 0.26;
      base.castShadow = true;
      base.receiveShadow = true;

      const shaft = new THREE.Mesh(colShaftGeo, columnMat);
      shaft.position.y = 3.92;
      shaft.castShadow = true;
      shaft.receiveShadow = true;

      const lowerCollar = new THREE.Mesh(colCollarGeo, bronzeMat);
      lowerCollar.position.y = 0.62;

      const upperCollar = new THREE.Mesh(colCollarGeo, bronzeMat);
      upperCollar.position.y = 7.22;

      const capital = new THREE.Mesh(colCapitalGeo, stoneWallMat);
      capital.position.y = 7.52;
      capital.castShadow = true;

      colGroup.add(base, shaft, lowerCollar, upperCollar, capital);
      group.add(colGroup);
    }

    // Transverse Overhead Stone Arch Rib spanning the hall at each column bay
    const archMesh = new THREE.Mesh(archRibGeo, stoneWallMat);
    archMesh.position.set(0, 0.28, zPos);
    archMesh.castShadow = true;
    archMesh.receiveShadow = true;
    group.add(archMesh);
  }

  // Deep Coffered Vault Ceiling overhead (keeps sky strictly framed out the far horizon portal!)
  const ceilingMesh = new THREE.Mesh(ceilingVaultGeo, stoneWallMat);
  ceilingMesh.position.set(0, 11.45, -5);
  group.add(ceilingMesh);

  // Outer Clerestory Side Pier Walls framing sunlit window bays (with open horizontal gaps for light beams)
  const pierWallGeo = new THREE.BoxGeometry(0.9, 11.2, 3.8);
  const spandrelGeo = new THREE.BoxGeometry(0.9, 3.4, 8.2);
  disposables.push(pierWallGeo, spandrelGeo);

  for (const zPos of columnZPositions) {
    for (const side of [-1, 1]) {
      const pier = new THREE.Mesh(pierWallGeo, stoneWallMat);
      pier.position.set(side * 7.2, 5.6, zPos);
      pier.castShadow = true;
      pier.receiveShadow = true;
      group.add(pier);
    }
  }
  // Upper lintel walls above window bays so sunlight streams diagonally through tall apertures
  for (let i = 0; i < columnZPositions.length - 1; i++) {
    const midZ = (columnZPositions[i] + columnZPositions[i + 1]) * 0.5;
    for (const side of [-1, 1]) {
      const spandrel = new THREE.Mesh(spandrelGeo, stoneWallMat);
      spandrel.position.set(side * 7.2, 9.7, midZ);
      group.add(spandrel);
    }
  }

  // Grand Portal Side Bastion Framing at z = -29 (framing the Solstice sunrise landscape cleanly)
  const bastionGeo = new THREE.BoxGeometry(4.4, 11.5, 1.8);
  disposables.push(bastionGeo);
  for (const side of [-1, 1]) {
    const bastion = new THREE.Mesh(bastionGeo, stoneWallMat);
    bastion.position.set(side * 6.4, 5.75, -29.2);
    bastion.castShadow = true;
    bastion.receiveShadow = true;
    group.add(bastion);
  }

  // 5. Volumetric Sunbeam Shafts slanting down across the corridor
  const beamMat = createVolumetricBeamMaterial();
  disposables.push(beamMat);
  const sideBeamGeo = new THREE.CylinderGeometry(1.1, 2.75, 15.5, 24, 1, true);
  disposables.push(sideBeamGeo);

  const beamZPositions = [8.0, 0.0, -8.0, -16.0];
  for (const bz of beamZPositions) {
    const beam = new THREE.Mesh(sideBeamGeo, beamMat);
    beam.position.set(2.3, 4.1, bz);
    beam.rotation.z = 0.62; // diagonal slant from right clerestory window down to center-left floor
    beam.rotation.x = 0.14;
    group.add(beam);
  }

  // Sweeping Horizon Dawn Portal Beam flooding forward along corridor center
  const portalBeamGeo = new THREE.CylinderGeometry(2.6, 5.2, 26, 28, 1, true);
  portalBeamGeo.rotateX(Math.PI / 2);
  disposables.push(portalBeamGeo);
  const portalBeam = new THREE.Mesh(portalBeamGeo, beamMat);
  portalBeam.position.set(0, 2.6, -15);
  group.add(portalBeam);

  // 6. Subtle Floating Sun-Lit Dust Motes (visible softly within the warm light)
  const dustCount = 240;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(dustCount * 3);
  const dustSeed = new Float32Array(dustCount);

  for (let i = 0; i < dustCount; i++) {
    const r1 = Math.sin(i * 19.31 + 1.1) * 43758.5453;
    const r2 = Math.sin(i * 47.73 + 2.3) * 43758.5453;
    const r3 = Math.sin(i * 89.17 + 3.7) * 43758.5453;
    const u1 = r1 - Math.floor(r1);
    const u2 = r2 - Math.floor(r2);
    const u3 = r3 - Math.floor(r3);

    dustPos[i * 3] = (u1 - 0.5) * 6.8;
    dustPos[i * 3 + 1] = 0.25 + u2 * 4.4;
    dustPos[i * 3 + 2] = -22 + u3 * 34;
    dustSeed[i] = u1 * Math.PI * 2;
  }

  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(dustSeed, 1));
  const dustTex = createDustSpriteTexture();
  const dustMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0.45 },
      uMap: { value: dustTex },
      uPixelRatio: { value: 1 },
    },
    vertexShader: `
      attribute float aSeed;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vTwinkle;

      void main() {
        vec3 p = position;
        p.x += sin(uTime * 0.35 + aSeed) * 0.24;
        p.y += mod(uTime * 0.08 + aSeed, 1.0) * 0.32 - 0.16;
        p.z += cos(uTime * 0.28 + aSeed * 1.4) * 0.2;

        vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
        float dist = max(1.0, -mvPos.z);
        gl_PointSize = clamp((16.0 * uPixelRatio) / dist, 1.2, 5.5);
        vTwinkle = 0.45 + 0.55 * sin(uTime * 1.2 + aSeed * 3.0);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform float uOpacity;
      varying float vTwinkle;

      void main() {
        vec4 tex = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(tex.rgb, tex.a * uOpacity * vTwinkle);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const dustPoints = new THREE.Points(dustGeo, dustMat);
  dustPoints.frustumCulled = false;
  group.add(dustPoints);
  disposables.push(dustGeo, dustTex, dustMat);

  // 7. Cinema Three-Point Lighting Rig (Moody Deep Burgundy Contrast + Champagne Gold Rim)
  const hemiLight = new THREE.HemisphereLight(
    new THREE.Color(OFFICIAL_PALETTE.royalBurgundy),
    new THREE.Color(OFFICIAL_PALETTE.midnightBurgundy),
    0.36
  );
  group.add(hemiLight);

  // Primary Horizon Solstice Sunlight (casts long, dramatic character shadows down the marble aisle)
  const sunKeyLight = new THREE.DirectionalLight(new THREE.Color(OFFICIAL_PALETTE.champagneGold), 2.1);
  sunKeyLight.position.set(1.2, 3.8, -32);
  sunKeyLight.target.position.set(0, 0.5, 5);
  group.add(sunKeyLight.target);
  if (!isSoftwareGl) {
    sunKeyLight.castShadow = true;
    sunKeyLight.shadow.mapSize.width = 2048;
    sunKeyLight.shadow.mapSize.height = 2048;
    sunKeyLight.shadow.camera.near = 2;
    sunKeyLight.shadow.camera.far = 52;
    sunKeyLight.shadow.camera.left = -10;
    sunKeyLight.shadow.camera.right = 10;
    sunKeyLight.shadow.camera.top = 10;
    sunKeyLight.shadow.camera.bottom = -10;
    sunKeyLight.shadow.bias = -0.0005;
    sunKeyLight.shadow.normalBias = 0.025;
  }
  group.add(sunKeyLight);

  // Grazing Clerestory Side Key carving sculptural folds across the protagonist's wool overcoat
  const sideShaftLight = new THREE.DirectionalLight(new THREE.Color(OFFICIAL_PALETTE.antiqueGold), 1.1);
  sideShaftLight.position.set(8.5, 6.8, 3.5);
  sideShaftLight.target.position.set(-1, 1, 2);
  group.add(sideShaftLight.target, sideShaftLight);

  // Dramatic Silhouette Rim Backlight centered behind Sanctuary threshold
  const rimLight = new THREE.SpotLight(
    new THREE.Color(OFFICIAL_PALETTE.lightGold),
    34,
    24,
    Math.PI * 0.24,
    0.9,
    1.6
  );
  rimLight.position.set(0, 4.4, -8.5);
  rimLight.target.position.set(0, 1.2, 0.5);
  group.add(rimLight, rimLight.target);

  // 4 Subtle Sconce Fill PointLights grazing fluted columns along the colonnade
  const sconceZ = [8, -4, -16, -24];
  for (let i = 0; i < sconceZ.length; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const sconce = new THREE.PointLight(new THREE.Color(OFFICIAL_PALETTE.antiqueGold), 1.4, 9, 2);
    sconce.position.set(side * 3.6, 2.8, sconceZ[i]);
    group.add(sconce);
  }

  return {
    group,
    update: (state: StoryboardState, elapsedSec: number) => {
      // Update Volumetric Sunbeams
      beamMat.uniforms.uTime.value = elapsedSec;
      beamMat.uniforms.uIntensity.value = state.shaftIntensity * (1 - state.sceneVeil * 0.85);

      // Update Dust Motes
      dustMat.uniforms.uTime.value = elapsedSec;
      dustMat.uniforms.uOpacity.value = 0.24 + 0.32 * state.shaftIntensity * (1 - state.sceneVeil);

      // Update Rising Solstice Sky Sun Direction & Warmth
      const sunY = -0.025 + 0.13 * state.sunElevation;
      skyMat.uniforms.uSunDir.value.set(0, sunY, -1).normalize();
      skyMat.uniforms.uSunWarmth.value = 0.2 + 0.82 * Math.max(state.horizonGlow * 0.45, state.sunElevation);

      // Modulate Cinema Lights smoothly across the 5 Acts
      sunKeyLight.position.set(0.6, 2.4 + 3.0 * state.sunElevation, -32);
      sunKeyLight.intensity = 0.95 + 2.4 * Math.max(state.horizonGlow * 0.4, state.sunElevation);

      sideShaftLight.intensity = 0.72 + 0.78 * state.shaftIntensity;

      // Keep Rim SpotLight locked smoothly onto the walking/standing traveler
      rimLight.target.position.set(0, 1.2, state.pose.characterZ);
      rimLight.intensity = 14 + 38 * state.rimIntensity;
    },
    dispose: () => {
      for (const item of disposables) {
        item.dispose();
      }
    },
  };
}
