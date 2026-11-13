import React from 'react';
import { AppRoute } from '../../types';
import { GoldDivider } from '../common/GoldDivider';
import { MapPin, Calendar, Building, Laptop, Award, AlertCircle, Clock } from 'lucide-react';

interface ScheduleVenuePageProps {
  onRouteChange: (route: AppRoute) => void;
}

export const ScheduleVenuePage: React.FC<ScheduleVenuePageProps> = ({ onRouteChange }) => {
  const venuesPast = [
    { name: 'JW Marriott Bengaluru', tag: 'Luxury 5-Star Heritage' },
    { name: 'Hyatt Centric Bengaluru', tag: 'Contemporary 5-Star Elegance' },
    { name: 'Courtyard by Marriott', tag: 'Executive Grandeur' },
  ];

  return (
    <div className="w-full min-h-screen bg-[#200000] text-[#F0D18B] py-12 md:py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <span className="text-xs uppercase tracking-[0.25em] text-[#D9AD61] font-display">
            Official Grounds & Venues
          </span>
          <h1 className="font-display text-4xl sm:text-5xl font-extrabold text-[#FFFFFF]">
            Venues & Schedule
          </h1>
          <p className="text-xs sm:text-sm text-[#D9AD61]/80 max-w-2xl mx-auto leading-relaxed">
            Two intense days across St. Joseph's College of Commerce (Autonomous) and Bengaluru's most distinguished five-star hospitality suites.
          </p>
        </div>

        <GoldDivider withStar={true} />

        {/* Schedule Pending Official Announcement Notice */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#330205]/80 border border-[#D9AD61]/40 flex items-start sm:items-center gap-3.5 shadow-lg">
          <div className="p-2 rounded-lg bg-[#4B0507] border border-[#B9873F]/40 shrink-0 text-[#F0D18B]">
            <Clock className="w-5 h-5 text-[#D9AD61]" />
          </div>
          <div className="space-y-1 text-xs">
            <div className="font-display font-bold text-sm text-[#FFFFFF] tracking-wide uppercase">
              Schedule Pending Official Release
            </div>
            <p className="text-[#D9AD61]/90 leading-relaxed">
              The hour-by-hour round itinerary and session timings are not confirmed yet. When the official schedule is announced by the Core Committee, this page will be updated immediately. The dates and venues stand confirmed below.
            </p>
          </div>
        </div>

        {/* Two-Day Venue Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Day 1 */}
          <div className="p-8 rounded-2xl bg-gradient-to-b from-[#330205] to-[#200000] border border-[#B9873F]/40 shadow-xl space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-display uppercase tracking-widest text-[#D9AD61]">
                  Day 1 • 4th December 2026
                </span>
                <span className="text-[10px] uppercase font-bold text-[#200000] bg-[#D9AD61] px-2.5 py-0.5 rounded">
                  Autonomous Campus
                </span>
              </div>

              <h2 className="font-display text-2xl font-bold text-[#FFFFFF]">
                St. Joseph's College of Commerce
              </h2>

              <p className="text-xs text-[#D9AD61] flex items-start gap-2">
                <MapPin className="w-4 h-4 text-[#F0D18B] shrink-0 mt-0.5" />
                <span>
                  163, Brigade Rd, Shanthala Nagar, Ashok Nagar, Bengaluru, Karnataka 560025
                </span>
              </p>

              <div className="p-4 rounded-xl bg-[#200000]/80 border border-[#B9873F]/30 space-y-2 text-xs text-[#F0D18B]">
                <div className="font-display font-bold text-[#FFFFFF] text-xs uppercase tracking-wider">
                  Day 1 Itinerary Status
                </div>
                <p className="text-[#D9AD61]/90">
                  Campus rounds, inauguration, and executive simulations. Exact check-in and briefing timings will be notified to registered contingent leaders.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-[#B9873F]/20">
              <span className="text-[11px] text-[#B9873F]">
                Centrally located on Brigade Road, easily accessible via MG Road Metro Station (Purple Line) and Kempegowda Bus Station.
              </span>
            </div>
          </div>

          {/* Day 2 */}
          <div className="p-8 rounded-2xl bg-gradient-to-b from-[#330205] to-[#200000] border border-[#B9873F]/40 shadow-xl space-y-4 flex flex-col">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-display uppercase tracking-widest text-[#D9AD61]">
                  Day 2 • 5th December 2026
                </span>
                <span className="text-[10px] uppercase font-bold text-[#F0D18B] border border-[#D9AD61] px-2.5 py-0.5 rounded">
                  Grand Finals
                </span>
              </div>

              <h2 className="font-display text-2xl font-bold text-[#FFFFFF]">
                Five-Star Luxury Hotel Arena
              </h2>

              <p className="text-xs text-[#D9AD61] flex items-start gap-2">
                <MapPin className="w-4 h-4 text-[#F0D18B] shrink-0 mt-0.5" />
                <span className="font-semibold text-[#FFFFFF]">
                  To Be Announced (Bengaluru Premier Hotel Destination)
                </span>
              </p>

              <div className="p-4 rounded-xl bg-[#200000]/80 border border-[#B9873F]/30 space-y-2 text-xs text-[#F0D18B]">
                <div className="font-display font-bold text-[#FFFFFF] text-xs uppercase tracking-wider">
                  Day 2 Itinerary Status
                </div>
                <p className="text-[#D9AD61]/90">
                  Championship stage, grand finale, and ₹1,25,000 valedictory prize distribution. Specific venue announcement and timings to follow.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Where We Have Been Before Section (Verbatim from Brochure Page 7) */}
        <div className="p-8 rounded-2xl bg-[#180000] border border-[#B9873F]/30 space-y-6">
          <div className="text-center space-y-1">
            <span className="text-[11px] font-serif-luxury uppercase tracking-widest text-[#D9AD61]">
              Virtuoso Tradition of Five-Star Grandeur
            </span>
            <h3 className="font-serif-luxury text-2xl font-bold text-[#FFFFFF]">
              WHERE WE HAVE BEEN BEFORE
            </h3>
            <p className="text-xs text-[#B9873F]">
              Virtuoso has consistently partnered with Bengaluru's finest international luxury hotels.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {venuesPast.map((v) => (
              <div
                key={v.name}
                className="p-5 rounded-xl bg-[#200000] border border-[#B9873F]/20 text-center space-y-2 hover:border-[#D9AD61] transition-colors"
              >
                <Building className="w-6 h-6 text-[#D9AD61] mx-auto" />
                <h4 className="font-serif-luxury text-base font-bold text-[#FFFFFF]">
                  {v.name}
                </h4>
                <p className="text-[11px] text-[#B9873F] font-sans-clean">
                  {v.tag}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Mandatory Preparation & Logistics */}
        <div className="p-6 rounded-xl bg-[#330205]/60 border border-[#B9873F]/30 space-y-4">
          <div className="flex items-center gap-2 text-sm font-serif-luxury text-[#FFFFFF] font-bold">
            <Laptop className="w-4 h-4 text-[#D9AD61]" />
            <span>MANDATORY HARDWARE & LOGISTICS PROTOCOL</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-[#D9AD61]/90">
            <div className="p-3 rounded bg-[#200000]/60 border border-[#B9873F]/20">
              <strong className="text-[#FFFFFF] block mb-1">Western Formals</strong>
              Suit / formal blazer attire required at all times during both days of the fest.
            </div>
            <div className="p-3 rounded bg-[#200000]/60 border border-[#B9873F]/20">
              <strong className="text-[#FFFFFF] block mb-1">Personal Laptops</strong>
              All participants must compulsorily carry functional laptops and chargers.
            </div>
            <div className="p-3 rounded bg-[#200000]/60 border border-[#B9873F]/20">
              <strong className="text-[#FFFFFF] block mb-1">Dongles & Pen Drives</strong>
              All contingents must carry backup internet dongles and USB flash drives.
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="text-center pt-4">
          <button
            onClick={() => onRouteChange('registration')}
            className="px-8 py-3 text-xs uppercase tracking-widest font-semibold text-[#200000] bg-gradient-to-r from-[#F0D18B] to-[#D9AD61] rounded hover:brightness-110 transition-all"
          >
            Register Your Contingent Today
          </button>
        </div>
      </div>
    </div>
  );
};
