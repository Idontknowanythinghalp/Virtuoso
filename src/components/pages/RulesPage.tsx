import React from 'react';
import { AppRoute } from '../../types';
import { GoldDivider } from '../common/GoldDivider';
import { Shield, AlertTriangle, Users, Laptop, Scale, UserCheck, ArrowRight, HelpCircle } from 'lucide-react';

interface RulesPageProps {
  onRouteChange: (route: AppRoute) => void;
}

export const RulesPage: React.FC<RulesPageProps> = ({ onRouteChange }) => {
  const officialRules = [
    {
      num: '01',
      title: 'Institutional Representation & Limit',
      text: 'Maximum of one contingent represents a college or department, and each college or department may enrol a maximum of one contingent.',
      icon: <Users className="w-5 h-5 text-[#D9AD61]" />,
    },
    {
      num: '02',
      title: 'Contingent Composition & Anti-Cross Teaming',
      text: 'The team should consist of exactly four members. No cross-college teams will be permitted to participate in the fest. The contingent leader is one of the four executives.',
      icon: <UserCheck className="w-5 h-5 text-[#D9AD61]" />,
    },
    {
      num: '03',
      title: 'Dedicated Organizing Secretary',
      text: 'The organizing committee will allocate a secretary to each contingent, who will be the official point of contact for all assistance and round briefings required.',
      icon: <Shield className="w-5 h-5 text-[#D9AD61]" />,
    },
    {
      num: '04',
      title: 'Strict Prohibition of Back-End Teams',
      text: 'The use of back-end teams or any assistance beyond that of the four executives is strictly prohibited, and if participants are found engaging in such activities, they will be disqualified immediately.',
      icon: <AlertTriangle className="w-5 h-5 text-[#F0D18B]" />,
    },
    {
      num: '05',
      title: 'Dress Code & Mandatory Hardware',
      text: 'Participants must be dressed in western formals and maintain decorum at all times. All participants must compulsorily carry laptops, internet dongles, and pen drives.',
      icon: <Laptop className="w-5 h-5 text-[#D9AD61]" />,
    },
    {
      num: '06',
      title: 'Core Committee & SJCC Management Authority',
      text: 'The decision of the Core Committee and the Management of St. Joseph’s College of Commerce will be final and binding on all matters, disputes, and scoring.',
      icon: <Scale className="w-5 h-5 text-[#D9AD61]" />,
    },
  ];

  return (
    <div className="w-full min-h-screen bg-[#200000] text-[#F0D18B] py-12 md:py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <span className="text-xs uppercase tracking-[0.25em] text-[#D9AD61] font-serif-luxury">
            Code of Conduct & Protocols
          </span>
          <h1 className="font-serif-luxury text-4xl sm:text-5xl font-extrabold text-[#FFFFFF]">
            Rules & Regulations
          </h1>
          <p className="text-xs sm:text-sm text-[#D9AD61]/80 max-w-2xl mx-auto leading-relaxed">
            As published in the official Virtuoso 2026–27 brochure. Every contingent is bound by these stipulations upon institutional registration.
          </p>
        </div>

        <GoldDivider withStar={true} />

        {/* Rules Grid */}
        <div className="space-y-4">
          {officialRules.map((rule) => (
            <div
              key={rule.num}
              className="p-6 rounded-xl bg-gradient-to-r from-[#330205] to-[#200000] border border-[#B9873F]/25 hover:border-[#D9AD61]/50 transition-all flex items-start gap-5"
            >
              <div className="flex flex-col items-center shrink-0">
                <span className="font-serif-luxury text-sm font-bold text-[#D9AD61]">
                  {rule.num}
                </span>
                <div className="p-2 rounded bg-[#200000] border border-[#B9873F]/30 mt-1">
                  {rule.icon}
                </div>
              </div>

              <div className="space-y-1.5 flex-1">
                <h3 className="font-serif-luxury text-base font-bold text-[#FFFFFF]">
                  {rule.title}
                </h3>
                <p className="text-xs sm:text-sm text-[#F0D18B]/90 leading-relaxed font-sans-clean">
                  {rule.text}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Verification Protocol Notice (Section H of User Request) */}
        <div className="p-6 rounded-xl bg-[#160000] border border-[#B9873F]/30 space-y-3">
          <div className="flex items-center gap-2 text-sm font-serif-luxury font-bold text-[#FFFFFF]">
            <Shield className="w-4 h-4 text-[#D9AD61]" />
            <span>OFFICIAL DOCUMENT VERIFICATION PROCESS</span>
          </div>
          <p className="text-xs text-[#D9AD61]/90 leading-relaxed">
            Verification is conducted manually by the Virtuoso Organizing Committee following registration and fee processing. The committee will examine the four uploaded official college ID cards. If all credentials are confirmed, the contingent is cleared without further notice. If an irregularity is identified, the committee will directly contact the contingent leader and initiate cancellation in accordance with SJCC institutional policy.
          </p>
        </div>

        {/* Action Link */}
        <div className="text-center pt-4">
          <button
            onClick={() => onRouteChange('registration')}
            className="px-8 py-3 text-xs uppercase tracking-widest font-semibold text-[#200000] bg-gradient-to-r from-[#F0D18B] to-[#D9AD61] rounded hover:brightness-110 transition-all inline-flex items-center gap-2"
          >
            <span>Proceed to Contingent Registration</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
