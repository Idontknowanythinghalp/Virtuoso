import React from "react";
import Link from "next/link";
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

  let isSignedInAsOrganiser = false;

  if (serverConfigured) {
    const activeContext = await resolveCurrentTeamContext();
    if (activeContext.ok && !params.error) {
      redirect(nextPath);
    }
    if (!activeContext.ok && activeContext.reason === "organiser_forbidden") {
      isSignedInAsOrganiser = true;
    }
  }

  const effectiveErrorKey = isSignedInAsOrganiser
    ? "organiser_account"
    : params.error;

  const errorBanner =
    effectiveErrorKey && TEAM_ERROR_MESSAGES[effectiveErrorKey]
      ? TEAM_ERROR_MESSAGES[effectiveErrorKey]
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

            {isSignedInAsOrganiser ? (
              <div className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <p className="leading-relaxed">
                  Team sign-in is disabled in this browser window while your
                  organiser session is active so your CMS session is not
                  overwritten. Sign out from the Organiser CMS or open a
                  private browser window to sign in as a team.
                </p>
                <Link
                  href="/"
                  className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-[#4B0507] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#380305] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507] focus-visible:ring-offset-2"
                >
                  Return to Organiser CMS
                </Link>
              </div>
            ) : (
              <TeamLoginForm nextPath={nextPath} disabled={!serverConfigured} />
            )}
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
