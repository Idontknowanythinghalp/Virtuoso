/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AUDIO_CUE_SPECS, AUDIO_HIT_SPECS, SoundCueType } from './experienceState';

interface EngineGraph {
  ctx: AudioContext;
  destination: AudioNode;
  echoInput: AudioNode | null;
  noiseBuffer: AudioBuffer | null;
}

/**
 * Studio-grade, dependency-free Web Audio API engine tailored for "Heirs of the Solstice":
 * pairs sub-bass impact drops and filtered noise percussion hits with dark royal brass swells
 * through a master dynamics compressor and warm concert-hall echo bus.
 */
class VirtuosoSoundEngine {
  private ctx: AudioContext | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private echoDelay: DelayNode | null = null;
  private echoFeedback: GainNode | null = null;
  private echoDamping: BiquadFilterNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private ensureContext(): EngineGraph | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioCtx();

      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-14, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(16, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(4.5, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.16, this.ctx.currentTime);
      this.compressor.connect(this.ctx.destination);

      // Warm dark hall echo bus for cinematic depth on hits & brass
      this.echoDelay = this.ctx.createDelay(1.0);
      this.echoDelay.delayTime.setValueAtTime(0.18, this.ctx.currentTime);

      this.echoDamping = this.ctx.createBiquadFilter();
      this.echoDamping.type = 'lowpass';
      this.echoDamping.frequency.setValueAtTime(1750, this.ctx.currentTime);

      this.echoFeedback = this.ctx.createGain();
      this.echoFeedback.gain.setValueAtTime(0.32, this.ctx.currentTime);

      this.echoDelay.connect(this.echoDamping);
      this.echoDamping.connect(this.echoFeedback);
      this.echoFeedback.connect(this.echoDelay);
      this.echoDamping.connect(this.compressor);

      // Pre-generate 1s white noise buffer for zero-latency percussive hits
      const length = Math.max(1, Math.floor(this.ctx.sampleRate * 1.0));
      this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }

    return {
      ctx: this.ctx,
      destination: this.compressor ?? this.ctx.destination,
      echoInput: this.echoDelay,
      noiseBuffer: this.noiseBuffer,
    };
  }

  public isRunning(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  public async unlock(): Promise<boolean> {
    const setup = this.ensureContext();
    if (!setup) return false;
    try {
      if (setup.ctx.state === 'suspended') {
        await setup.ctx.resume();
      }
      return setup.ctx.state === 'running';
    } catch {
      return false;
    }
  }

  public playCue(cue: SoundCueType): void {
    const setup = this.ensureContext();
    if (!setup) return;

    const { ctx, destination, echoInput, noiseBuffer } = setup;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // 1. Trigger percussive noise strike transients ("hitting" punch + dark air)
    const hitSpecs = AUDIO_HIT_SPECS[cue];
    if (hitSpecs && noiseBuffer) {
      for (const hit of hitSpecs) {
        try {
          const source = ctx.createBufferSource();
          source.buffer = noiseBuffer;

          const filter = ctx.createBiquadFilter();
          filter.type = hit.filterType;
          const startAt = now + hit.delaySec;
          const endAt = startAt + hit.durationSec;
          filter.frequency.setValueAtTime(Math.max(40, hit.startFreqHz), startAt);
          filter.frequency.exponentialRampToValueAtTime(Math.max(40, hit.endFreqHz), endAt);
          if (hit.q) {
            filter.Q.setValueAtTime(hit.q, startAt);
          }

          const gainNode = ctx.createGain();
          gainNode.gain.setValueAtTime(0.0001, startAt);
          gainNode.gain.linearRampToValueAtTime(hit.gain, startAt + 0.003);
          gainNode.gain.exponentialRampToValueAtTime(0.0001, endAt);

          source.connect(filter);
          filter.connect(gainNode);
          gainNode.connect(destination);

          let echoSendGain: GainNode | null = null;
          if (echoInput && hit.echoSend && hit.echoSend > 0) {
            echoSendGain = ctx.createGain();
            echoSendGain.gain.setValueAtTime(hit.echoSend, startAt);
            gainNode.connect(echoSendGain);
            echoSendGain.connect(echoInput);
          }

          source.onended = () => {
            source.disconnect();
            filter.disconnect();
            gainNode.disconnect();
            if (echoSendGain) echoSendGain.disconnect();
          };

          source.start(startAt);
          source.stop(endAt + 0.02);
        } catch {
          // Ignore transient Web Audio API errors in restricted environments
        }
      }
    }

    // 2. Trigger tonal sub-drops & dark Solstice brass/metallic layers
    const steps = AUDIO_CUE_SPECS[cue];
    if (!steps || steps.length === 0) return;

    for (const step of steps) {
      try {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        const startAt = now + step.delaySec;
        const endAt = startAt + step.durationSec;

        osc.type = step.type;
        osc.frequency.setValueAtTime(step.frequency, startAt);
        if (step.detuneCents) {
          osc.detune.setValueAtTime(step.detuneCents, startAt);
        }
        if (step.endFrequency && step.endFrequency !== step.frequency) {
          osc.frequency.exponentialRampToValueAtTime(
            Math.max(30, step.endFrequency),
            endAt
          );
        }

        const attackTime = Math.min(step.attackSec ?? 0.012, step.durationSec * 0.25);
        gainNode.gain.setValueAtTime(0.0001, startAt);
        gainNode.gain.linearRampToValueAtTime(step.gain, startAt + attackTime);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, endAt);

        let echoSendGain: GainNode | null = null;
        if (echoInput && step.echoSend && step.echoSend > 0) {
          echoSendGain = ctx.createGain();
          echoSendGain.gain.setValueAtTime(step.echoSend, startAt);
          gainNode.connect(echoSendGain);
          echoSendGain.connect(echoInput);
        }

        if (step.filterCutoffHz) {
          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(step.filterCutoffHz, startAt);
          if (cue === 'introFanfare' && step.type === 'sawtooth') {
            filter.frequency.exponentialRampToValueAtTime(
              step.filterCutoffHz * 2.1,
              endAt
            );
          }
          osc.connect(filter);
          filter.connect(gainNode);
          osc.onended = () => {
            osc.disconnect();
            filter.disconnect();
            gainNode.disconnect();
            if (echoSendGain) echoSendGain.disconnect();
          };
        } else {
          osc.connect(gainNode);
          osc.onended = () => {
            osc.disconnect();
            gainNode.disconnect();
            if (echoSendGain) echoSendGain.disconnect();
          };
        }

        gainNode.connect(destination);
        osc.start(startAt);
        osc.stop(endAt + 0.02);
      } catch {
        // Ignore transient Web Audio API errors in restricted environments
      }
    }
  }

  public dispose(): void {
    const nodes = [this.echoDelay, this.echoDamping, this.echoFeedback, this.compressor];
    for (const node of nodes) {
      if (node) {
        try {
          node.disconnect();
        } catch {
          // ignore
        }
      }
    }
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {});
    }
    this.echoDelay = null;
    this.echoDamping = null;
    this.echoFeedback = null;
    this.compressor = null;
    this.noiseBuffer = null;
    this.ctx = null;
  }
}

export const soundEngine = new VirtuosoSoundEngine();
