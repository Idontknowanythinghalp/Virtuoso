/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  INTRO_EMBLEM_SRC,
  INTRO_FINAL_HOLD_MS,
  INTRO_READY_FALLBACK_MS,
  INTRO_REVEAL_DURATION_MS,
  INTRO_VIDEO_SRC,
  isImageElementReady,
} from '../../utils/experienceState';

export type IntroStage = 'loading' | 'video' | 'hold' | 'reveal' | 'exiting';

interface CinematicIntroProps {
  onComplete: () => void;
  onReady?: () => void;
  reducedMotion?: boolean;
}

const VIDEO_LOAD_TIMEOUT_MS = 15000;

function readPreviewStage(): IntroStage | null {
  if (typeof window === 'undefined') return null;
  const stage = new URLSearchParams(window.location.search).get('introPreviewStage');
  if (stage === 'video' || stage === 'hold' || stage === 'reveal') {
    return stage;
  }
  return null;
}

export const CinematicIntro: React.FC<CinematicIntroProps> = ({
  onComplete,
  onReady,
  reducedMotion = false,
}) => {
  const previewStage = readPreviewStage();

  const [stage, setStage] = useState<IntroStage>(() => {
    if (previewStage) return previewStage;
    if (reducedMotion) return 'reveal';
    return 'loading';
  });

  const [videoReady, setVideoReady] = useState<boolean>(() => Boolean(reducedMotion || previewStage));
  const [emblemLoaded, setEmblemLoaded] = useState<boolean>(false);
  const [videoFailed, setVideoFailed] = useState<boolean>(false);
  const [needsManualPlay, setNeedsManualPlay] = useState<boolean>(false);
  const [progressPct, setProgressPct] = useState<number>(() => {
    if (previewStage === 'hold') return 68;
    if (previewStage === 'reveal') return 100;
    return 0;
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const hasCompletedRef = useRef<boolean>(false);
  const hasSignaledReadyRef = useRef<boolean>(false);
  const playAttemptedRef = useRef<boolean>(false);
  const isReadyToPlay = emblemLoaded && (videoReady || videoFailed || reducedMotion || Boolean(previewStage));

  const attachVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el) {
      el.muted = true;
      el.defaultMuted = true;
      el.setAttribute('muted', '');
      el.setAttribute('playsinline', '');
      el.setAttribute('webkit-playsinline', '');
    }
  }, []);

  const finishIntro = useCallback((immediate = false) => {
    if (hasCompletedRef.current) return;
    hasCompletedRef.current = true;
    setStage('exiting');
    const fadeMs = immediate ? 280 : 650;
    window.setTimeout(() => {
      onCompleteRef.current();
    }, fadeMs);
  }, []);

  const startMutedPlayback = useCallback(() => {
    if (previewStage || reducedMotion || hasCompletedRef.current) return;
    const videoEl = videoRef.current;
    if (!videoEl) return;

    videoEl.muted = true;
    videoEl.defaultMuted = true;
    setVideoReady(true);
    setStage((prev) => (prev === 'loading' ? 'video' : prev));

    if (!videoEl.paused) {
      setNeedsManualPlay(false);
      return;
    }

    if (playAttemptedRef.current) return;
    playAttemptedRef.current = true;

    const playPromise = videoEl.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise
        .then(() => {
          setNeedsManualPlay(false);
        })
        .catch((err: unknown) => {
          playAttemptedRef.current = false;
          const name = err instanceof Error ? err.name : '';
          if (name === 'AbortError') {
            // Transient interruption while media pipeline settles; keep video mounted
            return;
          }
          // Strict autoplay policy blocked playback: keep first video frame visible and offer one-tap play
          setNeedsManualPlay(true);
        });
    }
  }, [previewStage, reducedMotion]);

  // Preload official Virtuoso emblem with bounded fallback so warm-cached or slow connections never stall
  useEffect(() => {
    if (isImageElementReady(imgRef.current)) {
      setEmblemLoaded(true);
      return;
    }
    const timer = window.setTimeout(() => {
      setEmblemLoaded(true);
    }, INTRO_READY_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // Signal parent app once initial frame/emblem is ready
  useEffect(() => {
    if (!isReadyToPlay || hasSignaledReadyRef.current) return;
    hasSignaledReadyRef.current = true;
    onReadyRef.current?.();
  }, [isReadyToPlay]);

  // Keyboard Escape support for accessibility
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        finishIntro(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [finishIntro]);

  // Trigger muted playback if cached/ready before React attached listeners, and bound stalled loading
  useEffect(() => {
    if (previewStage || reducedMotion) return;

    const videoEl = videoRef.current;
    if (!videoEl) {
      setVideoFailed(true);
      setStage('reveal');
      return;
    }

    if (videoEl.readyState >= 2) {
      startMutedPlayback();
    }

    const loadTimeout = window.setTimeout(() => {
      if (hasCompletedRef.current) return;
      if (videoEl.readyState < 2 && videoEl.networkState !== HTMLMediaElement.NETWORK_LOADING) {
        setVideoFailed(true);
        setStage('reveal');
      }
    }, VIDEO_LOAD_TIMEOUT_MS);

    return () => {
      window.clearTimeout(loadTimeout);
    };
  }, [previewStage, reducedMotion, startMutedPlayback]);

  // Deterministic preview stage positioning for ?introPreviewStage=video|hold|reveal
  useEffect(() => {
    if (!previewStage) return;
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const seekPreview = () => {
      const duration = Number.isFinite(videoEl.duration) && videoEl.duration > 0 ? videoEl.duration : 15;
      if (previewStage === 'video') {
        videoEl.currentTime = Math.min(duration * 0.35, 5.0);
      } else if (previewStage === 'hold' || previewStage === 'reveal') {
        videoEl.currentTime = Math.max(0, duration - 0.12);
      }
      videoEl.pause();
    };

    if (videoEl.readyState >= 1) {
      seekPreview();
    } else {
      videoEl.addEventListener('loadedmetadata', seekPreview, { once: true });
      return () => videoEl.removeEventListener('loadedmetadata', seekPreview);
    }
  }, [previewStage]);

  // Coordinate timed progression from final frame hold -> official emblem reveal -> homepage fade
  useEffect(() => {
    if (previewStage) return;

    if (stage === 'hold') {
      const revealTimer = window.setTimeout(() => {
        setStage('reveal');
      }, INTRO_FINAL_HOLD_MS);
      return () => window.clearTimeout(revealTimer);
    }

    if (stage === 'reveal') {
      setProgressPct(100);
      const exitDelay = reducedMotion ? 2600 : INTRO_REVEAL_DURATION_MS;
      const doneTimer = window.setTimeout(() => {
        finishIntro(false);
      }, exitDelay);
      return () => window.clearTimeout(doneTimer);
    }
  }, [stage, previewStage, reducedMotion, finishIntro]);

  const handleVideoTimeUpdate = () => {
    if (previewStage || reducedMotion) return;
    const videoEl = videoRef.current;
    if (!videoEl || !Number.isFinite(videoEl.duration) || videoEl.duration <= 0) return;
    const pct = Math.min(72, (videoEl.currentTime / videoEl.duration) * 72);
    setProgressPct(pct);
  };

  const handleVideoEnded = () => {
    if (previewStage || reducedMotion) return;
    setProgressPct(75);
    setStage('hold');
  };

  const handleVideoError = () => {
    if (previewStage) return;
    setVideoFailed(true);
    setStage('reveal');
  };

  const handleManualPlayClick = () => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    videoEl.muted = true;
    videoEl
      .play()
      .then(() => {
        setNeedsManualPlay(false);
        setStage('video');
      })
      .catch(() => {
        setNeedsManualPlay(false);
        setVideoFailed(true);
        setStage('reveal');
      });
  };

  const isRevealVisible = stage === 'reveal' || stage === 'exiting';
  const showVideoLayer = !reducedMotion && !videoFailed;

  return (
    <div
      className={`fixed inset-0 z-[100] bg-[#200000] flex flex-col items-center justify-center overflow-hidden select-none transition-opacity ease-[cubic-bezier(0.645,0.045,0.355,1)] ${
        stage === 'exiting' ? 'opacity-0 pointer-events-none duration-700' : 'opacity-100 duration-500'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Virtuoso 2026 Opening Sequence"
      data-intro-ready={isReadyToPlay ? 'true' : 'false'}
      data-intro-stage={stage}
      data-intro-reveal={isRevealVisible ? 'true' : 'false'}
      data-intro-reduced-motion={reducedMotion ? 'true' : 'false'}
      data-intro-video-src={INTRO_VIDEO_SRC}
    >
      {/* Full-Screen Muted Approved Human-Story Cinema Layer */}
      {showVideoLayer && (
        <div
          className={`absolute inset-0 bg-[#200000] flex items-center justify-center transition-opacity duration-700 ease-[cubic-bezier(0.645,0.045,0.355,1)] ${
            stage === 'loading' ? 'opacity-0' : isRevealVisible ? 'opacity-25' : 'opacity-100'
          }`}
          aria-hidden="true"
        >
          <video
            ref={attachVideoRef}
            src={INTRO_VIDEO_SRC}
            muted
            autoPlay={!previewStage}
            playsInline
            preload="auto"
            onLoadedData={startMutedPlayback}
            onCanPlay={startMutedPlayback}
            onPlaying={() => {
              if (!previewStage && !reducedMotion) {
                setVideoReady(true);
                setNeedsManualPlay(false);
                setStage((prev) => (prev === 'loading' ? 'video' : prev));
              }
            }}
            onTimeUpdate={handleVideoTimeUpdate}
            onEnded={handleVideoEnded}
            onError={handleVideoError}
            className="w-full h-full object-contain md:object-cover object-center"
          />

          {/* Restrained Midnight Burgundy cinematic edge vignette */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse at center, transparent 58%, rgba(32, 0, 0, 0.72) 100%)',
            }}
          />
          <div
            className="absolute inset-x-0 top-0 h-16 sm:h-24 pointer-events-none"
            style={{
              background: 'linear-gradient(180deg, rgba(32, 0, 0, 0.85) 0%, rgba(32, 0, 0, 0) 100%)',
            }}
          />
          <div
            className="absolute inset-x-0 bottom-0 h-16 sm:h-24 pointer-events-none"
            style={{
              background: 'linear-gradient(0deg, rgba(32, 0, 0, 0.88) 0%, rgba(32, 0, 0, 0) 100%)',
            }}
          />
        </div>
      )}

      {/* Velvet Midnight Burgundy Backdrop Transition Veil during Event Identity Reveal */}
      <div
        className={`absolute inset-0 pointer-events-none z-10 transition-opacity duration-1000 ease-[cubic-bezier(0.645,0.045,0.355,1)] ${
          isRevealVisible ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          background:
            'radial-gradient(circle at 50% 42%, rgba(75, 5, 7, 0.72) 0%, rgba(51, 2, 5, 0.92) 48%, rgba(32, 0, 0, 0.98) 100%)',
        }}
        aria-hidden="true"
      />

      {/* Graceful Initial Loading State */}
      <div
        className={`absolute inset-0 z-25 bg-[#200000] flex flex-col items-center justify-center gap-3 pointer-events-none transition-opacity duration-500 ease-[cubic-bezier(0.645,0.045,0.355,1)] ${
          isReadyToPlay ? 'opacity-0' : 'opacity-100'
        }`}
        aria-hidden={isReadyToPlay}
      >
        <div className="w-16 h-[1px] bg-gradient-to-r from-transparent via-[#B9873F] to-transparent" />
        <p className="font-serif-luxury text-[10px] sm:text-xs uppercase tracking-[0.35em] text-[#B9873F]">
          Virtuoso &apos;26
        </p>
      </div>

      {/* Fallback Play Trigger ONLY if Browser Autoplay Policy Strictly Blocks Playback */}
      {needsManualPlay && !isRevealVisible && showVideoLayer && (
        <div className="relative z-30 flex flex-col items-center gap-3 px-6 text-center">
          <button
            type="button"
            onClick={handleManualPlayClick}
            className="px-7 py-3 text-xs sm:text-sm font-serif-luxury uppercase tracking-[0.22em] text-[#200000] bg-gradient-to-r from-[#F0D18B] via-[#D9AD61] to-[#B9873F] rounded shadow-[0_0_28px_rgba(217,173,97,0.35)] hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F0D18B] transition-all cursor-pointer"
          >
            Play Opening Film
          </button>
        </div>
      )}

      {/* Sequential Official Virtuoso Emblem & Event Identity Reveal */}
      <div
        className={`relative z-20 max-w-4xl w-full px-6 text-center flex flex-col items-center space-y-5 sm:space-y-6 transition-all duration-1000 ease-[cubic-bezier(0.645,0.045,0.355,1)] ${
          isRevealVisible
            ? 'opacity-100 scale-100'
            : 'opacity-0 scale-95 pointer-events-none'
        }`}
      >
        {/* Champagne-Gold Radial Illumination */}
        <div
          className={`absolute top-24 left-1/2 w-72 h-72 sm:w-96 sm:h-96 rounded-full pointer-events-none blur-2xl ${
            isRevealVisible ? 'intro-glow' : 'opacity-0'
          }`}
          style={{
            background:
              'radial-gradient(circle, rgba(217, 173, 97, 0.34) 0%, rgba(185, 135, 63, 0.16) 45%, rgba(32, 0, 0, 0) 75%)',
          }}
          aria-hidden="true"
        />

        {/* 1. Original Official Virtuoso Emblem (Unmodified Proportions & Details) */}
        <div
          className={`relative p-2.5 rounded-2xl bg-[#200000]/92 border border-[#B9873F]/45 shadow-[0_22px_60px_rgba(32,0,0,0.95)] overflow-hidden ${
            isRevealVisible ? 'intro-emblem' : 'opacity-0'
          }`}
        >
          <img
            ref={imgRef}
            src={INTRO_EMBLEM_SRC}
            alt="Virtuoso 2026 Official Solstice Emblem"
            loading="eager"
            decoding="sync"
            onLoad={() => setEmblemLoaded(true)}
            onError={() => setEmblemLoaded(true)}
            className="w-32 sm:w-40 md:w-44 h-auto object-contain rounded-xl relative z-10"
          />
          {!reducedMotion && (
            <div
              className={`absolute inset-y-0 w-24 pointer-events-none z-20 ${
                isRevealVisible ? 'intro-sheen' : 'opacity-0'
              }`}
              style={{
                background:
                  'linear-gradient(90deg, transparent 0%, rgba(240, 209, 139, 0.32) 50%, transparent 100%)',
              }}
            />
          )}
        </div>

        {/* 2. Event Title */}
        <div className={`space-y-2 relative z-10 ${isRevealVisible ? 'intro-title' : 'opacity-0'}`}>
          <h1 className="font-serif-luxury text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-[0.2em] text-[#F0D18B] whitespace-nowrap drop-shadow-[0_4px_22px_rgba(32,0,0,0.85)]">
            VIRTUOSO &apos;26
          </h1>
        </div>

        {/* Gold Divider */}
        <div
          className={`w-44 sm:w-64 flex items-center justify-center gap-2 relative z-10 ${
            isRevealVisible ? 'intro-line' : 'opacity-0'
          }`}
          aria-hidden="true"
        >
          <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[#B9873F]" />
          <span className="w-1.5 h-1.5 rotate-45 bg-[#D9AD61]" />
          <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[#B9873F]" />
        </div>

        {/* 3. Theme */}
        <p
          className={`font-serif-luxury text-sm sm:text-lg md:text-xl tracking-[0.35em] uppercase text-[#D9AD61] relative z-10 ${
            isRevealVisible ? 'intro-theme' : 'opacity-0'
          }`}
        >
          HEIRS OF THE SOLSTICE
        </p>

        {/* 4. Event Dates */}
        <div className={`pt-1 relative z-10 ${isRevealVisible ? 'intro-dates' : 'opacity-0'}`}>
          <span className="inline-block px-4 py-1.5 rounded border border-[#B9873F]/55 bg-[#330205]/95 text-[11px] sm:text-xs font-serif-luxury uppercase tracking-[0.28em] text-[#F0D18B]">
            4–5 DECEMBER 2026
          </span>
        </div>
      </div>

      {/* Subtle Cinema Widescreen Bars on Desktop */}
      <div className="hidden md:block absolute top-0 inset-x-0 h-5 bg-[#200000] pointer-events-none z-20" />
      <div className="hidden md:block absolute bottom-0 inset-x-0 h-5 bg-[#200000] pointer-events-none z-20" />

      {/* Accessible Skip Intro / Enter Website Control */}
      <button
        type="button"
        onClick={() => finishIntro(true)}
        aria-label={reducedMotion ? 'Enter Virtuoso 2026 Website' : 'Skip opening introduction'}
        className="absolute top-5 right-4 sm:top-8 sm:right-8 z-30 px-4 py-2 text-[11px] sm:text-xs font-serif-luxury uppercase tracking-[0.2em] text-[#F0D18B] bg-[#330205]/92 border border-[#B9873F]/65 hover:border-[#F0D18B] hover:bg-[#4B0507] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F0D18B] rounded transition-colors duration-300 ease-[cubic-bezier(0.645,0.045,0.355,1)] cursor-pointer"
      >
        {reducedMotion ? 'Enter Website' : 'Skip Intro'}
      </button>

      {/* Subtle Bottom Progress Hairline */}
      <div
        className="absolute bottom-0 inset-x-0 h-[2px] bg-[#785020]/30 z-30 pointer-events-none"
        aria-hidden="true"
      >
        <div
          className="h-full bg-gradient-to-r from-[#785020] via-[#B9873F] to-[#D9AD61] transition-[width] duration-300 ease-[cubic-bezier(0.645,0.045,0.355,1)]"
          style={{ width: `${progressPct.toFixed(1)}%` }}
        />
      </div>
    </div>
  );
};
