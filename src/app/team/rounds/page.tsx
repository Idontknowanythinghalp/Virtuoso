import React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Layers, Radio } from "lucide-react";
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
          className="h-10 w-10 shrink-0 rounded-md border border-[#D9AD61]/35 bg-[#2B0304] object-contain p-1"
          fallbackLabel="V"
        />
      }
      logoutAction={logoutTeamAction}
      standingsNavLink={<TeamStandingsNavLink />}
    >
      <section aria-labelledby="current-rounds-heading" className="space-y-5">
        <div className="flex flex-col gap-4 border-b border-[#E5E1DF] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold tracking-wide text-[#4B0507]">
              Virtuoso 2026 · Live Round Windows
            </p>
            <h1
              id="current-rounds-heading"
              className="font-display text-2xl font-bold tracking-tight text-slate-900"
            >
              Current Rounds
            </h1>
            <p className="text-sm text-slate-600">
              Competition rounds that are currently open for participating
              teams.
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
          <div className="rounded-lg border border-[#E5E1DF] bg-white p-8 text-center sm:p-12">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-[#D9AD61]/40 bg-[#FDF9F0] text-[#4B0507]">
              <Layers className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 className="mt-4 font-display text-base font-bold text-slate-900 sm:text-lg">
              There are no active rounds available right now.
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
              When a competition round is open for teams, its details and round
              documents will appear here. Use{" "}
              <span className="font-medium text-slate-800">Refresh Rounds</span>{" "}
              once organisers announce a release.
            </p>
            <div className="mt-5">
              <Link
                href="/team"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#E5E1DF] bg-[#FAF8F6] px-4 py-2 text-sm font-medium text-slate-800 transition-colors hover:border-[#4B0507]/40 hover:text-[#4B0507] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
              >
                <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Back to Dashboard</span>
              </Link>
            </div>
          </div>
        ) : (
          <ul className="grid gap-5 md:grid-cols-2">
            {roundsResult.rounds.map((item) => (
              <li key={item.roundId}>
                <article className="flex h-full flex-col justify-between overflow-hidden rounded-lg border border-[#E5E1DF] bg-white transition-colors hover:border-[#4B0507]/35">
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-3 border-b border-[#E5E1DF] bg-[#FAF8F6] px-5 py-3">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold uppercase tracking-wide text-[#4B0507]">
                          {item.eventCode}
                        </span>
                        <span
                          className="text-xs text-slate-300"
                          aria-hidden="true"
                        >
                          ·
                        </span>
                        <span className="font-display text-xs font-semibold text-slate-700">
                          Round {item.roundNumber}
                        </span>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                        <Radio className="h-3 w-3" aria-hidden="true" />
                        <span>Open Now</span>
                      </span>
                    </div>

                    <div className="p-5">
                      <p className="text-xs font-medium text-slate-500">
                        {item.eventName}
                      </p>

                      <h2 className="mt-1 font-display text-lg font-bold text-slate-900">
                        {item.roundName}
                      </h2>

                      <p className="mt-2.5 text-sm leading-relaxed text-slate-600">
                        {item.roundDescription?.trim()
                          ? item.roundDescription
                          : "No round description has been added yet."}
                      </p>
                    </div>
                  </div>

                  <div className="px-5 pb-5">
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
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>
    </TeamPortalShell>
  );
}
