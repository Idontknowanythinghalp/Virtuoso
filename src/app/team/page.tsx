import React from "react";
import {
  AlertTriangle,
  CalendarCheck2,
  ClipboardList,
  ShieldCheck,
} from "lucide-react";
import { logoutTeamAction } from "@/app/actions/team-auth";
import { requireActiveTeam } from "@/lib/auth/team-guards";
import { loadTeamRegisteredEventsForTeam } from "@/lib/team-portal/read";
import {
  ENTRY_STATUS_LABELS,
  EVENT_STATUS_LABELS,
} from "@/types/competition";
import { BrandMark } from "@/components/cms/BrandMark";
import { TeamPortalShell } from "@/components/team/TeamPortalShell";
import {
  TeamStandingsDashboardCard,
  TeamStandingsNavLink,
} from "@/components/team/TeamStandingsLink";

export const dynamic = "force-dynamic";

export default async function TeamPortalPage() {
  const team = await requireActiveTeam({ nextPath: "/team" });
  const dashboard = await loadTeamRegisteredEventsForTeam(team);

  return (
    <TeamPortalShell
      activeNav="dashboard"
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
      showSessionStrip={false}
    >
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
                          <dt className="text-slate-500">Event Status:</dt>
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
    </TeamPortalShell>
  );
}
