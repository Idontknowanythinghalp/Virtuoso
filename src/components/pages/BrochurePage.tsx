/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AppRoute } from '../../types';
import { GoldDivider } from '../common/GoldDivider';
import {
  FileText,
  Download,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Calendar,
  Building,
  Trophy,
  Shield,
  Phone,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';

interface BrochurePageProps {
  onRouteChange: (route: AppRoute) => void;
}

export const BrochurePage: React.FC<BrochurePageProps> = ({ onRouteChange }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<'reader' | 'pdf'>('reader');
  const totalPages = 11;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setCurrentPage((p) => Math.min(totalPages, p + 1));
      if (e.key === 'ArrowLeft') setCurrentPage((p) => Math.max(1, p - 1));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const pageTitles: Record<number, { title: string; subtitle: string }> = {
    1: { title: 'VIRTUOSO 2026–27', subtitle: 'HEIRS OF THE SOLSTICE • OFFICIAL DOSSIER' },
    2: { title: 'ABOUT SJCC', subtitle: 'Institutional Legacy Since 1882' },
    3: { title: 'ABOUT THE DEPARTMENT', subtitle: 'Department of Business Administration' },
    4: { title: 'ABOUT VIRTUOSO', subtitle: 'National Undergraduate Management Fest' },
    5: { title: 'HEIRS OF THE SOLSTICE', subtitle: 'The Official Solstice Theme' },
    6: { title: 'VENUES & DATES', subtitle: 'Day 1 & Day 2 Arenas' },
    7: { title: 'WHERE WE HAVE BEEN BEFORE', subtitle: 'Five-Star Hospitality Tradition' },
    8: { title: 'PRIZE POOL OF ₹1,25,000', subtitle: 'Official Stakes & Recognition' },
    9: { title: 'RULES & REGULATIONS', subtitle: 'Contingent Guidelines & Code of Conduct' },
    10: { title: 'REGISTRATION & FEES', subtitle: 'Contingent Enrolment (₹7,000)' },
    11: { title: 'CONTACT & SECRETARIAT', subtitle: 'Student Coordinators & Campus Office' },
  };

  return (
    <div className="w-full min-h-screen bg-[#200000] text-[#F0D18B] py-10 md:py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Navigation Breadcrumb / Back button */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <button
            onClick={() => onRouteChange('home')}
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#D9AD61] hover:text-[#FFFFFF] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Home</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="inline-flex p-1 rounded-lg bg-[#330205] border border-[#B9873F]/30 text-xs">
              <button
                onClick={() => setViewMode('reader')}
                className={`px-3 py-1.5 rounded font-medium transition-colors ${
                  viewMode === 'reader'
                    ? 'bg-gradient-to-r from-[#F0D18B] to-[#D9AD61] text-[#200000] font-semibold'
                    : 'text-[#D9AD61] hover:text-[#FFFFFF]'
                }`}
              >
                11-Page Reader
              </button>
              <button
                onClick={() => setViewMode('pdf')}
                className={`px-3 py-1.5 rounded font-medium transition-colors ${
                  viewMode === 'pdf'
                    ? 'bg-gradient-to-r from-[#F0D18B] to-[#D9AD61] text-[#200000] font-semibold'
                    : 'text-[#D9AD61] hover:text-[#FFFFFF]'
                }`}
              >
                Embedded PDF
              </button>
            </div>

            <a
              href="/virtuoso-brochure.pdf"
              download="virtuoso-2026-brochure.pdf"
              className="px-3.5 py-1.5 text-xs font-semibold text-[#200000] bg-gradient-to-r from-[#F0D18B] to-[#D9AD61] rounded hover:brightness-110 transition-all flex items-center gap-1.5 shadow"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </a>

            <a
              href="/virtuoso-brochure.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs font-medium text-[#D9AD61] hover:text-[#FFFFFF] border border-[#B9873F]/40 hover:border-[#D9AD61] rounded transition-colors flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Tab</span>
            </a>
          </div>
        </div>

        {/* Page Header */}
        <div className="text-center space-y-3">
          <span className="text-xs uppercase tracking-[0.25em] text-[#D9AD61] font-display">
            Official Document Archive
          </span>
          <h1 className="font-display text-3xl sm:text-5xl font-extrabold text-[#FFFFFF] tracking-wide">
            Virtuoso 2026 Official Brochure
          </h1>
          <p className="text-xs sm:text-sm text-[#D9AD61]/80 max-w-xl mx-auto">
            Authorized 11-page fest dossier presented by the Department of Business Administration, St. Joseph's College of Commerce (Autonomous).
          </p>
          <GoldDivider withStar={true} />
        </div>

        {/* Main Viewing Area */}
        {viewMode === 'pdf' ? (
          /* PDF Object / Iframe Embed */
          <div className="rounded-2xl bg-[#140000] border border-[#B9873F]/40 overflow-hidden shadow-2xl h-[700px] flex flex-col">
            <div className="p-3.5 bg-[#200000] border-b border-[#B9873F]/25 flex items-center justify-between text-xs text-[#D9AD61]">
              <span className="font-display">PDF Document Stream: virtuoso-brochure.pdf</span>
              <a
                href="/virtuoso-brochure.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#FFFFFF] flex items-center gap-1 text-[11px]"
              >
                <span>Full screen</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <object
              data="/virtuoso-brochure.pdf#toolbar=1"
              type="application/pdf"
              className="w-full flex-1"
            >
              <div className="p-8 text-center my-auto space-y-4">
                <FileText className="w-12 h-12 text-[#D9AD61] mx-auto" />
                <h3 className="font-display text-xl font-bold text-[#FFFFFF]">
                  Direct PDF Access Ready
                </h3>
                <p className="text-xs text-[#D9AD61]/90 max-w-md mx-auto">
                  Your browser does not support embedded PDF rendering, or is configured for mobile download. Use the direct link below:
                </p>
                <div className="flex justify-center gap-3 pt-2">
                  <a
                    href="/virtuoso-brochure.pdf"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-5 py-2.5 text-xs font-semibold text-[#200000] bg-gradient-to-r from-[#F0D18B] to-[#D9AD61] rounded shadow"
                  >
                    Open PDF in New Tab
                  </a>
                  <button
                    onClick={() => setViewMode('reader')}
                    className="px-4 py-2.5 text-xs font-semibold text-[#F0D18B] border border-[#B9873F]/40 rounded hover:border-[#F0D18B]"
                  >
                    Switch to 11-Page Reader
                  </button>
                </div>
              </div>
            </object>
          </div>
        ) : (
          /* Interactive 11-Page Dossier Reader */
          <div className="rounded-2xl bg-gradient-to-b from-[#330205] to-[#200000] border border-[#B9873F]/40 overflow-hidden shadow-2xl space-y-0">
            {/* Page Header Bar */}
            <div className="p-5 sm:p-6 bg-[#200000]/90 border-b border-[#B9873F]/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-display uppercase tracking-widest text-[#D9AD61] block">
                  PAGE {currentPage} OF {totalPages}
                </span>
                <h2 className="font-display text-xl sm:text-2xl font-bold text-[#FFFFFF]">
                  {pageTitles[currentPage]?.title}
                </h2>
                <p className="text-xs text-[#D9AD61]/80 mt-0.5">
                  {pageTitles[currentPage]?.subtitle}
                </p>
              </div>

              {/* Prev / Next controls */}
              <div className="flex items-center gap-2">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-3.5 py-1.5 text-xs font-medium text-[#F0D18B] bg-[#330205] border border-[#B9873F]/30 hover:border-[#D9AD61] disabled:opacity-30 disabled:hover:border-[#B9873F]/30 rounded flex items-center gap-1 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Prev</span>
                </button>
                <span className="text-xs font-mono text-[#D9AD61] px-2">
                  {currentPage} / {totalPages}
                </span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3.5 py-1.5 text-xs font-medium text-[#F0D18B] bg-[#330205] border border-[#B9873F]/30 hover:border-[#D9AD61] disabled:opacity-30 disabled:hover:border-[#B9873F]/30 rounded flex items-center gap-1 transition-colors"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Page Content Body */}
            <div className="p-6 sm:p-10 min-h-[460px] flex flex-col justify-center">
              {currentPage === 1 && (
                <div className="text-center py-6 space-y-6 max-w-xl mx-auto">
                  <div className="flex items-center justify-center gap-6">
                    <img
                      src="/assets/aistudio/image_01353a37.png"
                      alt="SJCC Logo"
                      className="h-14 sm:h-16 w-auto object-contain"
                    />
                    <div className="h-8 w-px bg-[#B9873F]/40" />
                    <img
                      src="/assets/aistudio/image_3098a2ec.png"
                      alt="BBA Logo"
                      className="h-10 sm:h-12 w-auto object-contain"
                    />
                  </div>

                  <div className="p-3 inline-block rounded-2xl bg-[#330205] border border-[#B9873F]/40 shadow-2xl">
                    <img
                      src="/assets/aistudio/image_1df213dd.png"
                      alt="Virtuoso Solstice Emblem"
                      className="w-36 h-48 sm:w-44 sm:h-56 object-cover rounded-xl mx-auto shadow-inner"
                    />
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs sm:text-sm font-display tracking-[0.25em] uppercase text-[#D9AD61]">
                      Department of Business Administration Presents
                    </p>
                    <h1 className="font-display text-4xl sm:text-5xl font-extrabold text-[#FFFFFF] tracking-wider">
                      VIRTUOSO
                    </h1>
                    <p className="font-display text-lg sm:text-2xl text-[#F0D18B] tracking-[0.25em] uppercase">
                      HEIRS OF THE SOLSTICE
                    </p>
                  </div>

                  <div className="pt-2 text-sm sm:text-base font-semibold text-[#FFFFFF] flex items-center justify-center gap-2">
                    <Calendar className="w-4 h-4 text-[#D9AD61]" />
                    <span>4th & 5th DECEMBER 2026</span>
                  </div>

                  <p className="text-xs text-[#D9AD61]/80">
                    St. Joseph's College of Commerce (Autonomous) • 163 Brigade Road, Bengaluru 560025
                  </p>
                </div>
              )}

              {currentPage === 2 && (
                <div className="space-y-5 text-xs sm:text-sm text-[#D9AD61]/90 leading-relaxed text-justify max-w-3xl mx-auto">
                  <p>
                    St. Joseph’s College of Commerce (SJCC), formerly a part of St. Joseph’s College, established in the year 1882, is managed by the Bangalore Jesuit Educational Society (BJES). The Commerce Department was established in the year 1949 and it became an independent college with its own building in Brigade Road in the year 1972. The college has in its Vision a model for higher education which encourages individuals to dream of a socially just world and in its Mission a strategy to empower individuals in realizing that dream.
                  </p>
                  <p>
                    With an objective of imparting quality education in the field of Commerce and Management, the college has been innovating in all aspects of higher education over a long period of time. These innovations were further bolstered with the granting of autonomous status to the college by UGC in September 2005.
                  </p>
                  <div className="p-5 rounded-xl bg-[#330205]/70 border border-[#B9873F]/30 space-y-2">
                    <div className="font-display text-sm font-bold text-[#FFFFFF]">Key Accreditations & Recognitions</div>
                    <ul className="space-y-1.5 text-xs text-[#F0D18B]">
                      <li>• NAAC A++ Accredited in the 4th Cycle under RAF (First College in Karnataka)</li>
                      <li>• Declared 'College with Potential for Excellence' in 2010</li>
                      <li>• Recognized as a Research Centre by Bangalore University in 2011</li>
                      <li>• Consistently ranked among Top 100 Colleges in India by NIRF (Ministry of Education)</li>
                    </ul>
                  </div>
                </div>
              )}

              {currentPage === 3 && (
                <div className="space-y-5 text-xs sm:text-sm text-[#D9AD61]/90 leading-relaxed text-justify max-w-3xl mx-auto">
                  <p>
                    With the world of business changing constantly and technology gaining a strong foothold across the country, it is of utmost importance to build management talent and resources at every level. The strategies and goals of any educational institution must be continually redefined to keep pace with the external environment. This led to the birth of the Department of Business Administration at St. Joseph’s College of Commerce (Autonomous) in the academic year 2004–2005.
                  </p>
                  <p>
                    Within a short period, the department has emerged as a promising centre for management studies at the undergraduate level. It aims to motivate students to take up higher studies in management, so that they may blossom into effective entrepreneurs unafraid of taking risks, teachers and researchers who contribute positively to society, or consultants who help business units leverage management knowledge.
                  </p>
                  <p>
                    As the startup ecosystem grew, the department introduced the BBA (Entrepreneurship) programme in 2017–2018, designed to cultivate entrepreneurial talent and resources. The curriculum is revised regularly with the Board of Studies so that it stays in step with industry needs and emerging areas such as AI, sustainability, and data-driven decision-making.
                  </p>
                </div>
              )}

              {currentPage === 4 && (
                <div className="space-y-5 text-xs sm:text-sm text-[#D9AD61]/90 leading-relaxed text-justify max-w-3xl mx-auto">
                  <p>
                    The Department of Business Administration, St. Joseph’s College of Commerce, presents Virtuoso, a "State-Of-The-Art" national level inter-collegiate management fest, on the 4th and 5th December, 2026. We extend a warm and exclusive invitation for a contingent of four distinguished members from your esteemed institution to compete in a series of challenging rounds.
                  </p>
                  <p>
                    At Virtuoso, excellence is not merely expected—it is the baseline. As one of the premier business fests in India, Virtuoso brings together top management contingents from premier universities and institutions across the nation.
                  </p>
                  <div className="p-5 rounded-xl bg-[#330205] border border-[#B9873F]/30 space-y-2">
                    <h3 className="font-display text-sm font-bold text-[#FFFFFF] uppercase tracking-wider">
                      Crucible Focus:
                    </h3>
                    <ul className="space-y-1.5 text-xs text-[#F0D18B]">
                      <li>• Strategic boardroom decision-making under simulated market volatility</li>
                      <li>• Brand advocacy, unconventional crisis pitches, and media interrogation</li>
                      <li>• Capital allocation, treasury governance, and investment stress-tests</li>
                      <li>• Team dynamics, negotiation, and high-pressure collective leadership</li>
                    </ul>
                  </div>
                </div>
              )}

              {currentPage === 5 && (
                <div className="space-y-5 text-xs sm:text-sm text-[#D9AD61]/90 leading-relaxed text-justify max-w-3xl mx-auto">
                  <p className="first-letter:text-4xl first-letter:font-serif-luxury first-letter:font-bold first-letter:float-left first-letter:mr-2 first-letter:text-[#FFFFFF]">
                    The solstice is the moment the sun reaches its highest or lowest point and appears to stand still before the world turns. For centuries, people have seen it as a threshold, a point where one age ends and another begins. An heir stands at a similar turning point. The inheritance is never only wealth or power. It is also a trust, a name and a responsibility, and what an heir does with it decides whether the legacy grows, fades or is lost.
                  </p>
                  <p>
                    Every business leader is an heir to something: a family enterprise, a startup built by someone else, a team’s trust or a reputation earned over years. Leaders face their own solstice moments, when a decision tests whether they will protect what they were given or spend it for short-term gain. Succession, trust, ambition and accountability decide how organisations survive and how leaders are remembered. Power can be inherited, but credibility has to be earned again and again.
                  </p>
                  <div className="p-5 rounded-xl bg-[#4B0507]/60 border border-[#B9873F]/40 text-center italic font-cormorant text-lg sm:text-xl text-[#FFFFFF]">
                    "At Virtuoso, Heirs of the Solstice is a metaphor for leadership at its turning point. The fest is not just a stage for showcasing skill. It asks participants what legacy they will leave."
                  </div>
                </div>
              )}

              {currentPage === 6 && (
                <div className="space-y-6 max-w-2xl mx-auto">
                  <div className="p-5 rounded-xl bg-[#330205] border border-[#B9873F]/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase font-display tracking-widest text-[#D9AD61]">
                        DAY 1 • 4TH DECEMBER 2026
                      </span>
                      <span className="text-[10px] uppercase font-bold text-[#200000] bg-[#D9AD61] px-2 py-0.5 rounded">
                        Campus Arena
                      </span>
                    </div>
                    <h3 className="font-display text-xl font-bold text-[#FFFFFF]">
                      St. Joseph's College of Commerce (Autonomous)
                    </h3>
                    <p className="text-xs text-[#D9AD61]">
                      163, Brigade Rd, Shanthala Nagar, Ashok Nagar, Bengaluru, Karnataka 560025
                    </p>
                  </div>

                  <div className="p-5 rounded-xl bg-[#330205] border border-[#B9873F]/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase font-display tracking-widest text-[#D9AD61]">
                        DAY 2 • 5TH DECEMBER 2026
                      </span>
                      <span className="text-[10px] uppercase font-bold text-[#F0D18B] border border-[#D9AD61] px-2 py-0.5 rounded">
                        Grand Finals
                      </span>
                    </div>
                    <h3 className="font-display text-xl font-bold text-[#FFFFFF]">
                      To Be Announced
                    </h3>
                    <p className="text-xs text-[#D9AD61]">
                      Bengaluru Premier Five-Star Hotel Arena
                    </p>
                  </div>
                </div>
              )}

              {currentPage === 7 && (
                <div className="space-y-6 max-w-2xl mx-auto text-center">
                  <p className="text-xs text-[#D9AD61]/90">
                    Continuing Virtuoso's esteemed tradition of partnering with Bengaluru's finest five-star hospitality landmarks:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-5 rounded-xl bg-[#330205] border border-[#B9873F]/30 space-y-2">
                      <Building className="w-6 h-6 text-[#D9AD61] mx-auto" />
                      <h4 className="font-display text-base font-bold text-[#FFFFFF]">JW MARRIOTT</h4>
                      <p className="text-[11px] text-[#B9873F]">Bengaluru</p>
                    </div>
                    <div className="p-5 rounded-xl bg-[#330205] border border-[#B9873F]/30 space-y-2">
                      <Building className="w-6 h-6 text-[#D9AD61] mx-auto" />
                      <h4 className="font-display text-base font-bold text-[#FFFFFF]">HYATT CENTRIC</h4>
                      <p className="text-[11px] text-[#B9873F]">MG Road Bengaluru</p>
                    </div>
                    <div className="p-5 rounded-xl bg-[#330205] border border-[#B9873F]/30 space-y-2">
                      <Building className="w-6 h-6 text-[#D9AD61] mx-auto" />
                      <h4 className="font-display text-base font-bold text-[#FFFFFF]">COURTYARD BY MARRIOTT</h4>
                      <p className="text-[11px] text-[#B9873F]">Bengaluru</p>
                    </div>
                  </div>
                </div>
              )}

              {currentPage === 8 && (
                <div className="text-center py-6 space-y-6 max-w-md mx-auto">
                  <div className="p-6 rounded-2xl bg-gradient-to-r from-[#4B0507] via-[#330205] to-[#4B0507] border-2 border-[#D9AD61] shadow-2xl">
                    <Trophy className="w-10 h-10 text-[#F0D18B] mx-auto mb-2" />
                    <span className="text-xs uppercase tracking-widest text-[#D9AD61] font-display block">
                      TOTAL FEST STAKES
                    </span>
                    <div className="font-display text-3xl sm:text-4xl font-extrabold text-[#FFFFFF] mt-1">
                      ₹1,25,000
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-[#330205] border border-[#B9873F]/40 text-center">
                      <span className="text-[11px] uppercase tracking-wider text-[#D9AD61] block">WINNERS</span>
                      <span className="font-display text-2xl font-bold text-[#FFFFFF] mt-1 block">₹75,000</span>
                    </div>
                    <div className="p-4 rounded-xl bg-[#330205] border border-[#B9873F]/40 text-center">
                      <span className="text-[11px] uppercase tracking-wider text-[#D9AD61] block">RUNNERS UP</span>
                      <span className="font-display text-2xl font-bold text-[#FFFFFF] mt-1 block">₹50,000</span>
                    </div>
                  </div>
                </div>
              )}

              {currentPage === 9 && (
                <div className="space-y-3 text-xs text-[#D9AD61]/90 max-w-3xl mx-auto">
                  <div className="p-3.5 rounded-lg bg-[#330205] border border-[#B9873F]/25 flex items-start gap-3">
                    <span className="font-display font-bold text-[#F0D18B]">1.</span>
                    <span>Maximum of one contingent represents a college or department, and each college or department may enrol a maximum of one contingent.</span>
                  </div>
                  <div className="p-3.5 rounded-lg bg-[#330205] border border-[#B9873F]/25 flex items-start gap-3">
                    <span className="font-display font-bold text-[#F0D18B]">2.</span>
                    <span>The team should consist of exactly four members. No cross-college teams will be permitted to participate in the fest.</span>
                  </div>
                  <div className="p-3.5 rounded-lg bg-[#330205] border border-[#B9873F]/25 flex items-start gap-3">
                    <span className="font-display font-bold text-[#F0D18B]">3.</span>
                    <span>The organizing committee will allocate a secretary to each contingent, who will be the point of contact for all assistance required.</span>
                  </div>
                  <div className="p-3.5 rounded-lg bg-[#330205] border border-[#B9873F]/25 flex items-start gap-3">
                    <span className="font-display font-bold text-[#F0D18B]">4.</span>
                    <span>The use of back-end teams or any assistance beyond that of the four executives is prohibited, and if participants are found engaging in such activities, they will be disqualified.</span>
                  </div>
                  <div className="p-3.5 rounded-lg bg-[#330205] border border-[#B9873F]/25 flex items-start gap-3">
                    <span className="font-display font-bold text-[#F0D18B]">5.</span>
                    <span>Participants must be dressed in western formals and maintain decorum at all times. All participants must compulsorily carry laptops, internet dongles, and pen drives.</span>
                  </div>
                  <div className="p-3.5 rounded-lg bg-[#330205] border border-[#B9873F]/25 flex items-start gap-3">
                    <span className="font-display font-bold text-[#F0D18B]">6.</span>
                    <span>The decision of the Core Committee and the Management of St. Joseph’s College of Commerce will be final and binding.</span>
                  </div>
                </div>
              )}

              {currentPage === 10 && (
                <div className="text-center py-6 space-y-6 max-w-md mx-auto">
                  <div className="p-6 rounded-2xl bg-[#330205] border border-[#B9873F]/40 space-y-2">
                    <span className="text-xs uppercase tracking-widest text-[#D9AD61] font-display">
                      REGISTRATION AMOUNT
                    </span>
                    <div className="font-display text-3xl sm:text-4xl font-extrabold text-[#FFFFFF]">
                      ₹7,000
                    </div>
                    <p className="text-xs text-[#D9AD61]">
                      (Per contingent team of exactly 4 members)
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-[#200000] border border-[#B9873F]/30 text-xs text-[#D9AD61]/80 space-y-1">
                    <p className="font-semibold text-[#FFFFFF]">Payment Processing</p>
                    <p>Processed through official St. Joseph's College of Commerce infrastructure.</p>
                  </div>

                  <button
                    onClick={() => onRouteChange('registration')}
                    className="w-full py-3 text-xs uppercase tracking-widest font-semibold text-[#200000] bg-gradient-to-r from-[#F0D18B] to-[#D9AD61] rounded hover:brightness-110 transition-all font-sans-clean"
                  >
                    Open Contingent Registration
                  </button>
                </div>
              )}

              {currentPage === 11 && (
                <div className="max-w-2xl mx-auto space-y-6">
                  <div className="p-6 rounded-2xl bg-[#330205] border border-[#B9873F]/40 space-y-4">
                    <h3 className="font-display text-base font-bold text-[#FFFFFF] uppercase tracking-wider">
                      Student Fest Coordinators
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div className="p-3.5 rounded-lg bg-[#200000] border border-[#B9873F]/25 space-y-1">
                        <span className="font-display font-bold text-[#FFFFFF] block">Noel Joseph Prabhu</span>
                        <a href="tel:+918088006881" className="text-[#D9AD61] hover:text-[#FFFFFF] block">
                          +91 80880 06881
                        </a>
                      </div>
                      <div className="p-3.5 rounded-lg bg-[#200000] border border-[#B9873F]/25 space-y-1">
                        <span className="font-display font-bold text-[#FFFFFF] block">Yashas S</span>
                        <a href="tel:+917026022668" className="text-[#D9AD61] hover:text-[#FFFFFF] block">
                          +91 70260 22668
                        </a>
                      </div>
                    </div>
                  </div>

                  <div className="p-5 rounded-xl bg-[#330205] border border-[#B9873F]/30 space-y-2 text-xs text-[#D9AD61]/90">
                    <span className="font-display font-bold text-[#FFFFFF] block">Official Inquiries & Desk</span>
                    <p>Email: <a href="mailto:bbacoordinator@gmail.com" className="text-[#F0D18B] underline">bbacoordinator@gmail.com</a></p>
                    <p>Department of Business Administration, St. Joseph's College of Commerce (Autonomous), 163 Brigade Road, Bengaluru 560025.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Page Thumbnails / Jump Bar */}
            <div className="p-4 bg-[#1a0000] border-t border-[#B9873F]/25 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[11px] text-[#B9873F]">
                Quick page jump:
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((num) => (
                  <button
                    key={num}
                    onClick={() => setCurrentPage(num)}
                    className={`w-7 h-7 rounded text-xs font-mono font-medium transition-all ${
                      currentPage === num
                        ? 'bg-[#D9AD61] text-[#200000] font-bold shadow'
                        : 'bg-[#330205] text-[#D9AD61] hover:text-[#FFFFFF] hover:bg-[#4B0507]'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
