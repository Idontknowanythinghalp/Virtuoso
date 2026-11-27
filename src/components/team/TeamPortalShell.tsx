import React from "react";
import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";
import { siteConfig } from "@/lib/site-config";

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
    <div className="flex min-h-screen flex-col justify-between bg-[#F8FAFC]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {brandMark}
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-[#4B0507]">
                {siteConfig.institution}
              </p>
              <p className="truncate font-display text-base font-bold text-slate-900">
                Virtuoso Team Portal
              </p>
            </div>
          </div>

          <form action={logoutAction}>
            <button
              type="submit"
              className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium whitespace-nowrap text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Sign Out</span>
            </button>
          </form>
        </div>

        <nav
          aria-label="Team portal navigation"
          className="border-t border-slate-100 bg-slate-50/70"
        >
          <div className="mx-auto flex max-w-4xl items-center gap-6 overflow-x-auto px-4 whitespace-nowrap sm:px-6">
            <Link
              href="/team"
              aria-current={activeNav === "dashboard" ? "page" : undefined}
              className={`border-b-2 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507] ${
                activeNav === "dashboard"
                  ? "border-[#4B0507] font-semibold text-[#4B0507]"
                  : "border-transparent font-medium text-slate-600 hover:text-slate-900"
              }`}
            >
              Dashboard
            </Link>
            <Link
              href="/team/rounds"
              aria-current={activeNav === "rounds" ? "page" : undefined}
              className={`border-b-2 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507] ${
                activeNav === "rounds"
                  ? "border-[#4B0507] font-semibold text-[#4B0507]"
                  : "border-transparent font-medium text-slate-600 hover:text-slate-900"
              }`}
            >
              Current Rounds
            </Link>
            {standingsNavLink}
          </div>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
        {showSessionStrip ? (
          <section
            aria-label="Signed-in contingent"
            className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Signed in as{" "}
                  <span className="font-mono font-semibold text-slate-900">
                    {teamIdentity.contingentCode}
                  </span>
                </p>
                <p className="text-sm font-semibold text-slate-900">
                  {teamIdentity.contingentName}
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-600">
              {teamIdentity.institutionName}
            </p>
          </section>
        ) : null}

        {children}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4 text-xs text-slate-500 sm:px-6">
          <span>{siteConfig.department}</span>
          <span className="whitespace-nowrap">4–5 December 2026</span>
        </div>
      </footer>
    </div>
  );
}
