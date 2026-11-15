import React from "react";
import { LockKeyhole } from "lucide-react";

export function AuthNoticeBanner() {
  return (
    <section
      aria-label="Authentication status"
      className="flex flex-col gap-3 rounded-lg border border-amber-300/80 bg-amber-50/70 px-5 py-4 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-amber-200 bg-white text-amber-700">
          <LockKeyhole className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-slate-900">
            Authentication Not Yet Implemented
          </h2>
          <p className="max-w-3xl text-sm leading-relaxed text-slate-700">
            This is the Stage 1A Next.js foundation shell. Supabase
            authentication, user accounts, role-based access control, and
            database persistence are intentionally deferred to upcoming
            implementation stages.
          </p>
        </div>
      </div>
      <span className="shrink-0 whitespace-nowrap text-xs font-medium text-amber-800">
        Access Control: Unconfigured
      </span>
    </section>
  );
}
