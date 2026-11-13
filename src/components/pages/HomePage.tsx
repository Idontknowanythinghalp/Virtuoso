import React, { useEffect, useState } from 'react';
import { AppRoute } from '../../types';
import { GoldDivider } from '../common/GoldDivider';
import { BrochureViewerModal } from '../common/BrochureViewerModal';
import { LegacyHighlightsSection } from '../highlights/LegacyHighlightsSection';
import { openOfficialBrochure, getBrochureBlobUrl } from '../../utils/brochureHelper';
import { useSound } from '../../contexts/SoundContext';
import {
  Calendar,
  MapPin,
  Trophy,
  Users,
  ArrowRight,
  FileText,
  ChevronRight,
  Sparkles,
  Building,
  Loader2,
  BookOpen,
} from 'lucide-react';

interface HomePageProps {
  onRouteChange: (route: AppRoute) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onRouteChange }) => {
  const [isOpeningBrochure, setIsOpeningBrochure] = useState(false);
  const [isBrochureModalOpen, setIsBrochureModalOpen] = useState(false);
  const { playClick } = useSound();

  const handleBrochureClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setIsBrochureModalOpen(true);
  };

  // Solstice fest commencement: 4 December 2026 at 09:00:00 IST (UTC+05:30)
  // Expressed universally in UTC to avoid cross-browser timezone parse inconsistencies
  const FEST_TARGET_TIMESTAMP = Date.UTC(2026, 11, 4, 3, 30, 0);

  const calculateTimeRemaining = () => {
    const now = Date.now();
    const difference = FEST_TARGET_TIMESTAMP - now;

    if (difference <= 0) {
      return {
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        isCommenced: true,
      };
    }

    const totalSeconds = Math.floor(difference / 1000);
    return {
      days: Math.floor(totalSeconds / 86400),
      hours: Math.floor((totalSeconds % 86400) / 3600),
      minutes: Math.floor((totalSeconds % 3600) / 60),
      seconds: totalSeconds % 60,
      isCommenced: false,
    };
  };

  // Lazy-initialize state from actual current time immediately (zero initial 00 flash)
  const [timeLeft, setTimeLeft] = useState(calculateTimeRemaining);

  useEffect(() => {
    const tick = () => {
      setTimeLeft(calculateTimeRemaining());
    };

    tick();
    const interval = setInterval(tick, 1000);

    // Re-sync immediately when tab regains focus or visibility (prevents mobile/tab throttle drift)
    const handleSync = () => {
      tick();
    };

    document.addEventListener('visibilitychange', handleSync);
    window.addEventListener('focus', handleSync);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleSync);
      window.removeEventListener('focus', handleSync);
    };
  }, []);

  return (
    <div className="w-full min-h-screen bg-[#200000] text-[#F0D18B]">

      {/* Cinematic Solstice Hero */}
      <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-32 px-4 sm:px-6 lg:px-8 border-b border-[#B9873F]/20">
        {/* Theatrical Vignette & Lighting */}
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#4B0507]/60 via-[#200000]/80 to-[#120000] z-0" />
        <div className="hero-ambient-glow absolute top-1/4 left-1/2 w-[600px] h-[600px] bg-[#B9873F]/12 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-5xl mx-auto text-center space-y-6">
          {/* Official Emblem Presentation */}
          <div className="inline-block relative">
            <div className="p-2 rounded-2xl bg-[#330205]/70 border border-[#B9873F]/40 shadow-[0_0_35px_rgba(185,135,63,0.25)] hover:border-[#F0D18B] hover:shadow-[0_0_45px_rgba(240,209,139,0.35)] transition-all duration-300">
              <img
                src="/assets/aistudio/image_1df213dd.png"
                alt="Virtuoso 2026 Official Solstice Emblem"
                className="w-36 h-48 md:w-44 md:h-56 object-cover rounded-xl mx-auto shadow-2xl image-reveal"
              />
            </div>
          </div>

          {/* Department Presentation Kicker */}
          <div className="space-y-1">
            <p className="text-xs md:text-sm font-serif-luxury tracking-[0.25em] uppercase text-[#D9AD61]">
              Department of Business Administration Presents
            </p>
            <h1 className="font-serif-luxury text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-wider text-[#FFFFFF] drop-shadow-md">
              VIRTUOSO
            </h1>
            <p className="font-serif-luxury text-lg sm:text-2xl md:text-3xl text-[#F0D18B] tracking-[0.3em] uppercase pt-1">
              HEIRS OF THE SOLSTICE
            </p>
          </div>

          <p className="text-sm md:text-base text-[#D9AD61]/90 max-w-2xl mx-auto leading-relaxed font-sans-clean font-normal text-balance">
            One of India's premier national-level inter-collegiate management fests. A high-stakes confluence of intellect, strategy, and legacy set across St. Joseph's College of Commerce and Bengaluru's finest five-star settings.
          </p>

          {/* Date & Venue Badges (Unboxed metadata with separators per design rules) */}
          <div className="flex flex-wrap items-center justify-center gap-3 text-xs md:text-sm text-[#F0D18B]/90 font-medium py-2">
            <span className="flex items-center gap-1.5 text-[#FFFFFF]">
              <Calendar className="w-4 h-4 text-[#D9AD61]" />
              4th & 5th December 2026
            </span>
            <span aria-hidden="true" className="text-[#B9873F]">·</span>
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-[#D9AD61]" />
              Day 1: SJCC Brigade Rd · Day 2: 5-Star Hotel Venue
            </span>
            <span aria-hidden="true" className="text-[#B9873F]">·</span>
            <span className="flex items-center gap-1.5 text-[#F0D18B]">
              <Users className="w-4 h-4 text-[#D9AD61]" />
              4 Participants per Contingent
            </span>
          </div>

          {/* Primary Action Buttons */}
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => {
                playClick();
                onRouteChange('registration');
              }}
              className="w-full sm:w-auto px-8 py-3.5 text-xs md:text-sm font-semibold uppercase tracking-widest text-[#200000] bg-gradient-to-r from-[#F0D18B] via-[#D9AD61] to-[#B9873F] rounded hover:brightness-110 active:scale-95 transition-all shadow-[0_0_20px_rgba(185,135,63,0.35)] btn-gold-glow flex items-center justify-center gap-2"
            >
              <span>Register Contingent</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                playClick();
                onRouteChange('theme');
              }}
              className="w-full sm:w-auto px-6 py-3.5 text-xs md:text-sm font-semibold tracking-wider text-[#F0D18B] hover:text-[#FFFFFF] border border-[#B9873F]/40 hover:border-[#D9AD61] bg-[#330205]/60 rounded transition-all hover:shadow-[0_0_18px_rgba(185,135,63,0.2)] flex items-center justify-center gap-2"
            >
              <span>Explore The Solstice Theme</span>
              <ChevronRight className="w-4 h-4 text-[#D9AD61]" />
            </button>
            <button
              onClick={() => {
                playClick();
                onRouteChange('brochure');
              }}
              className="w-full sm:w-auto px-5 py-3.5 text-xs md:text-sm font-medium text-[#D9AD61] hover:text-[#FFFFFF] border border-[#B9873F]/30 hover:border-[#B9873F] bg-[#330205]/40 rounded transition-all hover:shadow-[0_0_18px_rgba(185,135,63,0.18)] flex items-center justify-center gap-2 cursor-pointer"
            >
              <FileText className="w-4 h-4 text-[#D9AD61]" />
              <span>Official Brochure Dossier</span>
            </button>
          </div>

          {/* Solstice Countdown Grid */}
          <div className="pt-8">
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#D9AD61] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#F0D18B]"></span>
              </span>
              <p className="text-[11px] uppercase tracking-widest text-[#B9873F] font-serif-luxury">
                Live Solstice Threshold Countdown
              </p>
            </div>

            {timeLeft.isCommenced ? (
              <div className="max-w-md mx-auto p-4 rounded-xl bg-gradient-to-r from-[#4B0507] via-[#330205] to-[#4B0507] border border-[#D9AD61] text-center shadow-xl">
                <span className="font-serif-luxury text-xl sm:text-2xl font-bold text-[#FFFFFF] tracking-wider uppercase block">
                  VIRTUOSO 2026 IS LIVE
                </span>
                <span className="text-xs text-[#D9AD61] mt-1 block">
                  4th & 5th December 2026 • The Crucible Has Commenced
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:gap-4 max-w-md mx-auto">
                {[
                  { label: 'Days', value: timeLeft.days },
                  { label: 'Hours', value: timeLeft.hours },
                  { label: 'Minutes', value: timeLeft.minutes },
                  { label: 'Seconds', value: timeLeft.seconds },
                ].map((unit) => (
                  <div
                    key={unit.label}
                    className="p-3 sm:p-4 rounded-xl bg-gradient-to-b from-[#330205] to-[#200000] border border-[#B9873F]/35 text-center shadow-inner hover:border-[#D9AD61]/60 transition-colors"
                  >
                    <div className="font-serif-luxury text-2xl sm:text-3xl font-bold text-[#FFFFFF] tabular-nums tracking-tight">
                      {String(unit.value).padStart(2, '0')}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-[#D9AD61] font-medium mt-0.5">
                      {unit.label}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-[#B9873F]/80 uppercase tracking-widest mt-2.5">
              Target: 4 December 2026, 09:00 AM IST
            </p>
          </div>
        </div>
      </section>

      {/* Prize Pool & Key Stipulations Banner */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-[#200000] via-[#330205] to-[#200000] border-b border-[#B9873F]/20">
        <div className="max-w-6xl mx-auto">
          <div className="p-8 rounded-2xl bg-gradient-to-r from-[#4B0507]/90 via-[#330205] to-[#4B0507]/90 border border-[#B9873F]/40 shadow-xl card-regal-hover relative overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
              <div className="md:col-span-7 space-y-3">
                <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#D9AD61] font-serif-luxury">
                  <Trophy className="w-4 h-4 text-[#F0D18B]" />
                  <span>Official Stakes & Honors</span>
                </div>
                <h2 className="font-serif-luxury text-3xl sm:text-4xl font-extrabold text-[#FFFFFF]">
                  PRIZE POOL OF ₹1,25,000
                </h2>
                <p className="text-xs sm:text-sm text-[#F0D18B]/80 leading-relaxed max-w-xl">
                  National bragging rights, grand rolling trophies, and executive recognition. Reserved for the contingent with the intellect to withstand the solstice crucible.
                </p>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="p-4 rounded-lg bg-[#200000]/70 border border-[#B9873F]/30">
                    <span className="text-[11px] uppercase tracking-wider text-[#D9AD61] block">Winners</span>
                    <span className="font-serif-luxury text-2xl font-bold text-[#FFFFFF] tabular-nums">₹75,000</span>
                  </div>
                  <div className="p-4 rounded-lg bg-[#200000]/70 border border-[#B9873F]/30">
                    <span className="text-[11px] uppercase tracking-wider text-[#D9AD61] block">Runners-Up</span>
                    <span className="font-serif-luxury text-2xl font-bold text-[#FFFFFF] tabular-nums">₹50,000</span>
                  </div>
                </div>
              </div>

              <div className="md:col-span-5 p-6 rounded-xl bg-[#200000]/80 border border-[#B9873F]/30 space-y-3">
                <h3 className="font-serif-luxury text-sm font-semibold tracking-wider text-[#FFFFFF] uppercase">
                  Contingent Architecture
                </h3>
                <ul className="space-y-2 text-xs text-[#D9AD61]/90">
                  <li className="flex items-start gap-2">
                    <span className="text-[#F0D18B] font-bold">1.</span>
                    <span><strong>Exactly 4 Members:</strong> No more, no less. Contingent leader is one of the four.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#F0D18B] font-bold">2.</span>
                    <span><strong>Single Institution:</strong> All 4 from the same college/department. No cross-teams.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#F0D18B] font-bold">3.</span>
                    <span><strong>Western Formals:</strong> Strict executive dress code throughout both days.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#F0D18B] font-bold">4.</span>
                    <span><strong>Registration Fee:</strong> ₹7,000 per contingent team.</span>
                  </li>
                </ul>

                <button
                  onClick={() => onRouteChange('rules')}
                  className="w-full mt-2 py-2 text-xs font-semibold text-[#F0D18B] hover:text-[#FFFFFF] border border-[#B9873F]/30 hover:border-[#D9AD61] rounded transition-colors text-center"
                >
                  View Full Rules & Regulations
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Thematic Prologue: Heirs of the Solstice */}
      <section className="py-16 md:py-24 px-4 sm:px-6 lg:px-8 border-b border-[#B9873F]/20 relative">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <span className="text-xs uppercase tracking-[0.2em] text-[#D9AD61] font-serif-luxury">
            The Official Fest Theme
          </span>
          <h2 className="font-serif-luxury text-3xl sm:text-5xl font-bold text-[#FFFFFF]">
            Heirs of the Solstice
          </h2>
          <GoldDivider withStar={true} />
          <blockquote className="font-cormorant text-xl sm:text-2xl italic text-[#F0D18B]/95 leading-relaxed text-balance">
            "The solstice is the moment the sun reaches its highest or lowest point and appears to stand still before the world turns. For centuries, people have seen it as a threshold, a point where one age ends and another begins. An heir stands at a similar turning point. The inheritance is never only wealth or power. It is also a trust, a name and a responsibility, and what an heir does with it decides whether the legacy grows, fades or is lost."
          </blockquote>
          <p className="text-xs text-[#B9873F] uppercase tracking-widest font-serif-luxury">
            VIRTUOSO 2026 CURATORIAL NOTE
          </p>
          <div className="pt-2">
            <button
              onClick={() => onRouteChange('theme')}
              className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#D9AD61] hover:text-[#FFFFFF] border-b border-[#D9AD61] pb-1 hover:border-[#FFFFFF] transition-colors font-medium"
            >
              <span>Read Full Philosophical Discourse</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* Venues & Five-Star Grandeur Section */}
      <section className="py-16 md:py-24 px-4 sm:px-6 lg:px-8 border-b border-[#B9873F]/20">
        <div className="max-w-7xl mx-auto space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-xs uppercase tracking-[0.2em] text-[#D9AD61] font-display">
              Iconic Settings
            </span>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#FFFFFF]">
              A Tale of Two Arenas
            </h2>
            <p className="text-xs sm:text-sm text-[#D9AD61]/80">
              Set against the heritage of Brigade Road and the grandeur of Bengaluru's finest five-star hospitality.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Day 1: SJCC */}
            <div className="p-8 rounded-2xl bg-[#330205]/70 border border-[#B9873F]/30 card-regal-hover space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-display uppercase tracking-widest text-[#D9AD61]">
                  Day 1 • 4th December 2026
                </span>
                <span className="text-xs text-[#200000] bg-[#D9AD61] font-bold px-2 py-0.5 rounded font-sans-clean">
                  Autonomous Campus
                </span>
              </div>
              <h3 className="font-display text-2xl font-bold text-[#FFFFFF]">
                St. Joseph's College of Commerce
              </h3>
              <p className="text-xs text-[#D9AD61]/90 leading-relaxed">
                163, Brigade Rd, Shanthala Nagar, Ashok Nagar, Bengaluru, Karnataka 560025.
                The cradle of undergraduate commerce excellence and historic Jesuit academic tradition since 1882.
              </p>
              <div className="pt-2 flex items-center gap-3">
                <button
                  onClick={() => onRouteChange('schedule-venue')}
                  className="text-xs font-semibold text-[#F0D18B] hover:text-[#FFFFFF] flex items-center gap-1.5"
                >
                  <span>Directions & Schedule</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Day 2: Five Star Hotel */}
            <div className="p-8 rounded-2xl bg-[#330205]/70 border border-[#B9873F]/30 card-regal-hover space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-display uppercase tracking-widest text-[#D9AD61]">
                  Day 2 • 5th December 2026
                </span>
                <span className="text-xs text-[#F0D18B] border border-[#B9873F] px-2 py-0.5 rounded font-sans-clean">
                  Grand Finals & Gala
                </span>
              </div>
              <h3 className="font-display text-2xl font-bold text-[#FFFFFF]">
                Five-Star Luxury Hotel Arena
              </h3>
              <p className="text-xs text-[#D9AD61]/90 leading-relaxed">
                To be announced. Continuing Virtuoso's esteemed legacy of hosting the grand finals at Bengaluru's finest hospitality destinations.
              </p>
              <div className="text-[11px] text-[#B9873F] pt-1">
                <span>Where We Have Been Before: </span>
                <strong className="text-[#D9AD61]">JW Marriott · Hyatt Centric · Courtyard by Marriott</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The Legacy Continues: Previous Year Highlights & Aftermovie */}
      <LegacyHighlightsSection />

      {/* Institutional Heritage Section */}
      <section className="py-16 md:py-20 px-4 sm:px-6 lg:px-8 bg-[#170000] border-b border-[#B9873F]/20">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-4 flex flex-col items-center justify-center p-8 bg-[#200000] rounded-2xl border border-[#B9873F]/30 card-regal-hover text-center">
            <img
              src="/assets/aistudio/image_01353a37.png"
              alt="Official St. Joseph's College of Commerce Logo"
              className="w-28 h-28 object-contain mb-4 image-reveal"
            />
            <h4 className="font-serif-luxury text-lg font-bold text-[#FFFFFF]">
              FIDE ET LABORE
            </h4>
            <p className="text-xs text-[#D9AD61] mt-1">Faith and Toil</p>
            <p className="text-[11px] text-[#B9873F] mt-2 max-w-xs">
              Motto of St. Joseph's College of Commerce, guiding leadership with integrity since 1882.
            </p>
          </div>

          <div className="lg:col-span-8 space-y-4">
            <span className="text-xs uppercase tracking-[0.2em] text-[#D9AD61] font-serif-luxury">
              Academic Anchor
            </span>
            <h2 className="font-serif-luxury text-3xl font-bold text-[#FFFFFF]">
              The Department of Business Administration
            </h2>
            <p className="text-xs sm:text-sm text-[#D9AD61]/90 leading-relaxed">
              Established in the academic year 2004–2005 at St. Joseph's College of Commerce (Autonomous), the Department has emerged as a premier undergraduate management epicenter in South India. In 2017–2018, the Department introduced the specialized BBA (Entrepreneurship) programme, instilling hands-on venture creation, AI strategy, sustainability, and global perspectives.
            </p>

            <div className="flex flex-wrap gap-4 pt-2">
              <button
                onClick={() => onRouteChange('about-department')}
                className="px-4 py-2 text-xs font-semibold border border-[#D9AD61]/50 text-[#F0D18B] hover:text-[#FFFFFF] hover:border-[#F0D18B] rounded transition-colors"
              >
                About BBA Department
              </button>
              <button
                onClick={() => onRouteChange('about-sjcc')}
                className="px-4 py-2 text-xs font-semibold text-[#D9AD61] hover:text-[#FFFFFF] transition-colors"
              >
                SJCC Institutional History →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Registration Call to Action */}
      <section className="py-16 md:py-24 px-4 sm:px-6 lg:px-8 text-center bg-gradient-to-t from-[#100000] via-[#200000] to-[#330205]">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="inline-flex p-3 rounded-full bg-[#4B0507] border border-[#B9873F]/40 text-[#F0D18B]">
            <Sparkles className="w-6 h-6 text-[#D9AD61]" />
          </div>
          <h2 className="font-serif-luxury text-3xl sm:text-5xl font-extrabold text-[#FFFFFF]">
            Will You Claim The Throne?
          </h2>
          <p className="text-sm md:text-base text-[#D9AD61]/90 leading-relaxed font-sans-clean max-w-xl mx-auto">
            Assemble your contingent of four distinguished executives to represent your institution. Step forward into the Solstice.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => {
                playClick();
                onRouteChange('registration');
              }}
              className="w-full sm:w-auto px-10 py-4 text-xs md:text-sm font-semibold uppercase tracking-widest text-[#200000] bg-gradient-to-r from-[#F0D18B] via-[#D9AD61] to-[#B9873F] rounded hover:brightness-110 active:scale-95 transition-all shadow-[0_0_25px_rgba(185,135,63,0.4)] btn-gold-glow"
            >
              Begin Contingent Registration
            </button>
            <button
              onClick={() => {
                playClick();
                onRouteChange('contact');
              }}
              className="w-full sm:w-auto px-8 py-4 text-xs md:text-sm font-semibold tracking-wider text-[#F0D18B] hover:text-[#FFFFFF] border border-[#B9873F]/40 hover:border-[#D9AD61] bg-[#200000] rounded transition-colors"
            >
              Contact Coordinators
            </button>
          </div>

          <p className="text-[11px] text-[#B9873F]">
            Strict Limit: Maximum One Contingent per College or Department · Registration Fee: ₹7,000
          </p>
        </div>
      </section>

      {/* Official Brochure In-App Viewer Modal */}
      <BrochureViewerModal
        isOpen={isBrochureModalOpen}
        onClose={() => setIsBrochureModalOpen(false)}
      />
    </div>
  );
};
