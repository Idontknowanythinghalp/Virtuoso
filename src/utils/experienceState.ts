/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const SOUND_SESSION_KEY = 'virtuoso_2026_sound_pref';
export const INTRO_SESSION_KEY = 'virtuoso_2026_video_intro_v2';
export const INTRO_VIDEO_SRC =
  '/assets/aistudio/Man_walking_through_classical_co__1444f174_b605e61f.mp4';
export const INTRO_EMBLEM_SRC = '/assets/aistudio/image_1df213dd.png';
export const INTRO_DURATION_MS = 12800;
export const INTRO_READY_FALLBACK_MS = 450;
export const INTRO_FINAL_HOLD_MS = 850;
export const INTRO_REVEAL_DURATION_MS = 3400;

export function isImageElementReady(
  img: { complete: boolean; naturalWidth?: number } | null | undefined
): boolean {
  if (!img) return false;
  return Boolean(img.complete && (img.naturalWidth === undefined || img.naturalWidth > 0));
}

export function hasSeenIntroInSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(INTRO_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function markIntroSeenInSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(INTRO_SESSION_KEY, '1');
  } catch {
    // Ignore storage quota/privacy restrictions cleanly
  }
}

export interface IntroCheckOptions {
  search: string;
  prefersReducedMotion: boolean;
  hasSeenInSession?: boolean;
}

/**
 * Determines whether the cinematic opening sequence should play on initial session entry.
 * Plays once per browser session via sessionStorage, skips on ?autostart=1 / ?skipIntro=1,
 * and allows explicit ?replayIntro=1 / preview overrides for inspection.
 * Note: When prefersReducedMotion is true (and unseen), CinematicIntro skips video playback
 * and shows only the calm static Event Identity reveal.
 */
export function shouldShowIntroSequence({
  search,
  hasSeenInSession = false,
}: IntroCheckOptions): boolean {
  if (search) {
    const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
    if (params.get('autostart') === '1' || params.get('skipIntro') === '1') {
      return false;
    }
    if (
      params.get('replayIntro') === '1' ||
      params.has('introPreviewStage') ||
      params.has('introPreviewMs')
    ) {
      return true;
    }
  }

  return !hasSeenInSession;
}

export type SoundCueType =
  | 'introFanfare'
  | 'click'
  | 'navigate'
  | 'galleryOpen'
  | 'success'
  | 'error';

export interface ToneStepSpec {
  frequency: number;
  endFrequency?: number;
  durationSec: number;
  delaySec: number;
  gain: number;
  type: OscillatorType;
  filterCutoffHz?: number;
  detuneCents?: number;
  attackSec?: number;
  echoSend?: number;
}

export interface NoiseHitSpec {
  delaySec: number;
  durationSec: number;
  gain: number;
  filterType: BiquadFilterType;
  startFreqHz: number;
  endFreqHz: number;
  q?: number;
  echoSend?: number;
}

/**
 * "Heirs of the Solstice" Acoustic Identity (Dark, Regal, Heavy-Hitting):
 * Sculpted around deep cinematic sub-bass drum drops, dark D-minor/Phrygian power-fifth brass,
 * metallic bronze anvil hits, and crisp mechanical impact transients — zero sugary chimes.
 */
export const AUDIO_CUE_SPECS: Record<SoundCueType, ToneStepSpec[]> = {
  introFanfare: [
    // Beat 1 (0.00s): Massive Solstice Threshold Sub-Bass Taiko Drop
    {
      frequency: 138,
      endFrequency: 34,
      durationSec: 0.48,
      delaySec: 0,
      gain: 0.16,
      type: 'triangle',
      attackSec: 0.002,
      filterCutoffHz: 290,
      echoSend: 0.16,
    },
    {
      frequency: 112,
      endFrequency: 36,
      durationSec: 0.4,
      delaySec: 0,
      gain: 0.145,
      type: 'sine',
      attackSec: 0.002,
    },
    // Dark Royal Solstice Low Brass Horn Swell (D3 + A3 power fifth growl)
    {
      frequency: 146.83, // D3
      durationSec: 2.0,
      delaySec: 0.03,
      gain: 0.125,
      type: 'sawtooth',
      filterCutoffHz: 340,
      attackSec: 0.06,
      echoSend: 0.25,
    },
    {
      frequency: 146.83, // D3 detuned layer for massive cinematic brass width
      durationSec: 2.0,
      delaySec: 0.04,
      gain: 0.09,
      type: 'sawtooth',
      filterCutoffHz: 360,
      detuneCents: -9,
      attackSec: 0.08,
    },
    {
      frequency: 220.0, // A3 bare fifth authority
      durationSec: 1.9,
      delaySec: 0.08,
      gain: 0.1,
      type: 'sawtooth',
      filterCutoffHz: 460,
      detuneCents: 6,
      attackSec: 0.09,
      echoSend: 0.28,
    },
    // Beat 2 (0.42s): Mid-sequence Metallic War Strike + Dark Minor Pull
    {
      frequency: 155,
      endFrequency: 46,
      durationSec: 0.22,
      delaySec: 0.42,
      gain: 0.13,
      type: 'triangle',
      attackSec: 0.002,
    },
    {
      frequency: 349.23, // F4 dramatic minor third
      durationSec: 0.42,
      delaySec: 0.42,
      gain: 0.08,
      type: 'triangle',
      filterCutoffHz: 950,
      attackSec: 0.004,
      echoSend: 0.34,
    },
    // Beat 3 (0.66s): Rising Tension Strike (E4 -> Bb4)
    {
      frequency: 466.16, // Bb4 dark Phrygian royal tension
      endFrequency: 440.0, // slides ominously down into A4
      durationSec: 0.32,
      delaySec: 0.65,
      gain: 0.085,
      type: 'sawtooth',
      filterCutoffHz: 820,
      attackSec: 0.005,
      echoSend: 0.35,
    },
    // Beat 4 (0.90s): CLIMAX SOLSTICE ANVIL & THUNDER IMPACT ("HEIRS OF THE SOLSTICE")
    {
      frequency: 168,
      endFrequency: 35,
      durationSec: 0.52,
      delaySec: 0.9,
      gain: 0.16,
      type: 'triangle',
      attackSec: 0.002,
      filterCutoffHz: 340,
      echoSend: 0.22,
    },
    {
      frequency: 120,
      endFrequency: 38,
      durationSec: 0.44,
      delaySec: 0.9,
      gain: 0.145,
      type: 'sine',
      attackSec: 0.002,
    },
    // Heavy Bronze Power Fifth Impact Chord (D4 + A4 + D5, zero sweet 3rd/9th bells)
    {
      frequency: 293.66, // D4
      durationSec: 1.5,
      delaySec: 0.9,
      gain: 0.12,
      type: 'sawtooth',
      filterCutoffHz: 680,
      attackSec: 0.004,
      echoSend: 0.4,
    },
    {
      frequency: 440.0, // A4
      durationSec: 1.45,
      delaySec: 0.91,
      gain: 0.1,
      type: 'triangle',
      detuneCents: 5,
      attackSec: 0.004,
      echoSend: 0.42,
    },
    {
      frequency: 587.33, // D5 stark royal metallic gong octave
      durationSec: 1.4,
      delaySec: 0.91,
      gain: 0.08,
      type: 'sine',
      detuneCents: -4,
      attackSec: 0.003,
      echoSend: 0.44,
    },
  ],

  click: [
    // Hard tactical thump + crisp dark metallic snap (no sweet chime)
    {
      frequency: 235,
      endFrequency: 52,
      durationSec: 0.075,
      delaySec: 0,
      gain: 0.14,
      type: 'triangle',
      attackSec: 0.002,
    },
    {
      frequency: 980,
      endFrequency: 280,
      durationSec: 0.045,
      delaySec: 0,
      gain: 0.09,
      type: 'sawtooth',
      filterCutoffHz: 1400,
      attackSec: 0.002,
    },
  ],

  navigate: [
    // Deep cinematic arrival hit + dark D4 -> A4 bronze resonance
    {
      frequency: 162,
      endFrequency: 44,
      durationSec: 0.16,
      delaySec: 0.02,
      gain: 0.14,
      type: 'triangle',
      attackSec: 0.002,
      echoSend: 0.18,
    },
    {
      frequency: 293.66, // D4
      durationSec: 0.2,
      delaySec: 0.02,
      gain: 0.085,
      type: 'triangle',
      filterCutoffHz: 780,
      attackSec: 0.004,
      echoSend: 0.3,
    },
    {
      frequency: 440.0, // A4 power fifth
      durationSec: 0.3,
      delaySec: 0.09,
      gain: 0.08,
      type: 'sine',
      attackSec: 0.004,
      echoSend: 0.34,
    },
  ],

  galleryOpen: [
    // Heavy vault/shutter strike + brooding D-minor resonance
    {
      frequency: 195,
      endFrequency: 52,
      durationSec: 0.11,
      delaySec: 0,
      gain: 0.135,
      type: 'triangle',
      attackSec: 0.002,
    },
    {
      frequency: 293.66, // D4
      durationSec: 0.24,
      delaySec: 0.01,
      gain: 0.085,
      type: 'triangle',
      filterCutoffHz: 900,
      attackSec: 0.003,
      echoSend: 0.32,
    },
    {
      frequency: 349.23, // F4 minor gravity
      durationSec: 0.26,
      delaySec: 0.055,
      gain: 0.08,
      type: 'triangle',
      filterCutoffHz: 900,
      attackSec: 0.004,
      echoSend: 0.34,
    },
    {
      frequency: 440.0, // A4
      durationSec: 0.32,
      delaySec: 0.1,
      gain: 0.08,
      type: 'sine',
      attackSec: 0.004,
      echoSend: 0.38,
    },
  ],

  success: [
    // Authoritative double drum impact + commanding D-minor royal brass confirmation
    {
      frequency: 150,
      endFrequency: 42,
      durationSec: 0.16,
      delaySec: 0,
      gain: 0.145,
      type: 'triangle',
      attackSec: 0.002,
    },
    {
      frequency: 185,
      endFrequency: 44,
      durationSec: 0.24,
      delaySec: 0.16,
      gain: 0.15,
      type: 'triangle',
      attackSec: 0.002,
      echoSend: 0.2,
    },
    {
      frequency: 293.66, // D4
      durationSec: 0.26,
      delaySec: 0,
      gain: 0.095,
      type: 'sawtooth',
      filterCutoffHz: 650,
      attackSec: 0.004,
      echoSend: 0.28,
    },
    {
      frequency: 440.0, // A4
      durationSec: 0.32,
      delaySec: 0.08,
      gain: 0.095,
      type: 'triangle',
      filterCutoffHz: 950,
      attackSec: 0.004,
      echoSend: 0.32,
    },
    {
      frequency: 587.33, // D5 commanding octave lock
      durationSec: 0.55,
      delaySec: 0.16,
      gain: 0.105,
      type: 'sawtooth',
      filterCutoffHz: 850,
      detuneCents: 4,
      attackSec: 0.004,
      echoSend: 0.4,
    },
  ],

  error: [
    // Heavy iron gavel slam + sharp metallic warning drop
    {
      frequency: 180,
      endFrequency: 44,
      durationSec: 0.18,
      delaySec: 0,
      gain: 0.15,
      type: 'triangle',
      attackSec: 0.002,
    },
    {
      frequency: 311.13, // Eb4 tense half-step
      endFrequency: 261.63,
      durationSec: 0.14,
      delaySec: 0.01,
      gain: 0.11,
      type: 'sawtooth',
      filterCutoffHz: 750,
      attackSec: 0.003,
    },
    {
      frequency: 233.08, // Bb3
      endFrequency: 185.0,
      durationSec: 0.22,
      delaySec: 0.13,
      gain: 0.115,
      type: 'sawtooth',
      filterCutoffHz: 620,
      attackSec: 0.003,
      echoSend: 0.18,
    },
  ],
};

/**
 * Heavy filtered-noise percussion transients (taiko crack, steel anvil hit, dark air swoosh)
 * synced directly onto tonal sub-drops for tactile physical punch.
 */
export const AUDIO_HIT_SPECS: Record<SoundCueType, NoiseHitSpec[]> = {
  introFanfare: [
    // Beat 1: Thunderous taiko/timpani chest slam
    {
      delaySec: 0,
      durationSec: 0.28,
      gain: 0.15,
      filterType: 'lowpass',
      startFreqHz: 2400,
      endFreqHz: 110,
      q: 2.0,
      echoSend: 0.25,
    },
    // Dark smoky atmospheric riser into climax hit
    {
      delaySec: 0.42,
      durationSec: 0.48,
      gain: 0.06,
      filterType: 'bandpass',
      startFreqHz: 320,
      endFreqHz: 1900,
      q: 1.4,
      echoSend: 0.3,
    },
    // Beat 2: Sharp mid-hit crack
    {
      delaySec: 0.42,
      durationSec: 0.12,
      gain: 0.11,
      filterType: 'bandpass',
      startFreqHz: 1800,
      endFreqHz: 420,
      q: 1.8,
      echoSend: 0.26,
    },
    // Beat 4: Massive Solstice Anvil & Thunder Slam
    {
      delaySec: 0.9,
      durationSec: 0.32,
      gain: 0.155,
      filterType: 'lowpass',
      startFreqHz: 3200,
      endFreqHz: 130,
      q: 2.2,
      echoSend: 0.36,
    },
    // Metallic steel/sword transient edge on climax
    {
      delaySec: 0.9,
      durationSec: 0.16,
      gain: 0.075,
      filterType: 'bandpass',
      startFreqHz: 3400,
      endFreqHz: 1400,
      q: 2.4,
      echoSend: 0.38,
    },
  ],
  click: [
    // Crisp dark mechanical bolt-strike
    {
      delaySec: 0,
      durationSec: 0.036,
      gain: 0.115,
      filterType: 'bandpass',
      startFreqHz: 1900,
      endFreqHz: 520,
      q: 1.7,
    },
  ],
  navigate: [
    // Dark dramatic transition whoosh crashing into thud
    {
      delaySec: 0,
      durationSec: 0.16,
      gain: 0.075,
      filterType: 'bandpass',
      startFreqHz: 280,
      endFreqHz: 1500,
      q: 1.4,
      echoSend: 0.22,
    },
    {
      delaySec: 0.02,
      durationSec: 0.11,
      gain: 0.1,
      filterType: 'lowpass',
      startFreqHz: 1600,
      endFreqHz: 140,
      q: 1.8,
    },
  ],
  galleryOpen: [
    // Heavy vault shutter strike
    {
      delaySec: 0,
      durationSec: 0.055,
      gain: 0.12,
      filterType: 'bandpass',
      startFreqHz: 2400,
      endFreqHz: 680,
      q: 1.9,
      echoSend: 0.22,
    },
  ],
  success: [
    // Double commanding drum strike
    {
      delaySec: 0,
      durationSec: 0.1,
      gain: 0.115,
      filterType: 'lowpass',
      startFreqHz: 2000,
      endFreqHz: 170,
      q: 1.8,
      echoSend: 0.2,
    },
    {
      delaySec: 0.16,
      durationSec: 0.16,
      gain: 0.13,
      filterType: 'lowpass',
      startFreqHz: 2600,
      endFreqHz: 190,
      q: 2.0,
      echoSend: 0.3,
    },
  ],
  error: [
    // Heavy iron gavel slam
    {
      delaySec: 0,
      durationSec: 0.12,
      gain: 0.125,
      filterType: 'lowpass',
      startFreqHz: 1100,
      endFreqHz: 130,
      q: 1.9,
    },
  ],
};
