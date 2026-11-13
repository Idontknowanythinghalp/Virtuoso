import React from 'react';
import { AppRoute } from '../../types';
import { GoldDivider } from '../common/GoldDivider';
import { Trophy, Award, Building, Users, ArrowRight } from 'lucide-react';

interface AboutVirtuosoPageProps {
  onRouteChange: (route: AppRoute) => void;
}

export const AboutVirtuosoPage: React.FC<AboutVirtuosoPageProps> = ({ onRouteChange }) => {
  return (
    <div className="w-full min-h-screen bg-[#200000] text-[#F0D18B] py-12 md:py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-12">
        {/* Header */}
        <div className="text-center space-y-3">
          <span className="text-xs uppercase tracking-[0.25em] text-[#D9AD61] font-serif-luxury">
            Fest Legacy & Distinction
          </span>
          <h1 className="font-serif-luxury text-4xl sm:text-5xl font-extrabold text-[#FFFFFF]">
            VIRTUOSO 2026–27
          </h1>
          <p className="font-cormorant text-xl sm:text-2xl italic text-[#D9AD61]">
            One of India’s Premier Management Fests
          </p>
        </div>

        <GoldDivider withStar={true} />

        {/* Narrative Verbatim from Brochure Page 4 */}
        <div className="prose prose-invert max-w-none space-y-6 font-sans-clean text-sm sm:text-base leading-relaxed text-[#F0D18B]/90">
          <p className="first-letter:text-5xl first-letter:font-serif-luxury first-letter:font-bold first-letter:float-left first-letter:mr-3 first-letter:text-[#FFFFFF] first-letter:mt-1 leading-relaxed">
            The Department of Business Administration, St. Joseph's College of Commerce, presents Virtuoso, a "State-Of-The-Art" national level inter-collegiate management fest, on the 4th and 5th December, 2026. We extend a warm and exclusive invitation for a contingent of four distinguished members from your esteemed institution to compete in a series of challenging rounds.
          </p>

          {/* Luxury Card: What to Expect */}
          <div className="my-8 p-6 rounded-2xl bg-[#330205] border border-[#B9873F]/30 space-y-4">
            <h3 className="font-serif-luxury text-lg font-bold text-[#FFFFFF] uppercase tracking-wider">
              What to Expect:
            </h3>
            <p className="text-xs text-[#D9AD61]/90">
              Multiple high-stakes rounds designed to test your contingent under pressure:
            </p>
            <ul className="space-y-2.5 text-xs sm:text-sm text-[#F0D18B]">
              <li className="flex items-start gap-2">
                <span className="text-[#D9AD61] font-bold">·</span>
                <span><strong>High-Stakes Decision Making:</strong> Make critical boardroom calls and steer strategic outcomes.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#D9AD61] font-bold">·</span>
                <span><strong>Brand & Advocacy:</strong> Pitch innovative ideas and be the voice of the organization you represent.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#D9AD61] font-bold">·</span>
                <span><strong>Capital & Crisis Management:</strong> Prove your contingent can manage volatile assets under crucible pressure.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#D9AD61] font-bold">·</span>
                <span><strong>Synergy & People Dynamics:</strong> Put your team leadership, ethics, and interpersonal composure to the ultimate test.</span>
              </li>
            </ul>
          </div>

          <h3 className="font-serif-luxury text-xl font-bold text-[#FFFFFF] pt-2">
            The Recommended Team Composition
          </h3>
          <ul className="space-y-3 text-xs sm:text-sm text-[#F0D18B]/90">
            <li className="p-4 rounded-lg bg-[#200000] border border-[#B9873F]/20">
              <strong className="text-[#FFFFFF] block mb-1">Best Manager / Entrepreneurship Development</strong>
              A participant adept in Best Manager/Entrepreneurship Development, serving as the driving force behind strategic decisions and closely managing the overall outcome.
            </li>
            <li className="p-4 rounded-lg bg-[#200000] border border-[#B9873F]/20">
              <strong className="text-[#FFFFFF] block mb-1">Marketing / Public Relations</strong>
              A participant proficient in Marketing/PR, tasked with devising innovative strategies to promote unconventional products and acting as an effective spokesperson of the entity they represent.
            </li>
            <li className="p-4 rounded-lg bg-[#200000] border border-[#B9873F]/20">
              <strong className="text-[#FFFFFF] block mb-1">Financial Management</strong>
              A participant skilled in Finance, contributing invaluable insights to ensure sound financial management throughout the competition.
            </li>
            <li className="p-4 rounded-lg bg-[#200000] border border-[#B9873F]/20">
              <strong className="text-[#FFFFFF] block mb-1">Human Resources (HR)</strong>
              A participant specialising in HR, pivotal in shaping a harmonious and effective team dynamic, adding a crucial human element to the business proceedings.
            </li>
          </ul>

          <div className="p-6 rounded-xl bg-gradient-to-r from-[#4B0507] to-[#200000] border border-[#B9873F]/30 my-6">
            <p className="text-sm sm:text-base text-[#FFFFFF] font-serif-luxury leading-relaxed italic">
              "Set against the grandeur of one of Bengaluru's finest five-star hotels, the fest promises an extraordinary confluence of intellect, strategy and ambition through meticulously curated rounds that capture the ever-evolving landscape of the business world and beyond. Complemented by exceptional hospitality and an unparalleled experience, Virtuoso continues to uphold its legacy as an elite destination for the crème de la crème of undergraduate business fests."
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center pt-4">
          <button
            onClick={() => onRouteChange('registration')}
            className="px-8 py-3 text-xs uppercase tracking-widest font-semibold text-[#200000] bg-gradient-to-r from-[#F0D18B] to-[#D9AD61] rounded hover:brightness-110 transition-all inline-flex items-center gap-2"
          >
            <span>Register Contingent (₹7,000)</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
