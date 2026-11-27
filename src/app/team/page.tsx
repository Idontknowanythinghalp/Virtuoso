import React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarCheck2,
  ClipboardList,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { logoutTeamAction } from "@/app/actions/team-auth";
import { requireActiveTeam } from "@/lib/auth/team-guards";
import { siteConfig } from "@/lib/site-config";
import { loadTeamRegisteredEventsForTeam } from "@/lib/team-portal/read";
import {
  ENTRY_STATUS_LABELS,
  EVENT_STATUS_LABELS,
} from "@/types/competition";
import { BrandMark } from "@/components/cms/BrandMark";
import {
  TeamStandingsDashboardCard,
  TeamStandingsNavLink,
} from "@/components/team/TeamStandingsLink";

export const dynamic = "force-dynamic";

export default async function TeamPortalPage() {
  const team = await requireActiveTeam({ nextPath: "/team" });
  const dashboard = await loadTeamRegisteredEventsForTeam(team);

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
              aria-current="page"
              className="border-b-2 border-[#4B0507] py-2.5 text-sm font-semibold text-[#4B0507]"
            >
              Dashboard
            </Link>
            <Link
              href="/team/rounds"
              className="border-b-2 border-transparent py-2.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
            >
              Current Rounds
            </Link>
            <TeamStandingsNavLink />
          </div>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
        <section
          aria-labelledby="team-session-heading"
          className="rounded-lg border border-slate-200 bg-white p-6"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h1
                  id="team-session-heading"
                  className="font-display text-xl font-bold text-slate-900"
                >
                  Contingent Dashboard
                </h1>
                <p className="text-sm text-slate-600">
                  Signed in on this device for your registered Virtuoso
                  contingent.
                </p>
              </div>
            </div>

            {dashboard.ok ? (
              <div className="inline-flex shrink-0 items-center gap-2 self-start rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">
                <CalendarCheck2
                  className="h-3.5 w-3.5 text-[#4B0507]"
                  aria-hidden="true"
                />
                <span>
                  {dashboard.events.length}{" "}
                  {dashboard.events.length === 1
                    ? "Registered Event"
                    : "Registered Events"}
                </span>
              </div>
            ) : null}
          </div>

          <dl className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-medium text-slate-500">Team Code</dt>
              <dd className="mt-1 font-mono text-sm font-semibold text-slate-900">
                {team.contingentCode}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Contingent</dt>
              <dd className="mt-1 text-sm font-medium text-slate-900">
                {team.contingentName}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">
                Institution
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {team.institutionName}
              </dd>
            </div>
          </dl>

          <p className="mt-5 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
            Signing out ends only this device&apos;s session. Other authorised
            devices signed in for your contingent remain active up to the
            4-device limit.
          </p>
        </section>

        <TeamStandingsDashboardCard />

        <section
          aria-labelledby="registered-events-heading"
          className="space-y-4"
        >
          <div className="space-y-1">
            <h2
              id="registered-events-heading"
              className="font-display text-lg font-bold text-slate-900"
            >
              Registered Events
            </h2>
            <p className="text-sm text-slate-600">
              Competition events in which your contingent currently holds an
              active registration or check-in.
            </p>
          </div>

          {!dashboard.ok ? (
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
                  <h3 className="font-display text-sm font-semibold text-amber-950">
                    Unable to Load Registered Events
                  </h3>
                  <p className="text-sm leading-relaxed text-amber-900">
                    {dashboard.error}
                  </p>
                </div>
              </div>
            </div>
          ) : dashboard.events.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-500">
                <ClipboardList className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="mt-4 font-display text-base font-semibold text-slate-900">
                No Registered Events Yet
              </h3>
              <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-slate-600">
                Contingent{" "}
                <span className="font-mono font-semibold text-slate-800">
                  {team.contingentCode}
                </span>{" "}
                does not currently have any active event registrations
                (Registered or Checked In). Contact Virtuoso organisers if you
                expect an entry to appear here.
              </p>
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {dashboard.events.map((item) => {
                const isCheckedIn = item.entryStatus === "checked_in";
                return (
                  <li key={item.entryId}>
                    <article className="flex h-full flex-col justify-between rounded-lg border border-slate-200 bg-white p-5">
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <span className="font-mono text-xs font-semibold uppercase tracking-wide text-[#4B0507]">
                            {item.eventCode}
                          </span>
                          <span
                            className={`shrink-0 rounded border px-2 py-0.5 text-xs font-medium ${
                              isCheckedIn
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                : "border-slate-200 bg-slate-50 text-slate-700"
                            }`}
                          >
                            {ENTRY_STATUS_LABELS[item.entryStatus]}
                          </span>
                        </div>

                        <h3 className="mt-2 font-display text-base font-bold text-slate-900">
                          {item.eventName}
                        </h3>

                        <p className="mt-2 text-sm leading-relaxed text-slate-600">
                          {item.eventDescription?.trim()
                            ? item.eventDescription
                            : "No event description has been added yet."}
                        </p>
                      </div>

                      <dl className="mt-4 flex items-center justify-between gap-4 border-t border-slate-100 pt-3 text-xs">
                        <div className="flex items-center gap-1.5">
                          <dt className="text-slate-500">Entry:</dt>
                          <dd className="font-medium text-slate-800">
                            {ENTRY_STATUS_LABELS[item.entryStatus]}
                          </dd>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <dt className="text-slate-500">Event:</dt>
                          <dd className="font-medium text-slate-800">
                            {EVENT_STATUS_LABELS[item.eventStatus]}
                          </dd>
                        </div>
                      </dl>
                    </article>
                  </li>
                );
              })}
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
