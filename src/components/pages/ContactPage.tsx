import React, { useState } from 'react';
import { AppRoute } from '../../types';
import { GoldDivider } from '../common/GoldDivider';
import { Phone, Mail, MapPin, Send, Instagram, CheckCircle2, MessageSquare } from 'lucide-react';

interface ContactPageProps {
  onRouteChange: (route: AppRoute) => void;
}

export const ContactPage: React.FC<ContactPageProps> = ({ onRouteChange }) => {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    college: '',
    subject: 'Contingent Query',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) return;
    setSubmitted(true);
  };

  return (
    <div className="w-full min-h-screen bg-[#200000] text-[#F0D18B] py-12 md:py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-12">
        {/* Header */}
        <div className="text-center space-y-3">
          <span className="text-xs uppercase tracking-[0.25em] text-[#D9AD61] font-serif-luxury">
            Organizing Secretariat
          </span>
          <h1 className="font-serif-luxury text-4xl sm:text-5xl font-extrabold text-[#FFFFFF]">
            Contact Coordinators
          </h1>
          <p className="text-xs sm:text-sm text-[#D9AD61]/80 max-w-xl mx-auto leading-relaxed">
            Get in touch with the Virtuoso 2026 Core Committee for contingent invitations, rules clarifications, and travel logistics.
          </p>
        </div>

        <GoldDivider withStar={true} />

        {/* Official Brochure Coordinators Grid (Page 11) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Coordinator 1 */}
          <div className="p-8 rounded-2xl bg-gradient-to-b from-[#330205] to-[#200000] border border-[#B9873F]/30 hover:border-[#D9AD61] transition-all space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-serif-luxury uppercase tracking-widest text-[#D9AD61]">
                BBA Coordinator
              </span>
              <span className="text-[10px] text-[#200000] bg-[#D9AD61] font-bold px-2 py-0.5 rounded font-sans-clean">
                Official Liaison
              </span>
            </div>

            <div>
              <h2 className="font-serif-luxury text-2xl font-bold text-[#FFFFFF]">
                Noel Joseph Prabhu
              </h2>
              <p className="text-xs text-[#B9873F] mt-0.5">
                Virtuoso Organizing Committee • Department of Business Administration
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-[#B9873F]/20 text-xs">
              <div className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-[#D9AD61] shrink-0" />
                <a href="tel:+918088006881" className="text-[#FFFFFF] hover:text-[#D9AD61] font-medium">
                  +91 80880 06881
                </a>
              </div>
              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-[#D9AD61] shrink-0" />
                <a href="mailto:bbacoordinator@gmail.com" className="text-[#D9AD61] hover:text-[#FFFFFF]">
                  bbacoordinator@gmail.com
                </a>
              </div>
            </div>
          </div>

          {/* Coordinator 2 */}
          <div className="p-8 rounded-2xl bg-gradient-to-b from-[#330205] to-[#200000] border border-[#B9873F]/30 hover:border-[#D9AD61] transition-all space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-serif-luxury uppercase tracking-widest text-[#D9AD61]">
                BBA Entrepreneurship Coordinator
              </span>
              <span className="text-[10px] text-[#200000] bg-[#D9AD61] font-bold px-2 py-0.5 rounded font-sans-clean">
                Official Liaison
              </span>
            </div>

            <div>
              <h2 className="font-serif-luxury text-2xl font-bold text-[#FFFFFF]">
                Yashas S
              </h2>
              <p className="text-xs text-[#B9873F] mt-0.5">
                Virtuoso Organizing Committee • Department of Business Administration
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-[#B9873F]/20 text-xs">
              <div className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-[#D9AD61] shrink-0" />
                <a href="tel:+917026022668" className="text-[#FFFFFF] hover:text-[#D9AD61] font-medium">
                  +91 70260 22668
                </a>
              </div>
              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-[#D9AD61] shrink-0" />
                <a href="mailto:bbacoordinator@gmail.com" className="text-[#D9AD61] hover:text-[#FFFFFF]">
                  bbacoordinator@gmail.com
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Institution Location & Social Updates */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Details */}
          <div className="lg:col-span-5 space-y-6">
            <div className="p-6 rounded-2xl bg-[#330205]/70 border border-[#B9873F]/30 space-y-3">
              <div className="flex items-center gap-2 text-xs font-serif-luxury uppercase tracking-widest text-[#D9AD61]">
                <MapPin className="w-4 h-4 text-[#F0D18B]" />
                <span>Host Institution & Venue</span>
              </div>
              <h3 className="font-serif-luxury text-lg font-bold text-[#FFFFFF]">
                St. Joseph’s College of Commerce (Autonomous)
              </h3>
              <p className="text-xs text-[#D9AD61]/90 leading-relaxed font-sans-clean">
                163, Brigade Rd, Shanthala Nagar, Ashok Nagar, Bengaluru, Karnataka 560025.
              </p>
              <div className="pt-2 text-xs text-[#B9873F]">
                Located in the heart of Bengaluru's central business district. 10 minutes from MG Road Metro Station.
              </div>
            </div>

            {/* Instagram Updates Card (Brochure Page 10) */}
            <div className="p-6 rounded-2xl bg-[#200000] border border-[#B9873F]/30 space-y-3">
              <div className="flex items-center gap-2 text-xs font-serif-luxury uppercase tracking-widest text-[#D9AD61]">
                <Instagram className="w-4 h-4 text-[#F0D18B]" />
                <span>Follow Us For More Updates</span>
              </div>
              <p className="text-xs text-[#D9AD61]/80 leading-relaxed">
                Stay updated with round announcements, guest speaker reveals, and five-star venue drops.
              </p>
              <div className="flex items-center gap-2 text-sm font-semibold text-[#FFFFFF]">
                <span>@virtuoso_sjcc</span>
              </div>
            </div>
          </div>

          {/* Right Inquiry Form */}
          <div className="lg:col-span-7 p-8 rounded-2xl bg-gradient-to-b from-[#330205] to-[#200000] border border-[#B9873F]/30 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-xs font-serif-luxury uppercase tracking-widest text-[#D9AD61]">
              <MessageSquare className="w-4 h-4 text-[#F0D18B]" />
              <span>Send An Official Inquiry</span>
            </div>
            <h3 className="font-serif-luxury text-xl font-bold text-[#FFFFFF]">
              Secretariat Desk
            </h3>

            {submitted ? (
              <div className="p-6 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-center space-y-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <h4 className="font-serif-luxury text-lg font-bold text-[#FFFFFF]">
                  Inquiry Dispatched
                </h4>
                <p className="text-xs text-emerald-200">
                  Thank you, {form.name}. The Virtuoso Organizing Secretariat has received your message and will respond to <strong>{form.email}</strong> promptly.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSubmitted(false);
                    setForm({ name: '', email: '', phone: '', college: '', subject: 'Contingent Query', message: '' });
                  }}
                  className="text-xs text-[#D9AD61] hover:text-[#FFFFFF] underline pt-2"
                >
                  Send another inquiry
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-[#F0D18B]">
                      Your Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Rahul Sen"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-[#200000] border border-[#B9873F]/40 rounded text-xs text-[#FFFFFF] placeholder-[#B9873F]/40 focus:outline-none focus:border-[#F0D18B]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-[#F0D18B]">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. rahul@college.edu"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-[#200000] border border-[#B9873F]/40 rounded text-xs text-[#FFFFFF] placeholder-[#B9873F]/40 focus:outline-none focus:border-[#F0D18B]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-[#F0D18B]">
                      Mobile Number
                    </label>
                    <input
                      type="tel"
                      placeholder="e.g. 9876543210"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-[#200000] border border-[#B9873F]/40 rounded text-xs text-[#FFFFFF] placeholder-[#B9873F]/40 focus:outline-none focus:border-[#F0D18B]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-[#F0D18B]">
                      Institution Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Loyola College, Chennai"
                      value={form.college}
                      onChange={(e) => setForm({ ...form, college: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-[#200000] border border-[#B9873F]/40 rounded text-xs text-[#FFFFFF] placeholder-[#B9873F]/40 focus:outline-none focus:border-[#F0D18B]"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-[#F0D18B]">
                    Subject
                  </label>
                  <select
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-[#200000] border border-[#B9873F]/40 rounded text-xs text-[#FFFFFF] focus:outline-none focus:border-[#F0D18B]"
                  >
                    <option value="Contingent Query">Contingent Composition & Eligibility</option>
                    <option value="Payment Assistance">Payment & Official Invoice Request</option>
                    <option value="Accommodation & Travel">Bengaluru Travel & Logistics</option>
                    <option value="General Rules">Competition Rules Clarification</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-[#F0D18B]">
                    Message *
                  </label>
                  <textarea
                    rows={4}
                    required
                    placeholder="Enter your inquiry details..."
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-[#200000] border border-[#B9873F]/40 rounded text-xs text-[#FFFFFF] placeholder-[#B9873F]/40 focus:outline-none focus:border-[#F0D18B]"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 text-xs uppercase tracking-widest font-semibold text-[#200000] bg-gradient-to-r from-[#F0D18B] to-[#D9AD61] rounded hover:brightness-110 transition-all flex items-center justify-center gap-2"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Transmit Inquiry to Coordinators</span>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
