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
          className="h-9 w-9 shrink-0 rounded-md border border-slate-200 bg-[#200000] object-contain p-1"
          fallbackLabel="V"
        />
      }
      logoutAction={logoutTeamAction}
      standingsNavLink={<TeamStandingsNavLink isActive />}
    >

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
    </TeamPortalShell>
  );
}
