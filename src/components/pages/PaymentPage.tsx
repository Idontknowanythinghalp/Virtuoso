import React, { useEffect, useState } from 'react';
import { AppRoute, ContingentRegistration } from '../../types';
import { GoldDivider } from '../common/GoldDivider';
import { sjccApi } from '../../services/api';
import { CreditCard, AlertTriangle, ShieldCheck, Phone, Mail, Building, ArrowLeft, CheckCircle2 } from 'lucide-react';

interface PaymentPageProps {
  onRouteChange: (route: AppRoute) => void;
}

export const PaymentPage: React.FC<PaymentPageProps> = ({ onRouteChange }) => {
  const [contingent, setContingent] = useState<ContingentRegistration | null>(null);

  useEffect(() => {
    async function fetchDraft() {
      const draft = await sjccApi.getDraft();
      if (draft) {
        setContingent(draft);
      }
    }
    fetchDraft();
  }, []);

  return (
    <div className="w-full min-h-screen bg-[#200000] text-[#F0D18B] py-12 md:py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-10">
        {/* Navigation Breadcrumb */}
        <div>
          <button
            onClick={() => onRouteChange('registration')}
            className="inline-flex items-center gap-2 text-xs text-[#D9AD61] hover:text-[#FFFFFF] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Contingent Registration Form</span>
          </button>
        </div>

        {/* Page Header */}
        <div className="text-center space-y-4">
          <span className="text-xs uppercase tracking-[0.25em] text-[#D9AD61] font-serif-luxury">
            Official Treasury & Gateway Portal
          </span>
          <h1 className="font-serif-luxury text-3xl sm:text-5xl font-extrabold text-[#FFFFFF]">
            Registration Payment
          </h1>
          <p className="text-xs sm:text-sm text-[#D9AD61]/80 max-w-xl mx-auto leading-relaxed">
            St. Joseph’s College of Commerce (Autonomous) • Department of Business Administration
          </p>
        </div>

        <GoldDivider withStar={true} />

        {/* MANDATORY PROMINENT NOTICE BANNER (Section I) */}
        <div className="p-8 sm:p-10 rounded-2xl bg-gradient-to-b from-[#4B0507] via-[#330205] to-[#200000] border-2 border-[#D9AD61] shadow-[0_0_30px_rgba(185,135,63,0.3)] text-center space-y-5">
          <div className="inline-flex p-3 rounded-full bg-[#200000] border border-[#D9AD61] text-[#F0D18B]">
            <AlertTriangle className="w-8 h-8 text-[#D9AD61]" />
          </div>

          <div className="space-y-2">
            <span className="text-xs font-serif-luxury uppercase tracking-[0.2em] text-[#F0D18B] block font-bold">
              Institutional Notice
            </span>
            <h2 className="font-serif-luxury text-2xl sm:text-4xl font-extrabold text-[#FFFFFF] tracking-wide">
              PAYMENT INTEGRATION — YET TO BE INTEGRATED
            </h2>
          </div>

          <p className="text-xs sm:text-sm text-[#F0D18B]/95 max-w-2xl mx-auto leading-relaxed font-sans-clean">
            The official payment gateway will be securely connected directly by St. Joseph's College of Commerce's web handler and treasury department prior to the opening of live payment transactions.
          </p>

          <div className="p-4 rounded-xl bg-[#200000]/80 border border-[#B9873F]/30 max-w-md mx-auto">
            <span className="text-[11px] uppercase tracking-wider text-[#D9AD61] block font-serif-luxury">
              Mandatory Registration Fee
            </span>
            <div className="font-serif-luxury text-3xl sm:text-4xl font-extrabold text-[#FFFFFF] mt-1 tabular-nums">
              ₹7,000
            </div>
            <span className="text-xs text-[#B9873F] block mt-0.5">
              INR 7,000 per Contingent Team (Exactly 4 Executives)
            </span>
          </div>

          <div className="pt-2 text-xs text-[#D9AD61]/80 max-w-lg mx-auto">
            In compliance with SJCC cybersecurity policy, no mock transactions, fake payment buttons, or simulated credit card gateways are permitted on this staging portal.
          </div>
        </div>

        {/* Contingent Draft Summary if Available */}
        {contingent && contingent.institution.collegeName && (
          <div className="p-6 rounded-2xl bg-[#330205]/70 border border-[#B9873F]/30 space-y-4">
            <div className="flex items-center justify-between border-b border-[#B9873F]/20 pb-3">
              <span className="text-xs font-serif-luxury uppercase tracking-wider text-[#D9AD61] font-bold">
                Registered Contingent Roster Preview
              </span>
              <span className="text-[10px] text-[#200000] bg-[#D9AD61] font-bold px-2 py-0.5 rounded">
                Draft Preserved
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-[#F0D18B]">
              <div>
                <span className="text-[#B9873F] block">Institution:</span>
                <strong className="text-[#FFFFFF] text-sm font-serif-luxury">
                  {contingent.institution.collegeName}
                </strong>
                <p className="text-[#D9AD61] mt-0.5">
                  {contingent.institution.department} ({contingent.institution.city}, {contingent.institution.state})
                </p>
              </div>

              <div>
                <span className="text-[#B9873F] block">Contingent Leader:</span>
                <strong className="text-[#FFFFFF]">
                  {contingent.leader.fullName || '—'}
                </strong>
                <p className="text-[#D9AD61] mt-0.5">
                  {contingent.leader.email} • {contingent.leader.phone}
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-[#B9873F]/15 flex items-center justify-between text-xs text-[#D9AD61]">
              <span>Contingent Members: 4/4 Enrolled</span>
              <span>Total Payable upon Gateway Live: ₹7,000</span>
            </div>
          </div>
        )}

        {/* Official Verification Next Steps */}
        <div className="p-6 rounded-xl bg-[#180000] border border-[#B9873F]/30 space-y-4">
          <div className="flex items-center gap-2 text-sm font-serif-luxury font-bold text-[#FFFFFF]">
            <ShieldCheck className="w-5 h-5 text-[#D9AD61]" />
            <span>HOW PAYMENT & VERIFICATION WILL WORK UPON INTEGRATION</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-[#D9AD61]/90">
            <div className="p-4 rounded-lg bg-[#200000] border border-[#B9873F]/20 space-y-1.5">
              <span className="font-serif-luxury text-sm font-bold text-[#FFFFFF] block">
                01. Gateway Activation
              </span>
              <p>
                SJCC web handler connects the official bank payment gateway (SBI ePay / Razorpay). The ₹7,000 payment link is activated.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-[#200000] border border-[#B9873F]/20 space-y-1.5">
              <span className="font-serif-luxury text-sm font-bold text-[#FFFFFF] block">
                02. Receipt Generation
              </span>
              <p>
                Upon transaction completion, an official college transaction reference and contingent registration ID are issued.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-[#200000] border border-[#B9873F]/20 space-y-1.5">
              <span className="font-serif-luxury text-sm font-bold text-[#FFFFFF] block">
                03. Manual ID Audit
              </span>
              <p>
                Virtuoso organizing committee audits the 4 uploaded college ID cards. If confirmed, your contingent is officially cleared for Day 1.
              </p>
            </div>
          </div>
        </div>

        {/* Secretariat Contact for Inquiries */}
        <div className="p-6 rounded-xl bg-[#330205]/60 border border-[#B9873F]/30 space-y-3 text-center">
          <h3 className="font-serif-luxury text-base font-bold text-[#FFFFFF]">
            Need Assistance or Official Invoice Details?
          </h3>
          <p className="text-xs text-[#D9AD61]/90 max-w-lg mx-auto">
            For college purchase orders, official sponsorship queries, or fee receipt questions, directly contact the Virtuoso Coordinators:
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-xs text-[#F0D18B] pt-1">
            <div className="flex items-center gap-1.5">
              <Phone className="w-4 h-4 text-[#D9AD61]" />
              <span>Noel Joseph Prabhu: +91 80880 06881</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Phone className="w-4 h-4 text-[#D9AD61]" />
              <span>Yashas S: +91 70260 22668</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Mail className="w-4 h-4 text-[#D9AD61]" />
              <span>bbacoordinator@gmail.com</span>
            </div>
          </div>
        </div>

        {/* Back Button */}
        <div className="text-center pt-2">
          <button
            onClick={() => onRouteChange('home')}
            className="px-6 py-2.5 text-xs uppercase tracking-widest font-semibold text-[#F0D18B] border border-[#B9873F]/40 hover:border-[#D9AD61] rounded transition-colors"
          >
            Return to Homepage
          </button>
        </div>
      </div>
    </div>
  );
};
