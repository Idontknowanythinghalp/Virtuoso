import React, { useState } from 'react';
import { MapPin, ExternalLink, Copy, Check, Navigation } from 'lucide-react';

interface SJCCLocationMapProps {
  className?: string;
  variant?: 'default' | 'footer';
}

export const SJCCLocationMap: React.FC<SJCCLocationMapProps> = ({ className = '', variant = 'footer' }) => {
  const [copied, setCopied] = useState(false);

  const address = "St. Joseph's College of Commerce (Autonomous), 163, Brigade Rd, Shanthala Nagar, Ashok Nagar, Bengaluru, Karnataka 560025";
  const googleMapsUrl = "https://www.google.com/maps/search/?api=1&query=St.+Joseph's+College+of+Commerce+163+Brigade+Road+Bengaluru+560025";

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (variant === 'footer') {
    return (
      <div className={`rounded-xl bg-[#140000] border border-[#B9873F]/35 overflow-hidden shadow-lg my-2.5 ${className}`}>
        {/* Map Frame */}
        <div className="relative w-full h-44 sm:h-48 bg-[#100000]">
          <iframe
            title="St. Joseph's College of Commerce Location Map"
            src="https://maps.google.com/maps?q=St.+Joseph's+College+of+Commerce+163+Brigade+Road+Bengaluru&t=&z=16&ie=UTF8&iwloc=&output=embed"
            width="100%"
            height="100%"
            style={{ border: 0, filter: 'contrast(1.05) saturate(1.05)' }}
            allowFullScreen={true}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="w-full h-full"
          />
          <div className="absolute top-2 right-2 z-10">
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-1 text-[10px] font-semibold text-[#FFFFFF] bg-[#200000]/90 backdrop-blur-sm border border-[#B9873F]/60 hover:border-[#F0D18B] rounded shadow flex items-center gap-1 transition-colors"
            >
              <span>View larger</span>
              <ExternalLink className="w-2.5 h-2.5 text-[#D9AD61]" />
            </a>
          </div>
        </div>

        {/* Footer Map Quick Actions */}
        <div className="p-2.5 bg-[#1b0000] border-t border-[#B9873F]/20 flex items-center justify-between gap-2 text-[11px]">
          <button
            type="button"
            onClick={handleCopy}
            className="px-2.5 py-1 text-[11px] font-medium text-[#F0D18B] hover:text-[#FFFFFF] bg-[#2a0104] border border-[#B9873F]/30 hover:border-[#F0D18B] rounded transition-colors flex items-center gap-1.5"
            title="Copy address"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-[#F0D18B]" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-[#D9AD61]" />
                <span>Copy Address</span>
              </>
            )}
          </button>

          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1 text-[11px] font-semibold text-[#200000] bg-gradient-to-r from-[#F0D18B] to-[#D9AD61] hover:brightness-110 rounded transition-all flex items-center gap-1 shadow-sm active:scale-95"
          >
            <Navigation className="w-3 h-3" />
            <span>Open in Maps</span>
            <ExternalLink className="w-2.5 h-2.5 ml-0.5 opacity-80" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl bg-[#1a0000] border border-[#B9873F]/40 overflow-hidden shadow-2xl ${className}`}>
      {/* Map Header */}
      <div className="p-5 sm:p-6 bg-gradient-to-r from-[#330205] to-[#200000] border-b border-[#B9873F]/25 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[#D9AD61]">
            <MapPin className="w-4 h-4 text-[#F0D18B]" />
            <span>Official Day 1 Venue Location</span>
          </div>
          <h3 className="font-display text-xl sm:text-2xl font-bold text-[#FFFFFF]">
            St. Joseph's College of Commerce
          </h3>
          <p className="text-xs text-[#D9AD61]/90">
            163, Brigade Rd, Shanthala Nagar, Ashok Nagar, Bengaluru, Karnataka 560025
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={handleCopy}
            className="px-3.5 py-2 text-xs font-medium text-[#F0D18B] hover:text-[#FFFFFF] bg-[#200000] border border-[#B9873F]/40 hover:border-[#F0D18B] rounded transition-colors flex items-center gap-1.5"
            title="Copy exact address"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-[#F0D18B]" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-[#D9AD61]" />
                <span>Copy Address</span>
              </>
            )}
          </button>

          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-xs font-semibold text-[#200000] bg-gradient-to-r from-[#F0D18B] to-[#D9AD61] hover:brightness-110 rounded transition-all flex items-center gap-1.5 shadow-md active:scale-95"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Open in Google Maps</span>
            <ExternalLink className="w-3 h-3 ml-0.5 opacity-80" />
          </a>
        </div>
      </div>

      {/* Embedded Google Map Frame */}
      <div className="relative w-full h-[320px] sm:h-[380px] bg-[#120000]">
        <iframe
          title="St. Joseph's College of Commerce Google Map"
          src="https://maps.google.com/maps?q=St.+Joseph's+College+of+Commerce+163+Brigade+Road+Bengaluru&t=&z=16&ie=UTF8&iwloc=&output=embed"
          width="100%"
          height="100%"
          style={{ border: 0, filter: 'contrast(1.05) saturate(1.1)' }}
          allowFullScreen={true}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="w-full h-full"
        />

        {/* Overlay direct button on mobile / bottom banner */}
        <div className="absolute bottom-3 right-3 z-10">
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-[11px] font-semibold text-[#FFFFFF] bg-[#200000]/90 backdrop-blur-md border border-[#B9873F]/60 hover:border-[#F0D18B] rounded shadow-lg flex items-center gap-1.5"
          >
            <MapPin className="w-3.5 h-3.5 text-[#F0D18B]" />
            <span>Get Directions via Google Maps →</span>
          </a>
        </div>
      </div>

      {/* Transit & Accessibility Footer */}
      <div className="p-4 bg-[#140000] border-t border-[#B9873F]/20 text-xs text-[#D9AD61]/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#D9AD61]"></span>
          <span><strong>Metro:</strong> ~500m from MG Road Metro Station (Purple Line)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#D9AD61]"></span>
          <span><strong>Bus / Rail:</strong> Direct connectivity from Majestic (KSR) & Shanthi Nagar</span>
        </div>
      </div>
    </div>
  );
};
