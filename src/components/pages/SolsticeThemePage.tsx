import React from 'react';
import { AppRoute } from '../../types';
import { GoldDivider } from '../common/GoldDivider';
import { Sun, Compass, Shield, ArrowRight } from 'lucide-react';

interface SolsticeThemePageProps {
  onRouteChange: (route: AppRoute) => void;
}

export const SolsticeThemePage: React.FC<SolsticeThemePageProps> = ({ onRouteChange }) => {
  return (
    <div className="w-full min-h-screen bg-[#200000] text-[#F0D18B] py-12 md:py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-12">
        {/* Header Lockup */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 text-xs font-serif-luxury uppercase tracking-[0.25em] text-[#D9AD61]">
            <Sun className="w-4 h-4 text-[#F0D18B]" />
            <span>Virtuoso 2026 Official Theme</span>
          </div>
          <h1 className="font-serif-luxury text-4xl sm:text-6xl font-extrabold text-[#FFFFFF] tracking-wider">
            HEIRS OF THE SOLSTICE
          </h1>
          <p className="text-xs uppercase tracking-widest text-[#B9873F] font-serif-luxury">
            Leadership at the Celestial & Strategic Threshold
          </p>
        </div>

        {/* Emblem Showcase */}
        <div className="flex justify-center">
          <div className="p-3 rounded-2xl bg-[#330205]/90 border border-[#B9873F]/40 shadow-[0_0_40px_rgba(185,135,63,0.3)]">
            <img
              src="/assets/aistudio/image_1df213dd.png"
              alt="Virtuoso Solstice Emblem"
              className="w-48 h-64 md:w-56 md:h-72 object-cover rounded-xl"
            />
          </div>
        </div>

        <GoldDivider withStar={true} />

        {/* Editorial Text Essay (Verbatim from Brochure Page 5) */}
        <div className="prose prose-invert max-w-none space-y-8 font-sans-clean text-sm sm:text-base leading-relaxed text-[#F0D18B]/90">
          <p className="first-letter:text-5xl first-letter:font-serif-luxury first-letter:font-bold first-letter:float-left first-letter:mr-3 first-letter:text-[#FFFFFF] first-letter:mt-1 leading-relaxed">
            The solstice is the moment the sun reaches its highest or lowest point and appears to stand still before the world turns. For centuries, people have seen it as a threshold, a point where one age ends and another begins. An heir stands at a similar turning point. The inheritance is never only wealth or power. It is also a trust, a name and a responsibility, and what an heir does with it decides whether the legacy grows, fades or is lost.
          </p>

          <p>
            Every business leader is an heir to something: a family enterprise, a startup built by someone else, a team’s trust or a reputation earned over years. Leaders face their own solstice moments, when a decision tests whether they will protect what they were given or spend it for short-term gain. Succession, trust, ambition and accountability decide how organisations survive and how leaders are remembered. Power can be inherited, but credibility has to be earned again and again.
          </p>

          {/* Luxury Centered Pull Quote */}
          <div className="my-10 p-8 rounded-xl bg-gradient-to-r from-[#330205] via-[#4B0507] to-[#330205] border border-[#B9873F]/30 text-center">
            <blockquote className="font-cormorant text-2xl sm:text-3xl italic text-[#FFFFFF] leading-snug">
              "At Virtuoso, Heirs of the Solstice is a metaphor for leadership at its turning point. The fest is not just a stage for showcasing skill. It asks participants what legacy they will leave."
            </blockquote>
          </div>

          <p>
            The sun rises on a new era, and the throne awaits its rightful heirs. A hallmark initiative of the BBA Department, Virtuoso brings together the finest business talent from leading colleges across India.
          </p>

          <p className="p-6 rounded-lg bg-[#330205]/60 border-l border-[#B9873F] text-[#FFFFFF] font-serif-luxury text-base sm:text-lg italic leading-relaxed">
            Will you hold on to power for its own sake, or use it with vision and integrity? Will you build alliances on trust or on convenience? At this juncture, Virtuoso calls on emerging leaders to step forward as heirs, not only of opportunity but of responsibility, and to shape an age defined by ethics, strategy and lasting impact.
          </p>
        </div>

        {/* Pillars Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
          <div className="p-6 rounded-xl bg-[#330205]/80 border border-[#B9873F]/30 space-y-2">
            <Compass className="w-5 h-5 text-[#D9AD61]" />
            <h3 className="font-serif-luxury text-lg font-bold text-[#FFFFFF]">The Threshold</h3>
            <p className="text-xs text-[#D9AD61]/80 leading-relaxed">
              Standing at the point where previous paradigms pause and future governance begins.
            </p>
          </div>
          <div className="p-6 rounded-xl bg-[#330205]/80 border border-[#B9873F]/30 space-y-2">
            <Shield className="w-5 h-5 text-[#D9AD61]" />
            <h3 className="font-serif-luxury text-lg font-bold text-[#FFFFFF]">The Succession</h3>
            <p className="text-xs text-[#D9AD61]/80 leading-relaxed">
              Inheriting not merely capital, but accountability, corporate ethics, and team trust.
            </p>
          </div>
          <div className="p-6 rounded-xl bg-[#330205]/80 border border-[#B9873F]/30 space-y-2">
            <Sun className="w-5 h-5 text-[#D9AD61]" />
            <h3 className="font-serif-luxury text-lg font-bold text-[#FFFFFF]">The Legacy</h3>
            <p className="text-xs text-[#D9AD61]/80 leading-relaxed">
              Power can be inherited, but enduring credibility must be proven under crucible pressure.
            </p>
          </div>
        </div>

        {/* Action Link */}
        <div className="pt-8 text-center flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={() => onRouteChange('schedule-venue')}
            className="w-full sm:w-auto px-8 py-3 text-xs uppercase tracking-widest font-semibold text-[#200000] bg-gradient-to-r from-[#F0D18B] to-[#D9AD61] rounded hover:brightness-110 transition-all flex items-center justify-center gap-2"
          >
            <span>View Venues & Details</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => onRouteChange('registration')}
            className="w-full sm:w-auto px-6 py-3 text-xs uppercase tracking-widest font-semibold text-[#F0D18B] border border-[#B9873F]/40 hover:border-[#D9AD61] rounded transition-colors"
          >
            Register Contingent
          </button>
        </div>
      </div>
    </div>
  );
};
