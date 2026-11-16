import React from "react";
import { ShieldCheck } from "lucide-react";
import { formatOrganiserRole, type OrganiserSessionUser } from "@/types/auth";

interface AuthNoticeBannerProps {
  user: OrganiserSessionUser;
}

export function AuthNoticeBanner({ user }: AuthNoticeBannerProps) {
  return (
    <section
      aria-label="Organiser session status"
      className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-slate-900">
            Authenticated Organiser Session
          </h2>
          <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
            Signed in as <span className="font-medium text-slate-900">{user.fullName}</span> (
            {formatOrganiserRole(user.role)}). In V1, active coordinators share
            universal access across all events and rounds. Competition modules
            and the separate competitor portal remain deferred to later stages.
          </p>
        </div>
      </div>
      <span className="shrink-0 whitespace-nowrap text-xs font-medium text-emerald-700">
        Access Active · All Events (V1)
      </span>
    </section>
  );
}
