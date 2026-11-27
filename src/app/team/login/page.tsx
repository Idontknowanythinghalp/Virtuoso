import React from "react";
import Link from "next/link";
import { isPublicSupabaseConfigured } from "@/lib/env";
import { isAdminSupabaseConfigured } from "@/lib/supabase/server-env";
import { sanitizeTeamRedirectPath } from "@/lib/auth/team-account-rules";
import { resolveCurrentTeamContext } from "@/lib/auth/team-guards";
import { redirect } from "next/navigation";
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
    <div className="flex min-h-screen flex-col justify-between bg-[#200000] text-[#F5F0EC]">
      <header className="border-b border-[#542525] bg-[#200000] px-4 py-4 text-[#F5F0EC] sm:px-6">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark
              src="/brand/virtuoso-emblem.png"
              alt="Virtuoso Emblem"
              className="h-10 w-10 shrink-0 rounded-md border border-[#542525] bg-[#2B0808] object-contain p-1"
              fallbackLabel="V"
            />
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium tracking-wide text-[#D9AD61]">
                {siteConfig.institution}
              </p>
              <h1 className="truncate font-display text-lg font-bold tracking-tight text-[#F5F0EC]">
                Virtuoso 2026 Team Portal
              </h1>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-8 sm:px-6">
        <section
          aria-labelledby="team-login-heading"
          className="overflow-hidden rounded-lg border border-[#542525] bg-[#2B0808]"
        >
          <div className="border-b border-[#542525] bg-[#350A0A] px-6 py-5 sm:px-7">
            <p className="text-xs font-semibold tracking-wide text-[#D9AD61]">
              Heirs of the Solstice
            </p>
            <h2
              id="team-login-heading"
              className="mt-0.5 font-display text-xl font-bold text-[#F5F0EC]"
            >
              Contingent Sign In
            </h2>
            <p className="mt-1 text-sm text-[#B9AAA5]">
              Sign in with your assigned team code and password.
            </p>
          </div>

          <div className="space-y-4 bg-[#2B0808] p-6 sm:p-7">
            {statusMessage ? (
              <div
                role="status"
                className="rounded-md border border-emerald-400/40 bg-emerald-950/60 px-4 py-3 text-sm text-emerald-200"
              >
                {statusMessage}
              </div>
            ) : null}

            {errorBanner ? (
              <div
                role="alert"
                className="rounded-md border border-amber-400/45 bg-[#350A0A] px-4 py-3 text-sm text-amber-200"
              >
                {errorBanner}
              </div>
            ) : null}

            {isSignedInAsOrganiser ? (
              <div className="space-y-4 rounded-md border border-[#542525] bg-[#350A0A] p-4 text-sm text-[#B9AAA5]">
                <p className="leading-relaxed">
                  Team sign-in is disabled in this browser window while your
                  organiser session is active so your CMS session is not
                  overwritten. Sign out from the Organiser CMS or open a
                  private browser window to sign in as a team.
                </p>
                <Link
                  href="/"
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-[#D9AD61] px-4 py-2 text-sm font-semibold text-[#200000] transition-colors hover:bg-[#E4BC77] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9AD61] focus-visible:ring-offset-2 focus-visible:ring-offset-[#350A0A]"
                >
                  Return to Organiser CMS
                </Link>
              </div>
            ) : (
              <TeamLoginForm nextPath={nextPath} disabled={!serverConfigured} />
            )}

            <p className="border-t border-[#542525] pt-4 text-xs leading-relaxed text-[#B9AAA5]">
              Team accounts are provisioned by Virtuoso organisers. Each team
              may maintain up to 4 concurrent active device sessions.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#542525] bg-[#200000] px-4 py-4 text-[#F5F0EC] sm:px-6">
        <div className="mx-auto flex max-w-md flex-wrap items-center justify-between gap-2 text-xs text-[#B9AAA5]">
          <span>{siteConfig.department}</span>
          <span className="font-medium text-[#D9AD61]">4–5 December 2026</span>
        </div>
      </footer>
    </div>
  );
}
