import React from "react";
import { AlertTriangle } from "lucide-react";
import { logoutTeamAction } from "@/app/actions/team-auth";
import { requireActiveTeam } from "@/lib/auth/team-guards";
import { loadParticipantLeaderboardsForTeam } from "@/lib/team-portal/leaderboard-read";
import { BrandMark } from "@/components/cms/BrandMark";
import { ParticipantLeaderboardView } from "@/components/team/ParticipantLeaderboard";
import { TeamPortalShell } from "@/components/team/TeamPortalShell";
import { TeamStandingsNavLink } from "@/components/team/TeamStandingsLink";

export const dynamic = "force-dynamic";

export default async function TeamLeaderboardPage() {
  const team = await requireActiveTeam({ nextPath: "/team/leaderboard" });
  const result = await loadParticipantLeaderboardsForTeam(team);

  return (
    <TeamPortalShell
      activeNav="leaderboard"
      teamIdentity={{
        contingentCode: team.contingentCode,
        contingentName: team.contingentName,
        institutionName: team.institutionName,
      }}
      brandMark={
        <BrandMark
          src="/brand/virtuoso-emblem.png"
          alt="Virtuoso Emblem"
          className="h-10 w-10 shrink-0 rounded-md border border-[#D9AD61]/35 bg-[#2B0304] object-contain p-1"
          fallbackLabel="V"
        />
      }
      logoutAction={logoutTeamAction}
      standingsNavLink={<TeamStandingsNavLink isActive />}
    >
      <section aria-labelledby="leaderboard-page-heading" className="space-y-5">
        <div className="space-y-1 border-b border-[#E5E1DF] pb-5">
          <p className="text-xs font-semibold tracking-wide text-[#4B0507]">
            Virtuoso 2026 · Official Results
          </p>
          <h1
            id="leaderboard-page-heading"
            className="font-display text-2xl font-bold tracking-tight text-slate-900"
          >
            Event Standings
          </h1>
          <p className="text-sm text-slate-600">
            Official overall standings published for your registered competition
            events.
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
    </TeamPortalShell>
  );
}
