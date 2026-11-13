import React, { useState } from 'react';
import { Menu, X, ArrowUpRight, Award, Compass, Shield, BookOpen, CreditCard, FileText } from 'lucide-react';
import { AppRoute } from '../../types';
import { openOfficialBrochure } from '../../utils/brochureHelper';
import { BrochureViewerModal } from '../common/BrochureViewerModal';
import { useSound } from '../../contexts/SoundContext';

interface NavbarProps {
  currentRoute: AppRoute;
  onRouteChange: (route: AppRoute) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentRoute, onRouteChange }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isBrochureModalOpen, setIsBrochureModalOpen] = useState(false);
  const { playClick } = useSound();

  const primaryNavItems: { label: string; route: AppRoute }[] = [
    { label: 'Theme', route: 'theme' },
    { label: 'Schedule & Venues', route: 'schedule-venue' },
    { label: 'Rules', route: 'rules' },
    { label: 'About', route: 'about-virtuoso' },
    { label: 'Brochure', route: 'brochure' },
  ];

  const allSubNavItems: { label: string; route: AppRoute; description: string; icon: React.ReactNode }[] = [
    {
      label: 'Home',
      route: 'home',
      description: 'Theatrical introduction, dates & highlights',
      icon: <Compass className="w-4 h-4 text-[#D9AD61]" />,
    },
    {
      label: 'Heirs of the Solstice',
      route: 'theme',
      description: 'Philosophical treatise on leadership & succession',
      icon: <Award className="w-4 h-4 text-[#D9AD61]" />,
    },
    {
      label: 'Schedule & Venues',
      route: 'schedule-venue',
      description: 'Day 1 SJCC & Day 2 5-Star Hotel Venue',
      icon: <Compass className="w-4 h-4 text-[#D9AD61]" />,
    },
    {
      label: 'Rules & Regulations',
      route: 'rules',
      description: 'Strict 4-member guidelines & decorum',
      icon: <Shield className="w-4 h-4 text-[#D9AD61]" />,
    },
    {
      label: 'About Virtuoso',
      route: 'about-virtuoso',
      description: 'India premier management fest legacy',
      icon: <BookOpen className="w-4 h-4 text-[#D9AD61]" />,
    },
    {
      label: 'About SJCC',
      route: 'about-sjcc',
      description: 'Heritage since 1882 & NAAC A++ accreditation',
      icon: <BookOpen className="w-4 h-4 text-[#D9AD61]" />,
    },
    {
      label: 'About Department',
      route: 'about-department',
      description: 'Department of Business Administration & BBA',
      icon: <BookOpen className="w-4 h-4 text-[#D9AD61]" />,
    },
    {
      label: 'Contingent Registration',
      route: 'registration',
      description: '8-step institutional registration portal',
      icon: <Award className="w-4 h-4 text-[#D9AD61]" />,
    },
    {
      label: 'Payment Information',
      route: 'payment',
      description: 'Official SJCC fee notice & gateway status',
      icon: <CreditCard className="w-4 h-4 text-[#D9AD61]" />,
    },
    {
      label: 'Contact Coordinators',
      route: 'contact',
      description: 'Official coordinators, phone numbers & email',
      icon: <Compass className="w-4 h-4 text-[#D9AD61]" />,
    },
    {
      label: 'Official Brochure Dossier',
      route: 'brochure',
      description: 'Authorized 11-page fest brochure & PDF download',
      icon: <FileText className="w-4 h-4 text-[#D9AD61]" />,
    },
  ];

  const handleNavClick = (route: AppRoute) => {
    onRouteChange(route);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-[#200000] border-b border-[#B9873F]/20 shadow-lg">
      {/* Official Institutional Header: SJCC on Left, BBA on Right */}
      <div className="w-full bg-[#200000] border-b border-[#B9873F]/15 px-4 sm:px-6 lg:px-8 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Official SJCC Logo on the left */}
          <div className="flex items-center gap-3">
            <img
              src="/assets/aistudio/image_01353a37.png"
              alt="St. Joseph's College of Commerce (Autonomous)"
              className="h-10 sm:h-12 w-auto object-contain"
            />
            <div className="hidden sm:block text-left">
              <span className="text-xs sm:text-sm font-serif-luxury font-bold text-[#FFFFFF] tracking-wide block leading-tight">
                St. Joseph's College of Commerce
              </span>
              <span className="text-[10px] text-[#D9AD61] tracking-wider uppercase block font-sans-clean">
                (Autonomous) • Bengaluru • Estd. 1882
              </span>
            </div>
          </div>

          {/* Official BBA Logo on the right */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <span className="text-xs sm:text-sm font-serif-luxury font-bold text-[#FFFFFF] tracking-wide block leading-tight">
                Department of Business Administration
              </span>
              <span className="text-[10px] text-[#D9AD61] tracking-wider uppercase block font-sans-clean">
                B.B.A. & B.B.A. (Entrepreneurship)
              </span>
            </div>
            <img
              src="/assets/aistudio/image_3098a2ec.png"
              alt="B.B.A. Bachelor of Business Administration"
              className="h-7 sm:h-9 w-auto object-contain"
            />
          </div>
        </div>
      </div>

      {/* Primary Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark */}
        <button
          onClick={() => handleNavClick('home')}
          className="flex items-center gap-3 text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D9AD61] rounded"
          aria-label="Virtuoso 2026 Home"
        >
          <img
            src="/assets/aistudio/image_1df213dd.png"
            alt="Virtuoso Solstice Emblem"
            className="w-9 h-9 object-contain rounded border border-[#B9873F]/30 shadow-md group-hover:border-[#F0D18B] transition-colors"
          />
          <div className="whitespace-nowrap shrink-0">
            <span className="font-serif-luxury text-base md:text-lg font-bold tracking-wider text-[#F0D18B] group-hover:text-[#FFFFFF] transition-colors block leading-tight">
              VIRTUOSO <span className="text-xs font-normal text-[#D9AD61]/80 tracking-widest uppercase">2026</span>
            </span>
            <span className="text-[9px] tracking-widest uppercase text-[#B9873F] block font-sans-clean">
              Heirs of the Solstice
            </span>
          </div>
        </button>

        {/* Zone 2: 4-5 Clean Nav Links */}
        <nav className="hidden lg:flex items-center gap-8 text-sm font-medium text-[#F0D18B]/80 font-sans-clean">
          {primaryNavItems.map((item) => (
            <button
              key={item.route}
              onClick={() => handleNavClick(item.route)}
              className={`whitespace-nowrap shrink-0 transition-colors py-1 border-b-2 ${
                currentRoute === item.route
                  ? 'text-[#FFFFFF] border-[#D9AD61] font-semibold'
                  : 'border-transparent hover:text-[#FFFFFF] hover:border-[#B9873F]/40'
              }`}
            >
              {item.label}
            </button>
          ))}

          {/* Quick Dropdown/Overview Modal Trigger */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="whitespace-nowrap shrink-0 text-xs text-[#D9AD61] hover:text-[#FFFFFF] border border-[#B9873F]/30 hover:border-[#F0D18B] px-2.5 py-1 rounded transition-colors flex items-center gap-1.5"
            aria-label="View all fest pages and guides"
          >
            <span>All Sections</span>
            <span className="text-[10px] bg-[#4B0507] px-1.5 py-0.5 rounded text-[#F0D18B] font-mono">{allSubNavItems.length}</span>
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center gap-3 shrink-0">

          <button
            onClick={() => {
              playClick();
              handleNavClick('registration');
            }}
            className="hidden sm:inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold uppercase tracking-wider text-[#200000] bg-gradient-to-r from-[#F0D18B] via-[#D9AD61] to-[#B9873F] rounded hover:brightness-110 active:scale-95 transition-all shadow-[0_0_15px_rgba(185,135,63,0.3)] btn-gold-glow whitespace-nowrap shrink-0"
          >
            <span>Register Contingent</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>

          {/* Mobile hamburger button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 text-[#F0D18B] hover:text-[#FFFFFF] rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D9AD61]"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Comprehensive Navigation Overlay (Mobile & All Sections Explorer) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 top-20 bg-[#200000]/98 backdrop-blur-xl z-50 overflow-y-auto border-t border-[#B9873F]/20 p-6 animate-fadeIn">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-[#B9873F]/20">
              <div>
                <h3 className="font-serif-luxury text-lg text-[#F0D18B] tracking-wide">
                  Virtuoso 2026 Navigation Directory
                </h3>
                <p className="text-xs text-[#B9873F] mt-0.5">
                  Department of Business Administration • St. Joseph's College of Commerce
                </p>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-[#D9AD61] hover:text-[#FFFFFF] rounded border border-[#B9873F]/30"
                aria-label="Close directory"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {allSubNavItems.map((item) => (
                <button
                  key={item.route}
                  onClick={() => handleNavClick(item.route)}
                  className={`text-left p-3.5 rounded border transition-all flex items-start gap-3 group ${
                    currentRoute === item.route
                      ? 'bg-[#4B0507]/90 border-[#D9AD61] text-[#FFFFFF]'
                      : 'bg-[#330205]/60 border-[#B9873F]/20 hover:border-[#D9AD61]/60 hover:bg-[#4B0507]/40 text-[#F0D18B]'
                  }`}
                >
                  <div className="p-2 rounded bg-[#200000] border border-[#B9873F]/30 shrink-0 group-hover:border-[#D9AD61]">
                    {item.icon}
                  </div>
                  <div>
                    <div className="font-serif-luxury text-sm font-semibold tracking-wide flex items-center gap-1.5">
                      <span>{item.label}</span>
                      {currentRoute === item.route && (
                        <span className="text-[10px] text-[#200000] bg-[#D9AD61] px-1.5 py-0.5 rounded font-sans-clean font-bold">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#D9AD61]/70 font-sans-clean mt-0.5 line-clamp-1">
                      {item.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {/* Quick Action Button in Directory */}
            <div className="pt-4 border-t border-[#B9873F]/20 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-[#B9873F]">
                Fest Dates: 4th & 5th December 2026 • Registration: ₹7,000 / Contingent
              </div>
              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                <a
                  href="/virtuoso-brochure.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    e.preventDefault();
                    setIsBrochureModalOpen(true);
                  }}
                  className="flex-1 sm:flex-initial px-4 py-2 text-xs font-semibold border border-[#B9873F]/40 text-[#D9AD61] hover:text-[#FFFFFF] rounded hover:border-[#D9AD61] transition-colors inline-flex items-center gap-1.5 justify-center"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Brochure (11 Pages)</span>
                </a>
                <button
                  onClick={() => handleNavClick('payment')}
                  className="flex-1 sm:flex-initial px-4 py-2 text-xs font-semibold border border-[#D9AD61]/40 text-[#F0D18B] hover:text-[#FFFFFF] rounded hover:border-[#D9AD61] transition-colors"
                >
                  Payment Status
                </button>
                <button
                  onClick={() => handleNavClick('registration')}
                  className="flex-1 sm:flex-initial px-5 py-2 text-xs font-semibold uppercase tracking-wider text-[#200000] bg-gradient-to-r from-[#F0D18B] to-[#D9AD61] rounded hover:brightness-110 transition-all font-sans-clean"
                >
                  Register Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Official Brochure In-App Viewer Modal */}
      <BrochureViewerModal
        isOpen={isBrochureModalOpen}
        onClose={() => setIsBrochureModalOpen(false)}
      />
    </header>
  );
};
