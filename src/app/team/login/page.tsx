import React from "react";
import { redirect } from "next/navigation";
import { isPublicSupabaseConfigured } from "@/lib/env";
import { isAdminSupabaseConfigured } from "@/lib/supabase/server-env";
import { sanitizeTeamRedirectPath } from "@/lib/auth/team-account-rules";
import { resolveCurrentTeamContext } from "@/lib/auth/team-guards";
import { siteConfig } from "@/lib/site-config";
import { BrandMark } from "@/components/cms/BrandMark";
import { TeamLoginForm } from "@/components/auth/TeamLoginForm";

export const dynamic = "force-dynamic";

interface TeamLoginPageProps {
  searchParams: Promise<{
    error?: string;
    message?: string;
    next?: string;
  }>;
}

const TEAM_ERROR_MESSAGES: Record<string, string> = {
  session_ended:
    "Your team session expired or was signed out. Sign in again to continue.",
  organiser_account:
    "You are currently signed in with an organiser account. Organiser accounts cannot access team routes.",
  revocation_failed:
    "You have been signed out on this device, but database session revocation could not be confirmed. If a device slot still appears occupied, contact an organiser.",
  logout_failed:
    "Unable to complete sign out cleanly. Please refresh or clear site cookies before signing in again.",
  config:
    "Team authentication is not configured on the server yet. Contact an organiser.",
};

export default async function TeamLoginPage({
  searchParams,
}: TeamLoginPageProps) {
  const params = await searchParams;
  const publicConfigured = isPublicSupabaseConfigured();
  const adminConfigured = isAdminSupabaseConfigured();
  const serverConfigured = publicConfigured && adminConfigured;
  const nextPath = sanitizeTeamRedirectPath(params.next, "/team");

  if (serverConfigured && !params.error) {
    const activeContext = await resolveCurrentTeamContext();
    if (activeContext.ok) {
      redirect(nextPath);
    }
  }

  const errorBanner =
    params.error && TEAM_ERROR_MESSAGES[params.error]
      ? TEAM_ERROR_MESSAGES[params.error]
      : !serverConfigured
        ? TEAM_ERROR_MESSAGES.config
        : null;

  const statusMessage =
    params.message === "logged_out"
      ? "You have been signed out from this device."
      : null;

  return (
    <div className="flex min-h-screen flex-col justify-between bg-[#F8FAFC] px-4 py-10 sm:px-6">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center space-y-6">
        <div className="flex items-center gap-3">
          <BrandMark
            src="/brand/virtuoso-emblem.png"
            alt="Virtuoso Emblem"
            className="h-11 w-11 shrink-0 rounded-md border border-slate-200 bg-[#200000] object-contain p-1.5"
            fallbackLabel="V"
          />
          <div>
            <p className="text-xs font-medium text-[#4B0507]">
              {siteConfig.institution}
            </p>
            <h1 className="font-display text-xl font-bold tracking-tight text-slate-900">
              Virtuoso Team Portal
            </h1>
          </div>
        </div>

        <section
          aria-labelledby="team-login-heading"
          className="rounded-lg border border-slate-200 bg-white p-6 sm:p-8"
        >
          <div className="space-y-1.5 border-b border-slate-100 pb-5">
            <h2
              id="team-login-heading"
              className="font-display text-lg font-semibold text-slate-900"
            >
              Contingent Sign In
            </h2>
            <p className="text-sm text-slate-600">
              Sign in with your assigned team code and password.
            </p>
          </div>

          <div className="mt-5 space-y-4">
            {statusMessage ? (
              <div
                role="status"
                className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
              >
                {statusMessage}
              </div>
            ) : null}

            {errorBanner ? (
              <div
                role="alert"
                className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              >
                {errorBanner}
              </div>
            ) : null}

            <TeamLoginForm nextPath={nextPath} disabled={!serverConfigured} />
          </div>

          <p className="mt-6 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
            Team accounts are provisioned by Virtuoso organisers. Each team may
            maintain up to 4 concurrent active device sessions.
          </p>
        </section>
      </div>

      <footer className="mx-auto mt-8 flex w-full max-w-md items-center justify-between text-xs text-slate-500">
        <span>{siteConfig.department}</span>
        <span>4–5 December 2026</span>
      </footer>
    </div>
  );
}
