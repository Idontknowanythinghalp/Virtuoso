import React from "react";
import Link from "next/link";
import { AlertTriangle, LogOut, ShieldCheck } from "lucide-react";
import { logoutTeamAction } from "@/app/actions/team-auth";
import { requireActiveTeam } from "@/lib/auth/team-guards";
import { siteConfig } from "@/lib/site-config";
import { loadParticipantLeaderboardsForTeam } from "@/lib/team-portal/leaderboard-read";
import { BrandMark } from "@/components/cms/BrandMark";
import { ParticipantLeaderboardView } from "@/components/team/ParticipantLeaderboard";
import { TeamStandingsNavLink } from "@/components/team/TeamStandingsLink";

export const dynamic = "force-dynamic";

export default async function TeamLeaderboardPage() {
  const team = await requireActiveTeam({ nextPath: "/team/leaderboard" });
  const result = await loadParticipantLeaderboardsForTeam(team);

  return (
    <div className="flex min-h-screen flex-col justify-between bg-[#F8FAFC]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandMark
              src="/brand/virtuoso-emblem.png"
              alt="Virtuoso Emblem"
              className="h-9 w-9 shrink-0 rounded-md border border-slate-200 bg-[#200000] object-contain p-1"
              fallbackLabel="V"
            />
            <div>
              <p className="text-xs font-medium text-[#4B0507]">
                {siteConfig.institution}
              </p>
              <p className="font-display text-base font-bold text-slate-900">
                Virtuoso Team Portal
              </p>
            </div>
          </div>

          <form action={logoutTeamAction}>
            <button
              type="submit"
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
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
          <div className="mx-auto flex max-w-4xl items-center gap-6 px-4 sm:px-6">
            <Link
              href="/team"
              className="border-b-2 border-transparent py-2.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
            >
              Dashboard
            </Link>
            <Link
              href="/team/rounds"
              className="border-b-2 border-transparent py-2.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
            >
              Current Rounds
            </Link>
            <TeamStandingsNavLink isActive />
          </div>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
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
                  {team.contingentCode}
                </span>
              </p>
              <p className="text-sm font-semibold text-slate-900">
                {team.contingentName}
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-600">{team.institutionName}</p>
        </section>

        <section aria-labelledby="leaderboard-page-heading" className="space-y-4">
          <div className="space-y-1">
            <h1
              id="leaderboard-page-heading"
              className="font-display text-xl font-bold text-slate-900"
            >
              Event Standings
            </h1>
            <p className="text-sm text-slate-600">
              Official overall standings published for your registered
              competition events.
            </p>
          </div>

          {!result.ok ? (
            <section
              role="alert"
              className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-amber-950"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle
                  className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <h2 className="font-display text-sm font-semibold text-amber-950">
                    Unable to Load Leaderboard
                  </h2>
                  <p className="text-sm leading-relaxed text-amber-900">
                    {result.error}
                  </p>
                </div>
              </div>
            </section>
          ) : (
            <ParticipantLeaderboardView
              leaderboards={result.leaderboards}
              currentContingentId={team.contingentId}
            />
          )}
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 text-xs text-slate-500 sm:px-6">
          <span>{siteConfig.department}</span>
          <span>4–5 December 2026</span>
        </div>
      </footer>
    </div>
  );
}
