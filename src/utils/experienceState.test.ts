/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldShowIntroSequence,
  isImageElementReady,
  AUDIO_CUE_SPECS,
  AUDIO_HIT_SPECS,
  SoundCueType,
  INTRO_DURATION_MS,
  INTRO_READY_FALLBACK_MS,
  INTRO_VIDEO_SRC,
  INTRO_EMBLEM_SRC,
} from './experienceState';
import {
  ALLOWED_PALETTE_HEX,
  OFFICIAL_PALETTE,
  createCelestialParticles,
  getStoryboardState,
} from './cinematicStoryboard';
import {
  CAMERA_INERTIA_EASE_NAME,
  createCinematicCameraController,
  scrollToPower3InOutEase,
} from './cinematicCameraController';

test('isImageElementReady detects warm-cached completed images accurately', () => {
  assert.equal(isImageElementReady(null), false);
  assert.equal(isImageElementReady({ complete: false, naturalWidth: 0 }), false);
  assert.equal(isImageElementReady({ complete: true, naturalWidth: 0 }), false);
  assert.equal(isImageElementReady({ complete: true, naturalWidth: 512 }), true);
  assert.equal(isImageElementReady({ complete: true }), true);
  assert.ok(INTRO_READY_FALLBACK_MS >= 250 && INTRO_READY_FALLBACK_MS <= 800);
});

test('intro references exact uploaded video and Virtuoso emblem assets', () => {
  assert.equal(
    INTRO_VIDEO_SRC,
    '/assets/aistudio/Man_walking_through_classical_co__1444f174_b605e61f.mp4'
  );
  assert.equal(INTRO_EMBLEM_SRC, '/assets/aistudio/image_1df213dd.png');
});

test('shouldShowIntroSequence plays once per browser session unless explicitly skipped or replayed', () => {
  assert.equal(
    shouldShowIntroSequence({
      search: '',
      prefersReducedMotion: false,
      hasSeenInSession: false,
    }),
    true
  );
  assert.equal(
    shouldShowIntroSequence({
      search: '',
      prefersReducedMotion: false,
      hasSeenInSession: true,
    }),
    false
  );
  assert.equal(
    shouldShowIntroSequence({
      search: '?replayIntro=1',
      prefersReducedMotion: false,
      hasSeenInSession: true,
    }),
    true
  );
  assert.equal(
    shouldShowIntroSequence({
      search: '?introPreviewStage=reveal',
      prefersReducedMotion: false,
      hasSeenInSession: true,
    }),
    true
  );
});

test('shouldShowIntroSequence still permits calm event identity overlay on unseen reduced-motion session', () => {
  assert.equal(
    shouldShowIntroSequence({
      search: '',
      prefersReducedMotion: true,
      hasSeenInSession: false,
    }),
    true
  );
  assert.equal(
    shouldShowIntroSequence({
      search: '',
      prefersReducedMotion: true,
      hasSeenInSession: true,
    }),
    false
  );
});

test('shouldShowIntroSequence skips when ?autostart=1 or ?skipIntro=1 query param is passed', () => {
  assert.equal(
    shouldShowIntroSequence({
      search: '?autostart=1',
      prefersReducedMotion: false,
      hasSeenInSession: false,
    }),
    false
  );
  assert.equal(
    shouldShowIntroSequence({
      search: '?foo=bar&skipIntro=1',
      prefersReducedMotion: false,
      hasSeenInSession: false,
    }),
    false
  );
});

test('INTRO_DURATION_MS accommodates all 5 cinematic scenes cleanly', () => {
  assert.ok(INTRO_DURATION_MS >= 10000 && INTRO_DURATION_MS <= 15000);
});

test('getStoryboardState progresses cleanly through all 5 Making of a Virtuoso scenes', () => {
  const s1 = getStoryboardState(900, INTRO_DURATION_MS);
  assert.equal(s1.scene, 1);
  assert.ok(s1.walkAmplitude > 0.8);
  assert.ok(s1.pose.characterZ > 6.5);
  assert.ok(s1.figureXNorm < -0.15);
  assert.equal(s1.profileBlend, 1);
  assert.equal(s1.revealActive, false);

  const s2 = getStoryboardState(INTRO_DURATION_MS * 0.32, INTRO_DURATION_MS);
  assert.equal(s2.scene, 2);
  assert.ok(s2.pose.characterZ < s1.pose.characterZ);
  assert.ok(s2.pose.walkPhase > s1.pose.walkPhase);
  assert.ok(s2.shaftIntensity > 0.4);
  assert.ok(s2.camera.position[0] < 0); // lateral tracking dolly shot
  assert.ok(s2.figureScale > s1.figureScale);

  const s3 = getStoryboardState(INTRO_DURATION_MS * 0.54, INTRO_DURATION_MS);
  assert.equal(s3.scene, 3);
  assert.equal(s3.pose.characterZ, 0);
  assert.equal(s3.pose.walkWeight, 0);
  assert.ok(s3.rimIntensity > 0.7);
  assert.ok(s3.postureConfidence > 0.8);

  const s4 = getStoryboardState(INTRO_DURATION_MS * 0.72, INTRO_DURATION_MS);
  assert.equal(s4.scene, 4);
  assert.ok(s4.sunElevation > 0.65);
  assert.ok(s4.camera.position[2] > s3.camera.position[2]); // hero pull-back shot
  assert.equal(s4.revealActive, false);

  const s5 = getStoryboardState(INTRO_DURATION_MS * 0.89, INTRO_DURATION_MS);
  assert.equal(s5.scene, 5);
  assert.equal(s5.revealActive, true);
  assert.ok(s5.revealOpacity > 0.8);
  assert.ok(s5.sceneVeil > 0.5);
});

test('computeBiomechanicalPose produces anatomical knee flexion, heel-off toe extension, opposite arm swing, and grounded halt', () => {
  const samples = [0.08, 0.14, 0.2, 0.26, 0.32, 0.38].map((p) =>
    getStoryboardState(INTRO_DURATION_MS * p, INTRO_DURATION_MS).pose
  );

  for (const pose of samples) {
    assert.ok(pose.leftKneeX > 0, 'Left knee flexion must remain anatomical (>= 0 posterior bend)');
    assert.ok(pose.rightKneeX > 0, 'Right knee flexion must remain anatomical (>= 0 posterior bend)');
    assert.ok(pose.leftElbowX < 0 && pose.rightElbowX < 0, 'Elbows must maintain natural forward flexion');
    assert.ok(pose.leftShoulderZ < 0 && pose.rightShoulderZ > 0, 'Arms abduct cleanly clear of broad lats');
  }

  // Over half a stride cycle, both stance heel-off toe extension and opposite arm-leg coupling occur
  const hasToeExtension = samples.some((p) => p.leftToeX < -0.1 || p.rightToeX < -0.1);
  assert.ok(hasToeExtension, 'Heel-off push-off engages forefoot toe extension');

  const hasPelvisShift = samples.some((p) => Math.abs(p.pelvisShiftX) > 0.005);
  assert.ok(hasPelvisShift, 'Weight transfer produces lateral pelvis shift');

  const haltPose = getStoryboardState(INTRO_DURATION_MS * 0.6, INTRO_DURATION_MS).pose;
  assert.equal(haltPose.walkWeight, 0);
  assert.equal(haltPose.leftToeX, 0);
  assert.equal(haltPose.rightToeX, 0);
  assert.equal(haltPose.pelvisShiftX, 0);
});

test('cinematicStoryboard strictly uses ONLY the 8 official Virtuoso colors', () => {
  assert.deepEqual(new Set(ALLOWED_PALETTE_HEX), new Set([
    '#200000',
    '#330205',
    '#4B0507',
    '#650C0C',
    '#785020',
    '#B9873F',
    '#D9AD61',
    '#F0D18B',
  ]));

  const particles = createCelestialParticles(40);
  assert.equal(particles.length, 40);
  for (const p of particles) {
    assert.ok(
      ALLOWED_PALETTE_HEX.includes(p.color as (typeof OFFICIAL_PALETTE)[keyof typeof OFFICIAL_PALETTE]),
      `Unexpected particle color ${p.color}`
    );
  }
});

test('AUDIO_CUE_SPECS enforces bounded gain and duration across all interaction and intro cues', () => {
  const cues: SoundCueType[] = [
    'introFanfare',
    'click',
    'navigate',
    'galleryOpen',
    'success',
    'error',
  ];
  for (const cue of cues) {
    const steps = AUDIO_CUE_SPECS[cue];
    assert.ok(steps.length >= 1, `${cue} should have at least 1 harmonic step`);
    for (const step of steps) {
      assert.ok(step.gain > 0 && step.gain <= 0.16, `${cue} gain must remain balanced (<= 0.16)`);
      assert.ok(step.durationSec > 0 && step.durationSec <= 2.0, `${cue} duration out of bounds`);
      assert.ok(step.frequency >= 100 && step.frequency <= 2200, `${cue} frequency out of range`);
    }
  }
});

test('AUDIO_HIT_SPECS defines bounded percussive impact hits for every cue', () => {
  const cues: SoundCueType[] = [
    'introFanfare',
    'click',
    'navigate',
    'galleryOpen',
    'success',
    'error',
  ];
  for (const cue of cues) {
    const hits = AUDIO_HIT_SPECS[cue];
    assert.ok(hits.length >= 1, `${cue} should have at least 1 percussive hit layer`);
    for (const hit of hits) {
      assert.ok(hit.gain > 0 && hit.gain <= 0.16, `${cue} hit gain out of bounds`);
      assert.ok(hit.durationSec > 0 && hit.durationSec <= 0.8, `${cue} hit duration out of bounds`);
      assert.ok(hit.startFreqHz >= 40 && hit.endFreqHz >= 40, `${cue} hit filter freq out of bounds`);
    }
  }
});

test('createCinematicCameraController drives GSAP dolly-in, tracking, orbit, and DOF focus rack cleanly across Acts 1-5', () => {
  const controller = createCinematicCameraController(INTRO_DURATION_MS);

  const act1Start = controller.seek(0, 9.2, 1);
  const act1End = controller.seek(INTRO_DURATION_MS * 0.2, 7.6, 2);
  assert.ok(act1End.position[2] < act1Start.position[2], 'Act 1 dollies forward down the corridor');
  assert.ok(act1End.fov < act1Start.fov, 'Act 1 gently tightens lens focal length');

  const act2Track = controller.seek(INTRO_DURATION_MS * 0.36, 3.2, 2);
  assert.ok(act2Track.position[0] < -1.5, 'Act 2 tracks laterally alongside the walking traveler');
  // In Act 2, DOF tracks distance between camera and protagonist closely
  const distToChar = Math.hypot(
    act2Track.position[0],
    act2Track.position[1] - 1.38,
    act2Track.position[2] - 3.2
  );
  assert.ok(
    Math.abs(act2Track.dofFocus - distToChar) < 0.25,
    'Act 2 optical DOF locks smoothly onto character distance'
  );
  assert.ok(act2Track.dofAperture > act1Start.dofAperture, 'Act 2 opens aperture for cinematic subject separation');

  const act3Orbit = controller.seek(INTRO_DURATION_MS * 0.62, 0, 3);
  assert.ok(act3Orbit.dofAperture >= 0.00038, 'Act 3 deepens shallow portrait DOF during transformation');

  const act4Horizon = controller.seek(INTRO_DURATION_MS * 0.81, 0, 4);
  assert.ok(act4Horizon.position[2] > act3Orbit.position[2], 'Act 4 executes slow hero dolly-out');
  assert.ok(act4Horizon.dofFocus > 20, 'Act 4 racks optical focus deep out to the Solstice horizon');

  const act5Velvet = controller.seek(INTRO_DURATION_MS * 0.96, 0, 5);
  assert.ok(act5Velvet.target[1] > act4Horizon.target[1], 'Act 5 tilts gracefully upward into velvet sky');
  assert.ok(act5Velvet.dofMaxBlur > act4Horizon.dofMaxBlur, 'Act 5 softens bokeh blur behind Act 5 emblem reveal');

  controller.dispose();
});

test('scrollToPower3InOutEase models GSAP power3.inOut camera inertia smoothly and monotonically', () => {
  assert.equal(CAMERA_INERTIA_EASE_NAME, 'virtuosoScrollCamera');
  assert.equal(scrollToPower3InOutEase(-0.2), 0);
  assert.equal(scrollToPower3InOutEase(0), 0);
  assert.ok(Math.abs(scrollToPower3InOutEase(0.5) - 0.5) < 1e-9);
  assert.equal(scrollToPower3InOutEase(1), 1);
  assert.equal(scrollToPower3InOutEase(1.4), 1);

  // Heavier initial acceleration damping than linear (p=0.15 -> eased < 0.04)
  assert.ok(scrollToPower3InOutEase(0.15) < 0.04);
  // Symmetric S-curve deceleration near end (p=0.85 -> eased > 0.96)
  assert.ok(scrollToPower3InOutEase(0.85) > 0.96);

  let prev = 0;
  for (let i = 1; i <= 20; i++) {
    const val = scrollToPower3InOutEase(i / 20);
    assert.ok(val >= prev, 'Inertia curve must remain strictly monotonic');
    prev = val;
  }
});
