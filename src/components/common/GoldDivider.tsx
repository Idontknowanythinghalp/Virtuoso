import React from 'react';

interface GoldDividerProps {
  className?: string;
  withStar?: boolean;
}

export const GoldDivider: React.FC<GoldDividerProps> = ({ className = '', withStar = true }) => {
  return (
    <div className={`relative flex items-center justify-center my-8 ${className}`}>
      <div className="w-full h-px bg-gradient-to-r from-transparent via-[#B9873F]/45 to-transparent gold-divider-line" />
      {withStar && (
        <div className="absolute px-3 bg-[#200000] flex items-center gap-1.5 text-[#D9AD61]">
          <span className="w-1 h-1 rounded-full bg-[#B9873F]" />
          <svg
            className="w-4 h-4 text-[#F0D18B] drop-shadow-[0_0_8px_rgba(240,209,139,0.45)]"
            viewBox="0 0 24 24"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
          </svg>
          <span className="w-1 h-1 rounded-full bg-[#B9873F]" />
        </div>
      )}
    </div>
  );
};
