import React, { useState } from 'react';
import { AppRoute } from '../../types';
import { GoldDivider } from '../common/GoldDivider';
import { openOfficialBrochure, getBrochureBlobUrl } from '../../utils/brochureHelper';
import { BrochureViewerModal } from '../common/BrochureViewerModal';
import { SJCCLocationMap } from '../common/SJCCLocationMap';
import { MapPin, Phone, Mail, FileText, ExternalLink, ShieldCheck, Loader2, BookOpen } from 'lucide-react';

interface FooterProps {
  onRouteChange: (route: AppRoute) => void;
}

export const Footer: React.FC<FooterProps> = ({ onRouteChange }) => {
  const [isOpeningBrochure, setIsOpeningBrochure] = useState(false);
  const [isBrochureModalOpen, setIsBrochureModalOpen] = useState(false);

  const handleBrochureClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setIsBrochureModalOpen(true);
  };

  return (
    <footer className="w-full bg-[#160000] border-t border-[#B9873F]/25 text-[#F0D18B] pt-16 pb-12 font-sans-clean">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Brand Banner Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 items-start">
          {/* Col 1: Official Emblem & Institution */}
          <div className="md:col-span-5 space-y-4">
            <div className="flex items-center gap-5">
              <img
                src="/assets/aistudio/image_01353a37.png"
                alt="St. Joseph's College of Commerce Official Logo"
                className="h-12 w-auto object-contain"
              />
              <img
                src="/assets/aistudio/image_3098a2ec.png"
                alt="B.B.A. Bachelor of Business Administration Official Logo"
                className="h-8 w-auto object-contain"
              />
            </div>

            <div>
              <h4 className="font-serif-luxury text-xl font-bold tracking-wider text-[#FFFFFF]">
                VIRTUOSO 2026–27
              </h4>
              <p className="text-xs uppercase tracking-widest text-[#D9AD61] font-serif-luxury mt-0.5">
                Heirs of the Solstice
              </p>
            </div>

            <p className="text-xs text-[#D9AD61]/80 leading-relaxed max-w-md">
              Presented by the Department of Business Administration, St. Joseph's College of Commerce (Autonomous), Bengaluru. One of India's premier national-level undergraduate management fests.
            </p>

            <div className="flex items-center gap-2 text-xs text-[#B9873F]">
              <span>Established 1882</span>
              <span aria-hidden="true">·</span>
              <span>NAAC A++ (RAF Cycle 4)</span>
              <span aria-hidden="true">·</span>
              <span>Autonomous</span>
            </div>
          </div>

          {/* Col 2: Navigation Links */}
          <div className="md:col-span-3 space-y-3">
            <h5 className="font-serif-luxury text-sm font-semibold tracking-wider text-[#FFFFFF] uppercase">
              Fest Directory
            </h5>
            <ul className="space-y-2 text-xs text-[#D9AD61]/80">
              <li>
                <button
                  onClick={() => { onRouteChange('home'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="hover:text-[#FFFFFF] transition-colors"
                >
                  Home & Overview
                </button>
              </li>
              <li>
                <button
                  onClick={() => { onRouteChange('theme'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="hover:text-[#FFFFFF] transition-colors"
                >
                  Theme: Heirs of the Solstice
                </button>
              </li>
              <li>
                <button
                  onClick={() => { onRouteChange('schedule-venue'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="hover:text-[#FFFFFF] transition-colors"
                >
                  Schedule & Five-Star Venues
                </button>
              </li>
              <li>
                <button
                  onClick={() => { onRouteChange('rules'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="hover:text-[#FFFFFF] transition-colors"
                >
                  Rules & Contingent Guidelines
                </button>
              </li>
              <li>
                <button
                  onClick={() => { onRouteChange('registration'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="hover:text-[#FFFFFF] transition-colors text-[#F0D18B] font-semibold"
                >
                  Register Contingent (₹7,000)
                </button>
              </li>
              <li>
                <button
                  onClick={() => { onRouteChange('payment'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="hover:text-[#FFFFFF] transition-colors"
                >
                  Payment Information Portal
                </button>
              </li>
              <li>
                <button
                  onClick={() => { onRouteChange('brochure'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="hover:text-[#FFFFFF] transition-colors text-[#D9AD61]"
                >
                  Official Brochure Dossier (11 Pages)
                </button>
              </li>
            </ul>
          </div>

          {/* Col 3: Official Secretariat & Contacts */}
          <div className="md:col-span-4 space-y-3">
            <h5 className="font-serif-luxury text-sm font-semibold tracking-wider text-[#FFFFFF] uppercase">
              Secretariat & Venue
            </h5>
            <div className="space-y-2 text-xs text-[#D9AD61]/80">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-[#B9873F] shrink-0 mt-0.5" />
                <span>
                  St. Joseph's College of Commerce (Autonomous),<br />
                  163, Brigade Rd, Shanthala Nagar, Ashok Nagar,<br />
                  Bengaluru, Karnataka 560025
                </span>
              </div>

              {/* Clickable Google Map for St. Joseph's College of Commerce */}
              <SJCCLocationMap variant="footer" />

              <div className="flex items-center gap-2 pt-1">
                <Phone className="w-4 h-4 text-[#B9873F] shrink-0" />
                <span>Noel Joseph Prabhu: +91 80880 06881</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-[#B9873F] shrink-0" />
                <span>Yashas S: +91 70260 22668</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#B9873F] shrink-0" />
                <span>bbacoordinator@gmail.com</span>
              </div>
            </div>

            {/* Official Brochure Action */}
            <div className="pt-2">
              <a
                href="/virtuoso-brochure.pdf"
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleBrochureClick}
                onMouseEnter={() => { getBrochureBlobUrl().catch(() => {}); }}
                className="inline-flex items-center gap-2 text-xs font-semibold px-3.5 py-2 rounded border border-[#B9873F]/40 hover:border-[#F0D18B] text-[#F0D18B] hover:text-[#FFFFFF] bg-[#200000] transition-colors"
              >
                {isOpeningBrochure ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 text-[#D9AD61] animate-spin" />
                    <span>Opening Official Brochure...</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-3.5 h-3.5 text-[#D9AD61]" />
                    <span>View Official Brochure PDF</span>
                    <ExternalLink className="w-3 h-3 text-[#B9873F]" />
                  </>
                )}
              </a>
            </div>
          </div>
        </div>

        <GoldDivider withStar={true} className="my-10" />

        {/* Institutional Bottom Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-[#B9873F]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#D9AD61]" />
            <span>
              Official Fest Portal • Department of Business Administration, SJCC Bengaluru.
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => { onRouteChange('about-sjcc'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className="hover:text-[#FFFFFF] transition-colors"
            >
              About SJCC
            </button>
            <span>·</span>
            <button
              onClick={() => { onRouteChange('about-department'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className="hover:text-[#FFFFFF] transition-colors"
            >
              BBA Department
            </button>
            <span>·</span>
            <button
              onClick={() => { onRouteChange('contact'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className="hover:text-[#FFFFFF] transition-colors"
            >
              Contact Coordinators
            </button>
          </div>

          <div>
            <span>Dates: 4th & 5th December 2026</span>
          </div>
        </div>
      </div>

      {/* Official Brochure In-App Viewer Modal */}
      <BrochureViewerModal
        isOpen={isBrochureModalOpen}
        onClose={() => setIsBrochureModalOpen(false)}
      />
    </footer>
  );
};
