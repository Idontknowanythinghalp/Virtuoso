/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Play, Film, X, Sparkles, Clock, Volume2, Info } from 'lucide-react';
import { AftermovieConfig, aftermovieConfig as defaultConfig } from '../../data/highlightsData';

interface AftermoviePlayerProps {
  config?: AftermovieConfig;
}

export const AftermoviePlayer: React.FC<AftermoviePlayerProps> = ({
  config = defaultConfig,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPlaceholderNotice, setShowPlaceholderNotice] = useState(false);

  const hasVideoUrl = Boolean(config.videoUrl && config.videoUrl.trim().length > 0);

  const handlePlayClick = () => {
    if (hasVideoUrl) {
      setIsPlaying(true);
    } else {
      setShowPlaceholderNotice(true);
    }
  };

  return (
    <div className="space-y-4">
      {/* Cinematic Video Area (16:9 Aspect Ratio) */}
      <div className="relative w-full aspect-video rounded-2xl bg-gradient-to-b from-[#330205] via-[#200000] to-[#140000] border border-[#B9873F]/40 shadow-2xl overflow-hidden group">
        {isPlaying && hasVideoUrl ? (
          /* Active Video Embed */
          <div className="relative w-full h-full bg-black">
            <iframe
              src={`${config.videoUrl}?autoplay=1`}
              title={config.title}
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
            <button
              onClick={() => setIsPlaying(false)}
              className="absolute top-4 right-4 z-20 p-2 rounded-full bg-[#200000]/80 text-[#F0D18B] hover:text-[#FFFFFF] border border-[#B9873F]/40 hover:border-[#D9AD61] transition-colors"
              aria-label="Close video player"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        ) : (
          /* Cinematic Preview / Poster */
          <div className="relative w-full h-full flex flex-col justify-between p-6 sm:p-10 lg:p-12 select-none">
            {/* Theatrical Lighting Backdrop */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(101,12,12,0.35)_0%,rgba(32,0,0,0.95)_75%)] pointer-events-none" />

            {/* Subtle Gold Cinematic Frame Lines */}
            <div className="absolute inset-4 sm:inset-6 border border-[#B9873F]/20 rounded-xl pointer-events-none" />

            {/* Top Bar Badges */}
            <div className="relative z-10 flex items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#4B0507]/90 border border-[#B9873F]/40 text-[#F0D18B] text-xs font-semibold uppercase tracking-widest shadow-md">
                <Film className="w-3.5 h-3.5 text-[#D9AD61]" />
                <span>{config.editionBadge}</span>
              </div>

              {config.duration && (
                <div className="flex items-center gap-1.5 text-xs text-[#D9AD61]/80 font-mono bg-[#200000]/70 px-2.5 py-1 rounded border border-[#B9873F]/20">
                  <Clock className="w-3 h-3 text-[#B9873F]" />
                  <span>{config.duration}</span>
                </div>
              )}
            </div>

            {/* Central Play Button */}
            <div className="relative z-10 my-auto flex flex-col items-center justify-center text-center">
              <button
                onClick={handlePlayClick}
                className="relative group/btn p-5 sm:p-7 rounded-full bg-gradient-to-r from-[#F0D18B] via-[#D9AD61] to-[#B9873F] text-[#200000] shadow-[0_0_35px_rgba(185,135,63,0.4)] hover:shadow-[0_0_50px_rgba(240,209,139,0.7)] hover:scale-105 active:scale-95 transition-all duration-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#F0D18B]"
                aria-label="Play Virtuoso aftermovie"
              >
                {/* Pulsing ring aura */}
                <span className="absolute inset-0 rounded-full border-2 border-[#F0D18B] animate-ping opacity-25 pointer-events-none" />
                <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-current translate-x-0.5" />
              </button>
              <span className="text-[11px] font-display uppercase tracking-[0.25em] text-[#F0D18B] mt-4 font-semibold group-hover:text-[#FFFFFF] transition-colors">
                Watch Aftermovie
              </span>
            </div>

            {/* Bottom Title & Description Overlay */}
            <div className="relative z-10 space-y-1.5 max-w-2xl">
              <div className="text-[11px] uppercase tracking-widest text-[#B9873F] font-display font-medium">
                {config.subtitle}
              </div>
              <h3 className="font-display text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#FFFFFF] tracking-wide">
                {config.title}
              </h3>
              <p className="text-xs sm:text-sm text-[#D9AD61]/90 leading-relaxed font-sans-clean max-w-xl">
                {config.description}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Placeholder Notice Modal when video URL is not yet connected */}
      {showPlaceholderNotice && (
        <div
          className="fixed inset-0 z-50 bg-[#120000]/90 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setShowPlaceholderNotice(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md p-6 sm:p-8 rounded-2xl bg-gradient-to-b from-[#330205] to-[#200000] border border-[#B9873F]/50 shadow-2xl space-y-5 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-[#4B0507] border border-[#B9873F]/40 flex items-center justify-center mx-auto text-[#D9AD61]">
              <Film className="w-6 h-6" />
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-display uppercase tracking-[0.2em] text-[#D9AD61] block">
                Official Media Stream
              </span>
              <h4 className="font-display text-xl font-bold text-[#FFFFFF]">
                RELIVE THE EXPERIENCE
              </h4>
              <p className="text-xs text-[#D9AD61]/90 leading-relaxed">
                The official aftermovie link will be mounted here by the college web handler prior to fest commencement.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-[#200000] border border-[#B9873F]/25 text-left text-xs text-[#F0D18B] space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-[#D9AD61] text-[11px]">
                <Info className="w-3.5 h-3.5" />
                <span>Web Administrator Note</span>
              </div>
              <p className="text-[11px] text-[#B9873F]">
                To connect the YouTube or Vimeo broadcast, set the <code className="text-[#F0D18B] bg-[#330205] px-1 py-0.5 rounded">videoUrl</code> field in <code className="text-[#F0D18B] bg-[#330205] px-1 py-0.5 rounded">src/data/highlightsData.ts</code>.
              </p>
            </div>

            <button
              onClick={() => setShowPlaceholderNotice(false)}
              className="w-full py-2.5 text-xs font-semibold uppercase tracking-wider text-[#200000] bg-gradient-to-r from-[#F0D18B] to-[#D9AD61] rounded hover:brightness-110 transition-all font-sans-clean"
            >
              Close Preview
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
