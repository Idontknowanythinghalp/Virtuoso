import React from 'react';
import { AppRoute } from '../../types';
import { GoldDivider } from '../common/GoldDivider';
import { BookOpen, Rocket, Lightbulb, Users, ArrowRight } from 'lucide-react';

interface AboutDepartmentPageProps {
  onRouteChange: (route: AppRoute) => void;
}

export const AboutDepartmentPage: React.FC<AboutDepartmentPageProps> = ({ onRouteChange }) => {
  return (
    <div className="w-full min-h-screen bg-[#200000] text-[#F0D18B] py-12 md:py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <img
              src="/assets/aistudio/image_3098a2ec.png"
              alt="Official B.B.A. Bachelor of Business Administration Logo"
              className="h-12 w-auto object-contain"
            />
          </div>
          <span className="text-xs uppercase tracking-[0.25em] text-[#D9AD61] font-serif-luxury">
            Academic Center of Excellence
          </span>
          <h1 className="font-serif-luxury text-4xl sm:text-5xl font-extrabold text-[#FFFFFF]">
            ABOUT THE DEPARTMENT
          </h1>
          <p className="text-xs uppercase tracking-widest text-[#B9873F] font-serif-luxury">
            Department of Business Administration • St. Joseph’s College of Commerce
          </p>
        </div>

        <GoldDivider withStar={true} />

        {/* Narrative Verbatim from Brochure Page 3 */}
        <div className="prose prose-invert max-w-none space-y-6 font-sans-clean text-sm sm:text-base leading-relaxed text-[#F0D18B]/90">
          <p className="first-letter:text-5xl first-letter:font-serif-luxury first-letter:font-bold first-letter:float-left first-letter:mr-3 first-letter:text-[#FFFFFF] first-letter:mt-1 leading-relaxed">
            With the world of business changing constantly and technology gaining a strong foothold across the country, it is of utmost importance to build management talent and resources at every level. The strategies and goals of any educational institution must be continually redefined to keep pace with the external environment. This led to the birth of the Department of Business Administration at St. Joseph’s College of Commerce (Autonomous) in the academic year 2004-2005. Within a short period, the department has emerged as a promising centre for management studies at the undergraduate level. It aims to motivate students to take up higher studies in management, so that they may blossom into effective entrepreneurs unafraid of taking risks, teachers and researchers who contribute positively to society, or consultants who help business units leverage management knowledge.
          </p>

          <p>
            As the startup ecosystem grew, the department introduced the BBA (Entrepreneurship) programme in 2017-2018, designed to cultivate entrepreneurial talent and resources. The programme offers a dynamic combination of hands-on business creation experience, contemporary entrepreneurial education and a globally focused perspective. Students acquire the skills and confidence to ideate, launch and scale their own ventures, backed by a solid grasp of management fundamentals.
          </p>

          {/* Pedagogy Callout */}
          <div className="p-6 rounded-xl bg-gradient-to-r from-[#330205] to-[#4B0507] border border-[#B9873F]/30 my-6">
            <h3 className="font-serif-luxury text-lg font-bold text-[#FFFFFF] mb-2">
              Next-Generation Management Curriculum
            </h3>
            <p className="text-xs sm:text-sm text-[#F0D18B]/95 leading-relaxed">
              The curriculum is revised regularly with the Board of Studies so that it stays in step with industry needs and emerging areas such as AI, sustainability and data-driven decision-making. Learning goes beyond the classroom, with real business problems, industry engagement and mentorship at every stage, so that graduates are confident, adaptable and ready to lead, whether they start a business, join one or shape the future of management itself. In doing so, the department contributes to a vibrant startup ecosystem.
            </p>
          </div>
        </div>

        {/* Core Department Pillars */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2">
          <div className="p-6 rounded-xl bg-[#330205] border border-[#B9873F]/30 space-y-2">
            <Rocket className="w-5 h-5 text-[#D9AD61]" />
            <h4 className="font-serif-luxury text-base font-bold text-[#FFFFFF]">Venture Creation</h4>
            <p className="text-xs text-[#D9AD61]/80 leading-relaxed">
              BBA (Entrepreneurship) incubating fearless founders and resilient business architects.
            </p>
          </div>
          <div className="p-6 rounded-xl bg-[#330205] border border-[#B9873F]/30 space-y-2">
            <Lightbulb className="w-5 h-5 text-[#D9AD61]" />
            <h4 className="font-serif-luxury text-base font-bold text-[#FFFFFF]">AI & Sustainability</h4>
            <p className="text-xs text-[#D9AD61]/80 leading-relaxed">
              Regularly revised curriculum integrating cutting-edge analytics and ESG stewardship.
            </p>
          </div>
          <div className="p-6 rounded-xl bg-[#330205] border border-[#B9873F]/30 space-y-2">
            <Users className="w-5 h-5 text-[#D9AD61]" />
            <h4 className="font-serif-luxury text-base font-bold text-[#FFFFFF]">Industry Mentorship</h4>
            <p className="text-xs text-[#D9AD61]/80 leading-relaxed">
              Real business case challenges, executive juries, and national management platforms.
            </p>
          </div>
        </div>

        {/* Action Link */}
        <div className="text-center pt-4">
          <button
            onClick={() => onRouteChange('registration')}
            className="px-8 py-3 text-xs uppercase tracking-widest font-semibold text-[#200000] bg-gradient-to-r from-[#F0D18B] to-[#D9AD61] rounded hover:brightness-110 transition-all inline-flex items-center gap-2"
          >
            <span>Register Contingent for Virtuoso 2026</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
