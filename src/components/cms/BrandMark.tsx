"use client";

import React, { useState } from "react";
import { Shield } from "lucide-react";

interface BrandMarkProps {
  src: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}

export function BrandMark({
  src,
  alt,
  className = "h-8 w-8 object-contain",
  fallbackLabel,
}: BrandMarkProps) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <span
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-100 text-slate-600"
        title={alt}
        aria-label={alt}
      >
        {fallbackLabel ? (
          <span className="text-[11px] font-semibold tracking-tight">
            {fallbackLabel}
          </span>
        ) : (
          <Shield className="h-4 w-4" aria-hidden="true" />
        )}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={className}
    />
  );
}
