/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { GoldDivider } from '../common/GoldDivider';
import { AftermoviePlayer } from './AftermoviePlayer';
import { HighlightsGallery } from './HighlightsGallery';
import { Sparkles, History, Award } from 'lucide-react';

export const LegacyHighlightsSection: React.FC = () => {
  return (
    <section className="py-16 md:py-24 px-4 sm:px-6 lg:px-8 border-b border-[#B9873F]/20 relative bg-gradient-to-b from-[#200000] via-[#280104] to-[#200000]">
      <div className="max-w-7xl mx-auto space-y-14">
        {/* Section Heading Lockup */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2 text-xs font-display uppercase tracking-[0.25em] text-[#D9AD61]">
            <History className="w-4 h-4 text-[#F0D18B]" />
            <span>Virtuoso Hall of Memory</span>
          </div>

          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-extrabold text-[#FFFFFF] tracking-wider">
            THE LEGACY CONTINUES
          </h2>

          <p className="font-cormorant text-lg sm:text-xl md:text-2xl italic text-[#F0D18B] leading-relaxed">
            "Moments that defined us. Memories that inspire what's next."
          </p>

          <div className="pt-2">
            <GoldDivider withStar={true} />
          </div>
        </div>

        {/* Feature 1: Featured Virtuoso Aftermovie Preview */}
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-display uppercase tracking-[0.2em] text-[#D9AD61]">
              Featured Screening
            </span>
            <span className="text-[11px] text-[#B9873F]">
              Cinematic Fest Archive
            </span>
          </div>

          <AftermoviePlayer />
        </div>

        {/* Subtle Decorative Gold Hairline */}
        <div className="w-full flex items-center justify-center gap-4 py-2 opacity-50">
          <div className="h-px bg-gradient-to-r from-transparent via-[#B9873F]/40 to-transparent flex-1" />
          <Sparkles className="w-3.5 h-3.5 text-[#D9AD61]" />
          <div className="h-px bg-gradient-to-r from-transparent via-[#B9873F]/40 to-transparent flex-1" />
        </div>

        {/* Feature 2: Previous-Year Photo Gallery */}
        <div className="space-y-6">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-[0.2em] text-[#D9AD61] font-display">
              Curated Retrospective
            </div>
            <h3 className="font-display text-2xl sm:text-3xl font-bold text-[#FFFFFF]">
              Moments from the Crucible
            </h3>
            <p className="text-xs sm:text-sm text-[#D9AD61]/80 max-w-2xl">
              Glimpses of high-stakes boardroom battles, valedictory celebrations, and delegates who etched their names into Virtuoso history.
            </p>
          </div>

          <HighlightsGallery />
        </div>
      </div>
    </section>
  );
};
