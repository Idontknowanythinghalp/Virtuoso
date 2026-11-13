/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Camera, Sparkles, Tag } from 'lucide-react';
import { GalleryPhotoItem } from '../../data/highlightsData';

interface GalleryLightboxModalProps {
  photos: GalleryPhotoItem[];
  selectedIndex: number | null;
  onClose: () => void;
  onSelectIndex: (index: number) => void;
}

export const GalleryLightboxModal: React.FC<GalleryLightboxModalProps> = ({
  photos,
  selectedIndex,
  onClose,
  onSelectIndex,
}) => {
  useEffect(() => {
    if (selectedIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        onSelectIndex((selectedIndex - 1 + photos.length) % photos.length);
      } else if (e.key === 'ArrowRight') {
        onSelectIndex((selectedIndex + 1) % photos.length);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, photos.length, onClose, onSelectIndex]);

  if (selectedIndex === null || !photos[selectedIndex]) return null;

  const current = photos[selectedIndex];
  const hasImage = Boolean(current.imageUrl && current.imageUrl.trim().length > 0);

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectIndex((selectedIndex - 1 + photos.length) % photos.length);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectIndex((selectedIndex + 1) % photos.length);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#140000]/95 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 lg:p-8 animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image gallery lightbox"
    >
      <div
        className="relative w-full max-w-4xl bg-gradient-to-b from-[#330205] to-[#200000] border border-[#B9873F]/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Control Bar */}
        <div className="p-4 sm:p-5 bg-[#200000]/90 border-b border-[#B9873F]/25 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-display uppercase tracking-widest text-[#D9AD61]">
              Virtuoso Archive
            </span>
            <span className="text-[#B9873F]">·</span>
            <span className="text-[#F0D18B] font-mono">
              {selectedIndex + 1} of {photos.length}
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#D9AD61] hover:text-[#FFFFFF] bg-[#330205] border border-[#B9873F]/30 hover:border-[#F0D18B] transition-colors"
            aria-label="Close lightbox"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Display Area */}
        <div className="relative w-full aspect-[16/10] sm:aspect-[16/9] bg-[#120000] flex items-center justify-center overflow-hidden">
          {hasImage ? (
            <img
              src={current.imageUrl}
              alt={current.title}
              className="w-full h-full object-contain"
            />
          ) : (
            /* Visually Neutral Premium Placeholder Frame */
            <div className="w-full h-full relative flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-[#2a0104] via-[#200000] to-[#170000] select-none">
              {/* Subtle architectural gold guilloche / geometric frame lines */}
              <div className="absolute inset-4 sm:inset-8 border border-[#B9873F]/20 rounded-xl pointer-events-none" />
              <div className="absolute inset-6 sm:inset-10 border border-[#D9AD61]/10 rounded-lg pointer-events-none" />

              <div className="relative z-10 space-y-4 max-w-md">
                <div className="inline-flex p-3 sm:p-4 rounded-2xl bg-[#330205] border border-[#B9873F]/40 shadow-inner">
                  <Camera className="w-8 h-8 sm:w-10 sm:h-10 text-[#D9AD61]" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 text-[10px] sm:text-xs uppercase font-display tracking-widest text-[#D9AD61] bg-[#4B0507]/80 px-2.5 py-1 rounded border border-[#B9873F]/30 mb-2">
                    <Tag className="w-3 h-3 text-[#F0D18B]" />
                    <span>{current.tag}</span>
                    <span className="text-[#B9873F]">·</span>
                    <span>{current.year}</span>
                  </div>
                  <h3 className="font-display text-xl sm:text-2xl font-bold text-[#FFFFFF]">
                    {current.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#D9AD61]/80 mt-1 max-w-sm mx-auto">
                    {current.caption}
                  </p>
                </div>
                <div className="pt-2 text-[11px] text-[#B9873F]/75 uppercase tracking-wider">
                  Official Fest Photograph Slot • Ready for Media Integration
                </div>
              </div>
            </div>
          )}

          {/* Previous Button */}
          <button
            onClick={handlePrev}
            className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 p-2 sm:p-2.5 rounded-full bg-[#200000]/80 hover:bg-[#330205] text-[#F0D18B] hover:text-[#FFFFFF] border border-[#B9873F]/40 hover:border-[#D9AD61] shadow-lg transition-all"
            aria-label="Previous photograph"
          >
            <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>

          {/* Next Button */}
          <button
            onClick={handleNext}
            className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 p-2 sm:p-2.5 rounded-full bg-[#200000]/80 hover:bg-[#330205] text-[#F0D18B] hover:text-[#FFFFFF] border border-[#B9873F]/40 hover:border-[#D9AD61] shadow-lg transition-all"
            aria-label="Next photograph"
          >
            <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Bottom Details Footer */}
        <div className="p-4 sm:p-5 bg-[#200000] border-t border-[#B9873F]/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <div className="font-display font-bold text-sm text-[#FFFFFF] tracking-wide">
              {current.title}
            </div>
            <p className="text-[#D9AD61]/80 text-xs mt-0.5">
              {current.caption}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-[#B9873F] font-mono">
              Use ← / → keys or Esc to close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
