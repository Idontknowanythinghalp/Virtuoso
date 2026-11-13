/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { soundEngine } from '../utils/soundEngine';

interface SoundContextValue {
  isSoundEnabled: boolean;
  playIntroFanfare: () => void;
  playClick: () => void;
  playNavigate: () => void;
  playGalleryOpen: () => void;
  playSuccess: () => void;
  playError: () => void;
}

const SoundContext = createContext<SoundContextValue | undefined>(undefined);

function hasUserActivation(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { userActivation?: { hasBeenActive?: boolean } };
  // If browser doesn't expose UserActivation API, allow fallback unlock attempt
  if (!nav.userActivation) return true;
  return Boolean(nav.userActivation.hasBeenActive);
}

export const SoundProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    // Unlock Web Audio seamlessly on the very first user gesture anywhere on the page
    const unlockOnGesture = () => {
      window.removeEventListener('pointerdown', unlockOnGesture, true);
      window.removeEventListener('keydown', unlockOnGesture, true);
      soundEngine.unlock().catch(() => {});
    };

    window.addEventListener('pointerdown', unlockOnGesture, { capture: true, passive: true });
    window.addEventListener('keydown', unlockOnGesture, { capture: true, passive: true });

    return () => {
      isMountedRef.current = false;
      window.removeEventListener('pointerdown', unlockOnGesture, true);
      window.removeEventListener('keydown', unlockOnGesture, true);
      soundEngine.dispose();
    };
  }, []);

  const playIntroFanfare = useCallback(() => {
    if (typeof window === 'undefined') return;

    if (soundEngine.isRunning() || hasUserActivation()) {
      soundEngine
        .unlock()
        .then((unlocked) => {
          if (unlocked && isMountedRef.current) {
            soundEngine.playCue('introFanfare');
          }
        })
        .catch(() => {});
      return;
    }

    // Play the Solstice intro fanfare on the user's first gesture if autoplay blocked pre-gesture audio
    const playOnFirstGesture = () => {
      window.removeEventListener('pointerdown', playOnFirstGesture, true);
      window.removeEventListener('keydown', playOnFirstGesture, true);
      soundEngine
        .unlock()
        .then((unlocked) => {
          if (unlocked && isMountedRef.current) {
            soundEngine.playCue('introFanfare');
          }
        })
        .catch(() => {});
    };

    window.addEventListener('pointerdown', playOnFirstGesture, {
      capture: true,
      once: true,
      passive: true,
    });
    window.addEventListener('keydown', playOnFirstGesture, {
      capture: true,
      once: true,
      passive: true,
    });
  }, []);

  const playCueAlways = useCallback(
    (cue: 'click' | 'navigate' | 'galleryOpen' | 'success' | 'error') => {
      if (!soundEngine.isRunning() && !hasUserActivation()) return;
      soundEngine.playCue(cue);
    },
    []
  );

  const playClick = useCallback(() => playCueAlways('click'), [playCueAlways]);
  const playNavigate = useCallback(() => playCueAlways('navigate'), [playCueAlways]);
  const playGalleryOpen = useCallback(() => playCueAlways('galleryOpen'), [playCueAlways]);
  const playSuccess = useCallback(() => playCueAlways('success'), [playCueAlways]);
  const playError = useCallback(() => playCueAlways('error'), [playCueAlways]);

  return (
    <SoundContext.Provider
      value={{
        isSoundEnabled: true,
        playIntroFanfare,
        playClick,
        playNavigate,
        playGalleryOpen,
        playSuccess,
        playError,
      }}
    >
      {children}
    </SoundContext.Provider>
  );
};

export function useSound(): SoundContextValue {
  const ctx = useContext(SoundContext);
  if (!ctx) {
    return {
      isSoundEnabled: true,
      playIntroFanfare: () => {},
      playClick: () => {},
      playNavigate: () => {},
      playGalleryOpen: () => {},
      playSuccess: () => {},
      playError: () => {},
    };
  }
  return ctx;
}
