import React from "react";
import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";
import { siteConfig } from "@/lib/site-config";
import { BrandMark } from "@/components/cms/BrandMark";

export type TeamPortalNavKey = "dashboard" | "rounds" | "leaderboard";

export interface TeamPortalIdentity {
  contingentCode: string;
  contingentName: string;
  institutionName: string;
}

interface TeamPortalShellProps {
  activeNav: TeamPortalNavKey;
  teamIdentity: TeamPortalIdentity;
  brandMark: React.ReactNode;
  logoutAction: () => Promise<void>;
  standingsNavLink: React.ReactNode;
  showSessionStrip?: boolean;
  children: React.ReactNode;
}

export function TeamPortalShell({
  activeNav,
  teamIdentity,
  brandMark,
  logoutAction,
  standingsNavLink,
  showSessionStrip = true,
  children,
}: TeamPortalShellProps) {
  return (
    <div className="flex min-h-screen flex-col justify-between bg-[#F8F7F6]">
      <header className="border-b border-[#D9AD61]/30 bg-[#200000] text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <Link
            href="/team"
            className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9AD61]"
          >
            {brandMark}
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium tracking-wide text-[#D9AD61]">
                {siteConfig.institution}
              </p>
              <p className="truncate font-display text-base font-bold tracking-tight text-white sm:text-lg">
                Virtuoso 2026 Team Portal
              </p>
            </div>
          </Link>

          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden items-center gap-2 rounded-md border border-[#D9AD61]/30 bg-[#2E0304] px-3 py-1.5 sm:inline-flex">
              <span className="text-[11px] font-medium text-white/70">
                Team
              </span>
              <span className="font-mono text-xs font-semibold tracking-wide text-[#D9AD61]">
                {teamIdentity.contingentCode}
              </span>
            </div>

            <form action={logoutAction}>
              <button
                type="submit"
                className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border border-[#D9AD61]/35 bg-[#2E0304] px-3.5 py-2 text-xs font-semibold whitespace-nowrap text-white transition-colors hover:border-[#D9AD61]/70 hover:bg-[#4B0507] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9AD61] sm:text-sm"
              >
                <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Sign Out</span>
              </button>
            </form>
          </div>
        </div>

        <nav
          aria-label="Team portal navigation"
          className="border-t border-white/10 bg-[#2A0203]"
        >
          <div className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-4 whitespace-nowrap sm:gap-2 sm:px-6">
            <Link
              href="/team"
              aria-current={activeNav === "dashboard" ? "page" : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9AD61] focus-visible:ring-inset ${
                activeNav === "dashboard"
                  ? "border-[#D9AD61] font-semibold text-[#D9AD61]"
                  : "border-transparent font-medium text-white/75 hover:border-white/30 hover:text-white"
              }`}
            >
              Dashboard
            </Link>
            <Link
              href="/team/rounds"
              aria-current={activeNav === "rounds" ? "page" : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9AD61] focus-visible:ring-inset ${
                activeNav === "rounds"
                  ? "border-[#D9AD61] font-semibold text-[#D9AD61]"
                  : "border-transparent font-medium text-white/75 hover:border-white/30 hover:text-white"
              }`}
            >
              Current Rounds
            </Link>
            {standingsNavLink}
          </div>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        {showSessionStrip ? (
          <section
            aria-label="Signed-in contingent"
            className="flex flex-col gap-2.5 rounded-lg border border-[#E5E1DF] bg-white px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#D9AD61]/40 bg-[#FDF9F0] text-[#4B0507]">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500">
                  Signed in as{" "}
                  <span className="font-mono font-semibold text-[#4B0507]">
                    {teamIdentity.contingentCode}
                  </span>
                </p>
                <p className="truncate font-display text-sm font-bold text-slate-900">
                  {teamIdentity.contingentName}
                </p>
              </div>
            </div>
            <p className="truncate text-xs font-medium text-slate-600 sm:text-right">
              {teamIdentity.institutionName}
            </p>
          </section>
        ) : null}

        {children}
      </main>

      <footer className="border-t border-[#D9AD61]/25 bg-[#200000] text-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <BrandMark
              src="/brand/sjcc-logo.png"
              alt="St. Joseph's College of Commerce"
              className="h-6 w-auto shrink-0 object-contain"
              fallbackLabel="SJCC"
            />
            <span className="text-white/25" aria-hidden="true">
              |
            </span>
            <BrandMark
              src="/brand/bba-logo.png"
              alt="Department of Business Administration"
              className="h-5 w-auto shrink-0 object-contain"
              fallbackLabel="BBA"
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/75">
            <span>{siteConfig.department}</span>
            <span className="text-[#D9AD61]/60" aria-hidden="true">
              ·
            </span>
            <span className="font-medium whitespace-nowrap text-[#D9AD61]">
              4–5 December 2026
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
