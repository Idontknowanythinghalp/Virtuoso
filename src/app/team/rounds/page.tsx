import React from "react";
import { AlertTriangle, Layers, Radio } from "lucide-react";
import { logoutTeamAction } from "@/app/actions/team-auth";
import { requireActiveTeam } from "@/lib/auth/team-guards";
import { loadTeamCurrentRoundsForTeam } from "@/lib/team-portal/rounds-read";
import { loadParticipantDocumentsForVisibleRounds } from "@/lib/team-portal/documents-read";
import { BrandMark } from "@/components/cms/BrandMark";
import { ParticipantRoundDocuments } from "@/components/team/ParticipantRoundDocuments";
import { RefreshRoundsButton } from "@/components/team/RefreshRoundsButton";
import { TeamPortalShell } from "@/components/team/TeamPortalShell";
import { TeamStandingsNavLink } from "@/components/team/TeamStandingsLink";

export const dynamic = "force-dynamic";

export default async function TeamCurrentRoundsPage() {
  const team = await requireActiveTeam({ nextPath: "/team/rounds" });
  const roundsResult = await loadTeamCurrentRoundsForTeam(team);
  const documentsResult = roundsResult.ok
    ? await loadParticipantDocumentsForVisibleRounds(team, roundsResult.rounds)
    : null;

  return (
    <TeamPortalShell
      activeNav="rounds"
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
      standingsNavLink={<TeamStandingsNavLink />}
    >

        <section
          aria-labelledby="current-rounds-heading"
          className="space-y-4"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <h1
                id="current-rounds-heading"
                className="font-display text-xl font-bold text-slate-900"
              >
                Current Rounds
              </h1>
              <p className="text-sm text-slate-600">
                Competition rounds that are currently open for participating teams.
              </p>
            </div>
            <RefreshRoundsButton />
          </div>

          {!roundsResult.ok ? (
            <div
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
                    Unable to Load Active Rounds
                  </h2>
                  <p className="text-sm leading-relaxed text-amber-900">
                    {roundsResult.error}
                  </p>
                </div>
              </div>
            </div>
          ) : roundsResult.rounds.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-500">
                <Layers className="h-5 w-5" aria-hidden="true" />
              </div>
              <h2 className="mt-4 font-display text-base font-semibold text-slate-900">
                There are no active rounds available right now.
              </h2>
              <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-slate-600">
                When a competition round is open for teams, its details will
                appear here.
              </p>
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {roundsResult.rounds.map((item) => (
                <li key={item.roundId}>
                  <article className="flex h-full flex-col justify-between rounded-lg border border-slate-200 bg-white p-5">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-semibold uppercase tracking-wide text-[#4B0507]">
                            {item.eventCode}
                          </span>
                          <span className="text-xs text-slate-300" aria-hidden="true">
                            /
                          </span>
                          <span className="text-xs font-semibold text-slate-700">
                            Round {item.roundNumber}
                          </span>
                        </div>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                          <Radio className="h-3 w-3" aria-hidden="true" />
                          <span>Open Now</span>
                        </span>
                      </div>

                      <h2 className="mt-2 font-display text-base font-bold text-slate-900">
                        {item.roundName}
                      </h2>

                      <p className="mt-0.5 text-xs font-medium text-slate-500">
                        {item.eventName}
                      </p>

                      <p className="mt-3 text-sm leading-relaxed text-slate-600">
                        {item.roundDescription?.trim()
                          ? item.roundDescription
                          : "No round description has been added yet."}
                      </p>
                    </div>

                    <ParticipantRoundDocuments
                      eventCode={item.eventCode}
                      roundNumber={item.roundNumber}
                      roundName={item.roundName}
                      documents={
                        documentsResult?.ok
                          ? (documentsResult.documentsByRoundId[item.roundId] ??
                            [])
                          : []
                      }
                      loadError={
                        documentsResult && !documentsResult.ok
                          ? documentsResult.error
                          : null
                      }
                    />
                  </article>
                </li>
              ))}
            </ul>
          )}
        </section>
    </TeamPortalShell>
  );
}
