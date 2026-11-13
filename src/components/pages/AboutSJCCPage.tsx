import React from 'react';
import { AppRoute } from '../../types';
import { GoldDivider } from '../common/GoldDivider';
import { Award, Shield, BookOpen, Star, Building, CheckCircle } from 'lucide-react';

interface AboutSJCCPageProps {
  onRouteChange: (route: AppRoute) => void;
}

export const AboutSJCCPage: React.FC<AboutSJCCPageProps> = ({ onRouteChange }) => {
  return (
    <div className="w-full min-h-screen bg-[#200000] text-[#F0D18B] py-12 md:py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <img
              src="/assets/aistudio/image_01353a37.png"
              alt="Official St. Joseph's College of Commerce Logo"
              className="h-20 w-auto object-contain"
            />
          </div>
          <span className="text-xs uppercase tracking-[0.25em] text-[#D9AD61] font-serif-luxury">
            Institutional Legacy Since 1882
          </span>
          <h1 className="font-serif-luxury text-4xl sm:text-5xl font-extrabold text-[#FFFFFF]">
            ABOUT SJCC
          </h1>
          <p className="text-xs uppercase tracking-widest text-[#B9873F] font-serif-luxury">
            St. Joseph’s College of Commerce (Autonomous)
          </p>
        </div>

        <GoldDivider withStar={true} />

        {/* Narrative Verbatim from Brochure Page 2 */}
        <div className="prose prose-invert max-w-none space-y-6 font-sans-clean text-sm sm:text-base leading-relaxed text-[#F0D18B]/90">
          <p className="first-letter:text-5xl first-letter:font-serif-luxury first-letter:font-bold first-letter:float-left first-letter:mr-3 first-letter:text-[#FFFFFF] first-letter:mt-1 leading-relaxed">
            St. Joseph’s College of Commerce (SJCC), formerly a part of St. Joseph’s College, established in the year 1882, is managed by the Bangalore Jesuit Educational Society (BJES). The Commerce Department was established in the year 1949 and it became an independent college with its own building in Brigade Road in the year 1972. The college has in its Vision a model for higher education which encourages individuals to dream of a socially just world and in its Mission a strategy to empower individuals in realizing that dream. With an objective of imparting quality education in the field of Commerce and Management, the college has been innovating in all aspects of higher education over a long period of time. These innovations were further bolstered with the granting of autonomous status to the college by UGC in September 2005.
          </p>

          <p>
            The college has undergone four cycles of NAAC accreditation starting from the year 2000 onwards in which it secured ‘five stars’, next in the year 2007 an ‘A’ grade, in the year 2012 again an ‘A’ grade and recently in February 2021 an ‘A++’. It is one of the very few institutions in the country to have secured A++ grade in the fourth cycle under the Revised Accreditation Framework (RAF) and the first college in Karnataka to do so. The college was declared as a ‘College with Potential for Excellence’ in the year 2010. In 2011 SJCC was recognized as a Research Centre by Bangalore University. The college has consistently been ranked among the top 100 colleges in the country by the National Institutional Ranking Framework (NIRF), Ministry of Education, Government of India, since its inception in 2017.
          </p>
        </div>

        {/* Milestone Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
          <div className="p-5 rounded-xl bg-[#330205] border border-[#B9873F]/30 text-center space-y-1">
            <Building className="w-5 h-5 text-[#D9AD61] mx-auto" />
            <div className="font-serif-luxury text-xl font-bold text-[#FFFFFF]">1882</div>
            <div className="text-[11px] text-[#B9873F] uppercase tracking-wider">Foundation Year</div>
          </div>
          <div className="p-5 rounded-xl bg-[#330205] border border-[#B9873F]/30 text-center space-y-1">
            <Award className="w-5 h-5 text-[#D9AD61] mx-auto" />
            <div className="font-serif-luxury text-xl font-bold text-[#FFFFFF]">NAAC A++</div>
            <div className="text-[11px] text-[#B9873F] uppercase tracking-wider">RAF Cycle 4 (1st in KA)</div>
          </div>
          <div className="p-5 rounded-xl bg-[#330205] border border-[#B9873F]/30 text-center space-y-1">
            <Star className="w-5 h-5 text-[#D9AD61] mx-auto" />
            <div className="font-serif-luxury text-xl font-bold text-[#FFFFFF]">UGC Autonomous</div>
            <div className="text-[11px] text-[#B9873F] uppercase tracking-wider">Granted Sept 2005</div>
          </div>
          <div className="p-5 rounded-xl bg-[#330205] border border-[#B9873F]/30 text-center space-y-1">
            <Shield className="w-5 h-5 text-[#D9AD61] mx-auto" />
            <div className="font-serif-luxury text-xl font-bold text-[#FFFFFF]">NIRF Top 100</div>
            <div className="text-[11px] text-[#B9873F] uppercase tracking-wider">Ministry of Education</div>
          </div>
        </div>

        {/* Action Link */}
        <div className="text-center pt-6">
          <button
            onClick={() => onRouteChange('about-department')}
            className="px-6 py-2.5 text-xs uppercase tracking-widest font-semibold text-[#F0D18B] border border-[#B9873F]/40 hover:border-[#D9AD61] rounded transition-colors"
          >
            Explore Department of Business Administration →
          </button>
        </div>
      </div>
    </div>
  );
};
