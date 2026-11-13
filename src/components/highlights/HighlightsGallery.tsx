/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Camera, Maximize2, Tag, Sparkles } from 'lucide-react';
import { GalleryPhotoItem, previousYearPhotos } from '../../data/highlightsData';
import { GalleryLightboxModal } from './GalleryLightboxModal';
import { useSound } from '../../contexts/SoundContext';

interface HighlightsGalleryProps {
  photos?: GalleryPhotoItem[];
}

export const HighlightsGallery: React.FC<HighlightsGalleryProps> = ({
  photos = previousYearPhotos,
}) => {
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const { playGalleryOpen } = useSound();

  return (
    <div className="space-y-6">
      {/* Gallery Header Note */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs border-b border-[#B9873F]/20 pb-4">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-[#D9AD61]" />
          <span className="font-display font-semibold uppercase tracking-wider text-[#FFFFFF]">
            Edition Photo Archive
          </span>
          <span className="text-[10px] bg-[#4B0507] text-[#F0D18B] px-2 py-0.5 rounded font-mono">
            {photos.length} Captured Frames
          </span>
        </div>
        <span className="text-[11px] text-[#B9873F]">
          Click any frame to enlarge and view details
        </span>
      </div>

      {/* Responsive Gallery Grid: 1 col on mobile, 2 col on tablet, 3 col on desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {photos.map((item, index) => {
          const hasImage = Boolean(item.imageUrl && item.imageUrl.trim().length > 0);

          return (
            <div
              key={item.id}
              onClick={() => {
                playGalleryOpen();
                setSelectedPhotoIndex(index);
              }}
              className="group relative rounded-2xl bg-gradient-to-b from-[#330205] to-[#200000] border border-[#B9873F]/30 hover:border-[#D9AD61] shadow-lg card-regal-hover cursor-pointer overflow-hidden flex flex-col justify-between"
            >
              {/* Image / Neutral Placeholder Container */}
              <div className="relative w-full aspect-[4/3] bg-[#1a0000] overflow-hidden flex items-center justify-center">
                {hasImage ? (
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    className="w-full h-full object-cover image-reveal group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  /* Visually Neutral Elegant Placeholder */
                  <div className="w-full h-full relative flex flex-col items-center justify-center p-6 text-center bg-gradient-to-br from-[#2a0104] via-[#200000] to-[#150000] group-hover:bg-[#330205]/60 transition-colors duration-300">
                    {/* Subtle frame borders */}
                    <div className="absolute inset-3 border border-[#B9873F]/15 rounded-xl pointer-events-none group-hover:border-[#D9AD61]/30 transition-colors" />

                    <div className="relative z-10 space-y-2.5">
                      <div className="w-11 h-11 rounded-xl bg-[#330205] border border-[#B9873F]/40 flex items-center justify-center mx-auto group-hover:scale-110 group-hover:border-[#D9AD61] transition-transform duration-300 shadow-md">
                        <Camera className="w-5 h-5 text-[#D9AD61]" />
                      </div>
                      <div className="text-[10px] uppercase font-display tracking-widest text-[#B9873F] group-hover:text-[#D9AD61] transition-colors">
                        Archive Slot #{index + 1}
                      </div>
                    </div>
                  </div>
                )}

                {/* Top Badge Overlay */}
                <div className="absolute top-3 left-3 z-10">
                  <span className="text-[10px] uppercase font-display tracking-wider font-semibold text-[#200000] bg-[#D9AD61] px-2 py-0.5 rounded shadow-sm">
                    {item.tag}
                  </span>
                </div>

                {/* Hover Action Overlay with Maximize Icon */}
                <div className="absolute inset-0 bg-[#200000]/60 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-2">
                  <div className="px-3.5 py-1.5 rounded-full bg-[#330205]/90 border border-[#D9AD61] text-[#FFFFFF] text-xs font-medium flex items-center gap-1.5 shadow-xl">
                    <Maximize2 className="w-3.5 h-3.5 text-[#F0D18B]" />
                    <span>View Frame</span>
                  </div>
                </div>
              </div>

              {/* Card Footer Info */}
              <div className="p-4 sm:p-5 space-y-1.5 border-t border-[#B9873F]/20 bg-[#200000]/70">
                <div className="flex items-center justify-between text-[11px] text-[#B9873F]">
                  <span>{item.year}</span>
                  <span className="text-[#D9AD61]/70">• • •</span>
                </div>
                <h4 className="font-display text-base font-bold text-[#FFFFFF] group-hover:text-[#F0D18B] transition-colors line-clamp-1">
                  {item.title}
                </h4>
                <p className="text-xs text-[#D9AD61]/80 line-clamp-2 leading-relaxed">
                  {item.caption}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Lightbox Modal */}
      <GalleryLightboxModal
        photos={photos}
        selectedIndex={selectedPhotoIndex}
        onClose={() => setSelectedPhotoIndex(null)}
        onSelectIndex={(newIdx) => setSelectedPhotoIndex(newIdx)}
      />
    </div>
  );
};
