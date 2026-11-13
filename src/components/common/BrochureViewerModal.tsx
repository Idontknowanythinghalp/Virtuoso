import React, { useState, useEffect } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  BookOpen,
  FileText,
  Building,
  Trophy,
  Shield,
  Phone,
  Sparkles,
  Calendar,
  Users,
} from 'lucide-react';
import { openOfficialBrochure } from '../../utils/brochureHelper';

interface BrochureViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface BrochurePageData {
  pageNumber: number;
  title: string;
  subtitle?: string;
  content: React.ReactNode;
}

export const BrochureViewerModal: React.FC<BrochureViewerModalProps> = ({ isOpen, onClose }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<'interactive' | 'pdf'>('interactive');
  const totalPages = 11;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setCurrentPage((p) => Math.min(totalPages, p + 1));
      if (e.key === 'ArrowLeft') setCurrentPage((p) => Math.max(1, p - 1));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const pages: Record<number, BrochurePageData> = {
    1: {
      pageNumber: 1,
      title: 'VIRTUOSO 2026–27',
      subtitle: 'HEIRS OF THE SOLSTICE • OFFICIAL FEST BROCHURE',
      content: (
        <div className="text-center py-6 sm:py-10 space-y-6">
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

          <div className="p-2 inline-block rounded-2xl bg-[#330205] border border-[#B9873F]/40 shadow-2xl">
            <img
              src="/assets/aistudio/image_1df213dd.png"
              alt="Virtuoso Solstice Emblem"
              className="w-36 h-48 sm:w-44 sm:h-56 object-cover rounded-xl mx-auto shadow-inner"
            />
          </div>

          <div className="space-y-2">
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

          <p className="text-xs text-[#D9AD61]/80 max-w-md mx-auto">
            St. Joseph's College of Commerce (Autonomous) • 163 Brigade Road, Bengaluru 560025
          </p>
        </div>
      ),
    },
    2: {
      pageNumber: 2,
      title: 'ABOUT SJCC',
      subtitle: 'Institutional Legacy Since 1882',
      content: (
        <div className="space-y-5 text-xs sm:text-sm text-[#D9AD61]/90 leading-relaxed text-justify">
          <p>
            St. Joseph’s College of Commerce (SJCC), formerly a part of St. Joseph’s College, established in the year 1882, is managed by the Bangalore Jesuit Educational Society (BJES). The Commerce Department was established in the year 1949 and it became an independent college with its own building in Brigade Road in the year 1972. The college has in its Vision a model for higher education which encourages individuals to dream of a socially just world and in its Mission a strategy to empower individuals in realizing that dream.
          </p>
          <p>
            With an objective of imparting quality education in the field of Commerce and Management, the college has been innovating in all aspects of higher education over a long period of time. These innovations were further bolstered with the granting of autonomous status to the college by UGC in September 2005.
          </p>
          <div className="p-4 rounded-xl bg-[#330205]/70 border border-[#B9873F]/30 space-y-2">
            <div className="font-display text-sm font-bold text-[#FFFFFF]">Key Accreditations & Recognitions</div>
            <ul className="space-y-1.5 text-xs text-[#F0D18B]">
              <li>• NAAC A++ Accredited in the 4th Cycle under RAF (First College in Karnataka)</li>
              <li>• Declared 'College with Potential for Excellence' in 2010</li>
              <li>• Recognized as a Research Centre by Bangalore University in 2011</li>
              <li>• Consistently ranked among Top 100 Colleges in India by NIRF (Ministry of Education)</li>
            </ul>
          </div>
        </div>
      ),
    },
    3: {
      pageNumber: 3,
      title: 'ABOUT THE DEPARTMENT',
      subtitle: 'Department of Business Administration',
      content: (
        <div className="space-y-5 text-xs sm:text-sm text-[#D9AD61]/90 leading-relaxed text-justify">
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
      ),
    },
    4: {
      pageNumber: 4,
      title: 'VIRTUOSO 2026–27',
      subtitle: 'One of India’s Premier Management Fests',
      content: (
        <div className="space-y-5 text-xs sm:text-sm text-[#D9AD61]/90 leading-relaxed">
          <p>
            The Department of Business Administration, St. Joseph's College of Commerce, presents Virtuoso, a "State-Of-The-Art" national level inter-collegiate management fest, on the 4th and 5th December, 2026. We extend a warm and exclusive invitation for a contingent of four distinguished members from your esteemed institution to compete in a series of challenging rounds.
          </p>
          <div className="p-4 rounded-xl bg-[#330205]/80 border border-[#B9873F]/30 space-y-3">
            <h4 className="font-display text-sm font-bold text-[#FFFFFF] uppercase tracking-wider">
              Contingent Composition (Exactly 4 Executives)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 rounded bg-[#200000] border border-[#B9873F]/20">
                <strong className="text-[#FFFFFF] block">Strategy / Best Manager</strong>
                Driving strategic decisions and managing overall team outcomes.
              </div>
              <div className="p-2.5 rounded bg-[#200000] border border-[#B9873F]/20">
                <strong className="text-[#FFFFFF] block">Marketing & PR</strong>
                Devising innovative strategies and acting as effective spokesperson.
              </div>
              <div className="p-2.5 rounded bg-[#200000] border border-[#B9873F]/20">
                <strong className="text-[#FFFFFF] block">Finance</strong>
                Invaluable risk analysis and sound financial governance under pressure.
              </div>
              <div className="p-2.5 rounded bg-[#200000] border border-[#B9873F]/20">
                <strong className="text-[#FFFFFF] block">Human Resources (HR)</strong>
                Shaping team dynamic and adding crucial human leadership elements.
              </div>
            </div>
          </div>
          <p className="text-[11px] text-[#F0D18B] italic">
            "Set against the grandeur of one of Bengaluru's finest five-star hotels, the fest promises an extraordinary confluence of intellect, strategy, and ambition."
          </p>
        </div>
      ),
    },
    5: {
      pageNumber: 5,
      title: 'ABOUT THE THEME',
      subtitle: 'Heirs of the Solstice',
      content: (
        <div className="space-y-4 text-xs sm:text-sm text-[#D9AD61]/90 leading-relaxed text-justify">
          <blockquote className="p-4 rounded-xl bg-[#330205]/90 border-l-4 border-[#D9AD61] italic text-[#F0D18B] font-serif">
            "The solstice is the moment the sun reaches its highest or lowest point and appears to stand still before the world turns. For centuries, people have seen it as a threshold, a point where one age ends and another begins. An heir stands at a similar turning point. The inheritance is never only wealth or power. It is also a trust, a name and a responsibility, and what an heir does with it decides whether the legacy grows, fades or is lost."
          </blockquote>
          <p>
            Every business leader is an heir to something: a family enterprise, a startup built by someone else, a team’s trust or a reputation earned over years. Leaders face their own solstice moments, when a decision tests whether they will protect what they were given or spend it for short-term gain. Succession, trust, ambition and accountability decide how organisations survive and how leaders are remembered. Power can be inherited, but credibility has to be earned again and again.
          </p>
          <p>
            Will you hold on to power for its own sake, or use it with vision and integrity? Will you build alliances on trust or on convenience? At this juncture, Virtuoso calls on emerging leaders to step forward as heirs, not only of opportunity but of responsibility.
          </p>
        </div>
      ),
    },
    6: {
      pageNumber: 6,
      title: 'VENUES',
      subtitle: 'Day 1 & Day 2 Settings',
      content: (
        <div className="space-y-6">
          <div className="p-5 rounded-xl bg-[#330205] border border-[#B9873F]/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-display tracking-widest text-[#D9AD61]">
                DAY 1 • 4TH DECEMBER 2026
              </span>
              <span className="text-[10px] uppercase font-bold text-[#200000] bg-[#D9AD61] px-2 py-0.5 rounded">
                Campus Arena
              </span>
            </div>
            <h4 className="font-display text-xl font-bold text-[#FFFFFF]">
              St. Joseph's College of Commerce (Autonomous)
            </h4>
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
            <h4 className="font-display text-xl font-bold text-[#FFFFFF]">
              To Be Announced
            </h4>
            <p className="text-xs text-[#D9AD61]">
              Bengaluru Premier Five-Star Hotel Arena
            </p>
          </div>
        </div>
      ),
    },
    7: {
      pageNumber: 7,
      title: 'WHERE WE HAVE BEEN BEFORE',
      subtitle: 'Virtuoso 5-Star Hospitality Tradition',
      content: (
        <div className="space-y-4">
          <p className="text-xs text-[#D9AD61]/90">
            Continuing Virtuoso's esteemed legacy of partnering with Bengaluru's finest five-star hospitality landmarks:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-[#330205] border border-[#B9873F]/30 text-center space-y-1">
              <Building className="w-6 h-6 text-[#D9AD61] mx-auto" />
              <h5 className="font-display text-sm font-bold text-[#FFFFFF]">JW MARRIOTT</h5>
              <p className="text-[10px] text-[#B9873F]">Bengaluru</p>
            </div>
            <div className="p-4 rounded-xl bg-[#330205] border border-[#B9873F]/30 text-center space-y-1">
              <Building className="w-6 h-6 text-[#D9AD61] mx-auto" />
              <h5 className="font-display text-sm font-bold text-[#FFFFFF]">HYATT CENTRIC</h5>
              <p className="text-[10px] text-[#B9873F]">MG Road Bengaluru</p>
            </div>
            <div className="p-4 rounded-xl bg-[#330205] border border-[#B9873F]/30 text-center space-y-1">
              <Building className="w-6 h-6 text-[#D9AD61] mx-auto" />
              <h5 className="font-display text-sm font-bold text-[#FFFFFF]">COURTYARD BY MARRIOTT</h5>
              <p className="text-[10px] text-[#B9873F]">Bengaluru</p>
            </div>
          </div>
        </div>
      ),
    },
    8: {
      pageNumber: 8,
      title: 'PRIZE POOL OF ₹1,25,000',
      subtitle: 'UP FOR GRABS!',
      content: (
        <div className="text-center py-6 space-y-6">
          <div className="p-6 rounded-2xl bg-gradient-to-r from-[#4B0507] via-[#330205] to-[#4B0507] border-2 border-[#D9AD61] shadow-2xl inline-block max-w-sm mx-auto">
            <Trophy className="w-10 h-10 text-[#F0D18B] mx-auto mb-2" />
            <span className="text-xs uppercase tracking-widest text-[#D9AD61] font-display block">
              TOTAL FEST STAKES
            </span>
            <div className="font-display text-3xl sm:text-4xl font-extrabold text-[#FFFFFF] mt-1">
              ₹1,25,000
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
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
      ),
    },
    9: {
      pageNumber: 9,
      title: 'RULES & REGULATIONS',
      subtitle: 'Official Institutional Stipulations',
      content: (
        <div className="space-y-3 text-xs text-[#D9AD61]/90">
          <div className="p-3 rounded-lg bg-[#330205] border border-[#B9873F]/25 flex items-start gap-3">
            <span className="font-display font-bold text-[#F0D18B]">1.</span>
            <span>Maximum of one contingent represents a college or department, and each college or department may enrol a maximum of one contingent.</span>
          </div>
          <div className="p-3 rounded-lg bg-[#330205] border border-[#B9873F]/25 flex items-start gap-3">
            <span className="font-display font-bold text-[#F0D18B]">2.</span>
            <span>The team should consist of exactly four members. No cross-college teams will be permitted to participate in the fest.</span>
          </div>
          <div className="p-3 rounded-lg bg-[#330205] border border-[#B9873F]/25 flex items-start gap-3">
            <span className="font-display font-bold text-[#F0D18B]">3.</span>
            <span>The organizing committee will allocate a secretary to each contingent, who will be the point of contact for all assistance required.</span>
          </div>
          <div className="p-3 rounded-lg bg-[#330205] border border-[#B9873F]/25 flex items-start gap-3">
            <span className="font-display font-bold text-[#F0D18B]">4.</span>
            <span>The use of back-end teams or any assistance beyond that of the four executives is prohibited, and if participants are found engaging in such activities, they will be disqualified.</span>
          </div>
          <div className="p-3 rounded-lg bg-[#330205] border border-[#B9873F]/25 flex items-start gap-3">
            <span className="font-display font-bold text-[#F0D18B]">5.</span>
            <span>Participants must be dressed in western formals and maintain decorum at all times. All participants must compulsorily carry laptops, internet dongles, and pen drives.</span>
          </div>
          <div className="p-3 rounded-lg bg-[#330205] border border-[#B9873F]/25 flex items-start gap-3">
            <span className="font-display font-bold text-[#F0D18B]">6.</span>
            <span>The decision of the Core Committee and the Management of St. Joseph’s College of Commerce will be final and binding.</span>
          </div>
        </div>
      ),
    },
    10: {
      pageNumber: 10,
      title: 'REGISTRATION',
      subtitle: 'Contingent Enrolment & Fee Structure',
      content: (
        <div className="text-center py-6 space-y-6">
          <div className="p-6 rounded-2xl bg-[#330205] border border-[#B9873F]/40 max-w-md mx-auto space-y-2">
            <span className="text-xs uppercase tracking-widest text-[#D9AD61] font-display">
              REGISTRATION AMOUNT
            </span>
            <div className="font-display text-3xl font-extrabold text-[#FFFFFF]">
              ₹7,000
            </div>
            <p className="text-xs text-[#D9AD61]">
              (Per contingent team of exactly 4 members)
            </p>
          </div>

          <p className="text-xs text-[#F0D18B] max-w-sm mx-auto">
            Final Payment link and official SJCC institutional details will be shared soon with registered contingent leaders.
          </p>

          <div className="p-3 rounded-xl bg-[#200000] border border-[#B9873F]/25 text-xs text-[#D9AD61] inline-block">
            FOLLOW US FOR MORE UPDATES
          </div>
        </div>
      ),
    },
    11: {
      pageNumber: 11,
      title: 'VIRTUOSO COORDINATORS',
      subtitle: 'Official Secretariat Contacts',
      content: (
        <div className="max-w-md mx-auto space-y-4 py-4">
          <div className="p-4 rounded-xl bg-[#330205] border border-[#B9873F]/30 space-y-1 text-center">
            <div className="font-display text-sm font-bold text-[#FFFFFF]">Noel Joseph Prabhu</div>
            <div className="text-xs text-[#D9AD61]">BBA Coordinator</div>
            <div className="text-xs text-[#F0D18B] font-semibold pt-1">+91 80880 06881</div>
          </div>

          <div className="p-4 rounded-xl bg-[#330205] border border-[#B9873F]/30 space-y-1 text-center">
            <div className="font-display text-sm font-bold text-[#FFFFFF]">Yashas S</div>
            <div className="text-xs text-[#D9AD61]">BBA Entrepreneurship Coordinator</div>
            <div className="text-xs text-[#F0D18B] font-semibold pt-1">+91 70260 22668</div>
          </div>

          <div className="p-3 rounded-xl bg-[#200000] border border-[#B9873F]/25 text-center text-xs text-[#D9AD61]">
            <span>Official Email: </span>
            <a href="mailto:bbacoordinator@gmail.com" className="text-[#F0D18B] font-semibold hover:underline">
              bbacoordinator@gmail.com
            </a>
          </div>
        </div>
      ),
    },
  };

  const current = pages[currentPage];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#120000]/95 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-[#200000] border-2 border-[#B9873F]/50 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Top Header Bar */}
        <div className="p-4 bg-gradient-to-r from-[#330205] via-[#200000] to-[#330205] border-b border-[#B9873F]/30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#4B0507] border border-[#B9873F]/40">
              <BookOpen className="w-4 h-4 text-[#F0D18B]" />
            </div>
            <div>
              <div className="font-display text-sm font-bold text-[#FFFFFF] tracking-wider">
                VIRTUOSO 2026–27 BROCHURE
              </div>
              <div className="text-[11px] text-[#D9AD61]">
                Official 11-Page Event Dossier • SJCC Bengaluru
              </div>
            </div>
          </div>

          {/* Action buttons on the header */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center rounded-lg bg-[#180000] border border-[#B9873F]/30 p-0.5 text-xs">
              <button
                onClick={() => setViewMode('interactive')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  viewMode === 'interactive' ? 'bg-[#D9AD61] text-[#200000] font-bold' : 'text-[#D9AD61] hover:text-[#FFFFFF]'
                }`}
              >
                Page Reader
              </button>
              <button
                onClick={() => setViewMode('pdf')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  viewMode === 'pdf' ? 'bg-[#D9AD61] text-[#200000] font-bold' : 'text-[#D9AD61] hover:text-[#FFFFFF]'
                }`}
              >
                PDF Embed
              </button>
            </div>

            <a
              href="/virtuoso-brochure.pdf"
              download="Virtuoso_2026_Official_Brochure.pdf"
              className="px-3 py-1.5 text-xs font-semibold text-[#200000] bg-gradient-to-r from-[#F0D18B] to-[#D9AD61] hover:brightness-110 rounded transition-all flex items-center gap-1.5 shadow"
              title="Download official PDF (43 MB)"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </a>

            <button
              onClick={() => openOfficialBrochure()}
              className="px-3 py-1.5 text-xs font-medium text-[#F0D18B] hover:text-[#FFFFFF] border border-[#B9873F]/40 hover:border-[#F0D18B] rounded transition-colors flex items-center gap-1.5"
              title="Open PDF in new window"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Tab</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-[#D9AD61] hover:text-[#FFFFFF] hover:bg-[#330205] rounded-lg transition-colors ml-1"
              aria-label="Close brochure modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-[#180000]">
          {viewMode === 'interactive' ? (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="text-center pb-4 border-b border-[#B9873F]/20">
                <span className="text-[10px] font-display uppercase tracking-widest text-[#B9873F]">
                  PAGE {current.pageNumber} OF {totalPages}
                </span>
                <h3 className="font-display text-2xl font-bold text-[#FFFFFF] mt-1">
                  {current.title}
                </h3>
                {current.subtitle && (
                  <p className="text-xs text-[#D9AD61] mt-0.5 tracking-wider font-display">
                    {current.subtitle}
                  </p>
                )}
              </div>

              {current.content}
            </div>
          ) : (
            <div className="w-full h-[65vh] flex flex-col items-center justify-center">
              <object
                data="/virtuoso-brochure.pdf"
                type="application/pdf"
                className="w-full h-full rounded-xl border border-[#B9873F]/30"
              >
                <div className="p-8 text-center space-y-4">
                  <FileText className="w-12 h-12 text-[#D9AD61] mx-auto" />
                  <p className="text-sm text-[#F0D18B]">
                    Your browser does not support in-page PDF embeds.
                  </p>
                  <a
                    href="/virtuoso-brochure.pdf"
                    download="Virtuoso_2026_Official_Brochure.pdf"
                    className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-[#200000] bg-gradient-to-r from-[#F0D18B] to-[#D9AD61] rounded"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Official PDF (43 MB)</span>
                  </a>
                </div>
              </object>
            </div>
          )}
        </div>

        {/* Bottom Pagination & Navigation Controls */}
        <div className="p-3 sm:p-4 bg-[#200000] border-t border-[#B9873F]/30 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-xs font-medium text-[#F0D18B] bg-[#330205] border border-[#B9873F]/30 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:border-[#D9AD61] transition-colors flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Prev</span>
            </button>

            <span className="text-xs font-display text-[#D9AD61] px-2">
              Page {currentPage} / {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-xs font-medium text-[#F0D18B] bg-[#330205] border border-[#B9873F]/30 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:border-[#D9AD61] transition-colors flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Page Jump Pills */}
          <div className="hidden md:flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((num) => (
              <button
                key={num}
                onClick={() => setCurrentPage(num)}
                className={`w-7 h-7 text-[11px] font-display rounded transition-all ${
                  currentPage === num
                    ? 'bg-[#D9AD61] text-[#200000] font-bold shadow'
                    : 'text-[#B9873F] hover:text-[#FFFFFF] hover:bg-[#330205]'
                }`}
              >
                {num}
              </button>
            ))}
          </div>

          <div className="text-[11px] text-[#B9873F] hidden sm:block">
            Use <kbd className="px-1 py-0.5 rounded bg-[#330205] text-[#F0D18B] border border-[#B9873F]/20">←</kbd> <kbd className="px-1 py-0.5 rounded bg-[#330205] text-[#F0D18B] border border-[#B9873F]/20">→</kbd> arrow keys to navigate
          </div>
        </div>
      </div>
    </div>
  );
};
