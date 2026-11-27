import React from "react";
import Link from "next/link";
import { AlertTriangle, Layers, LogOut, Radio, ShieldCheck } from "lucide-react";
import { logoutTeamAction } from "@/app/actions/team-auth";
import { requireActiveTeam } from "@/lib/auth/team-guards";
import { siteConfig } from "@/lib/site-config";
import { loadTeamCurrentRoundsForTeam } from "@/lib/team-portal/rounds-read";
import { loadParticipantDocumentsForVisibleRounds } from "@/lib/team-portal/documents-read";
import { BrandMark } from "@/components/cms/BrandMark";
import { ParticipantRoundDocuments } from "@/components/team/ParticipantRoundDocuments";
import { RefreshRoundsButton } from "@/components/team/RefreshRoundsButton";

export const dynamic = "force-dynamic";

export default async function TeamCurrentRoundsPage() {
  const team = await requireActiveTeam({ nextPath: "/team/rounds" });
  const roundsResult = await loadTeamCurrentRoundsForTeam(team);
  const documentsResult = roundsResult.ok
    ? await loadParticipantDocumentsForVisibleRounds(team, roundsResult.rounds)
    : null;

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
              aria-current="page"
              className="border-b-2 border-[#4B0507] py-2.5 text-sm font-semibold text-[#4B0507]"
            >
              Current Rounds
            </Link>
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
