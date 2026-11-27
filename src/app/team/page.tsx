import React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck2,
  ClipboardList,
  Layers,
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
          className="h-10 w-10 shrink-0 rounded-md border border-[#542525] bg-[#2B0808] object-contain p-1"
          fallbackLabel="V"
        />
      }
      logoutAction={logoutTeamAction}
      standingsNavLink={<TeamStandingsNavLink />}
      showSessionStrip={false}
    >
      <section
        aria-labelledby="team-session-heading"
        className="overflow-hidden rounded-lg border border-[#542525] bg-[#2B0808] text-[#F5F0EC]"
      >
        <div className="p-6 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium tracking-wide text-[#D9AD61]">
                <span>Virtuoso 2026</span>
                <span aria-hidden="true">·</span>
                <span>Heirs of the Solstice</span>
              </div>
              <h1
                id="team-session-heading"
                className="font-display text-2xl font-bold tracking-tight text-[#F5F0EC] sm:text-3xl"
              >
                {team.contingentName}
              </h1>
              <p className="text-sm leading-relaxed text-[#B9AAA5]">
                {team.institutionName}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-3">
              <Link
                href="/team/rounds"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#D9AD61] px-4 py-2 text-sm font-semibold whitespace-nowrap text-[#200000] transition-colors hover:bg-[#E4BC77] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9AD61] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2B0808]"
              >
                <span>Open Current Rounds</span>
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </Link>
            </div>
          </div>

          <dl className="mt-6 grid gap-4 border-t border-[#542525] pt-5 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-medium text-[#B9AAA5]">Team Code</dt>
              <dd className="mt-1 font-mono text-base font-semibold tracking-wide text-[#D9AD61]">
                {team.contingentCode}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#B9AAA5]">
                Registered Events
              </dt>
              <dd className="mt-1 flex items-center gap-2 font-mono text-base font-semibold tabular-nums text-[#F5F0EC]">
                <CalendarCheck2
                  className="h-4 w-4 shrink-0 text-[#D9AD61]"
                  aria-hidden="true"
                />
                <span>
                  {dashboard.ok ? dashboard.events.length : "Unavailable"}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#B9AAA5]">
                Device Session
              </dt>
              <dd className="mt-1 flex items-center gap-2 text-sm font-medium text-[#F5F0EC]">
                <ShieldCheck
                  className="h-4 w-4 shrink-0 text-emerald-400"
                  aria-hidden="true"
                />
                <span>Active on this device</span>
              </dd>
            </div>
          </dl>
        </div>

        <div className="border-t border-[#542525] bg-[#350A0A] px-6 py-3 text-xs leading-relaxed text-[#B9AAA5] sm:px-7">
          Signing out ends only this device&apos;s session. Other authorised
          devices signed in for your contingent remain active up to the 4-device
          limit.
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section
          aria-labelledby="rounds-shortcut-heading"
          className="flex h-full flex-col justify-between gap-4 rounded-lg border border-[#542525] bg-[#2B0808] p-5 sm:p-6"
        >
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#542525] bg-[#350A0A] text-[#D9AD61]">
              <Layers className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h2
                id="rounds-shortcut-heading"
                className="font-display text-base font-bold text-[#F5F0EC]"
              >
                Current Rounds &amp; Briefs
              </h2>
              <p className="text-sm leading-relaxed text-[#B9AAA5]">
                Access live competition rounds and read case documents released
                by the organising committee.
              </p>
            </div>
          </div>

          <div className="pt-1">
            <Link
              href="/team/rounds"
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-[#D9AD61]/70 bg-[#401010] px-4 py-2 text-sm font-semibold whitespace-nowrap text-[#F5F0EC] transition-colors hover:border-[#D9AD61] hover:bg-[#D9AD61] hover:text-[#200000] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9AD61] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2B0808] sm:w-auto"
            >
              <span>Go to Current Rounds</span>
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </Link>
          </div>
        </section>

        <TeamStandingsDashboardCard />
      </div>

      <section aria-labelledby="registered-events-heading" className="space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <div className="space-y-0.5">
            <h2
              id="registered-events-heading"
              className="font-display text-lg font-bold text-[#F5F0EC] sm:text-xl"
            >
              Registered Events
            </h2>
            <p className="text-sm text-[#B9AAA5]">
              Competition events in which your contingent currently holds an
              active registration or check-in.
            </p>
          </div>
          {dashboard.ok && dashboard.events.length > 0 ? (
            <p className="font-mono text-xs tabular-nums text-[#D9AD61]">
              {dashboard.events.length}{" "}
              {dashboard.events.length === 1 ? "event" : "events"}
            </p>
          ) : null}
        </div>

        {!dashboard.ok ? (
          <div
            role="alert"
            className="rounded-lg border border-amber-400/45 bg-[#350A0A] p-5 text-[#F5F0EC]"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle
                className="mt-0.5 h-5 w-5 shrink-0 text-amber-300"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <h3 className="font-display text-sm font-semibold text-amber-200">
                  Unable to Load Registered Events
                </h3>
                <p className="text-sm leading-relaxed text-[#F5F0EC]/90">
                  {dashboard.error}
                </p>
              </div>
            </div>
          </div>
        ) : dashboard.events.length === 0 ? (
          <div className="rounded-lg border border-[#542525] bg-[#2B0808] p-8 text-center sm:p-10">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-md border border-[#542525] bg-[#350A0A] text-[#D9AD61]">
              <ClipboardList className="h-5 w-5" aria-hidden="true" />
            </div>
            <h3 className="mt-4 font-display text-base font-semibold text-[#F5F0EC]">
              No Registered Events Yet
            </h3>
            <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-[#B9AAA5]">
              Contingent{" "}
              <span className="font-mono font-semibold text-[#F5F0EC]">
                {team.contingentCode}
              </span>{" "}
              does not currently have any active event registrations (Registered
              or Checked In). Contact Virtuoso organisers if you expect an entry
              to appear here.
            </p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {dashboard.events.map((item) => {
              const isCheckedIn = item.entryStatus === "checked_in";
              return (
                <li key={item.entryId}>
                  <article className="flex h-full flex-col justify-between rounded-lg border border-[#542525] bg-[#2B0808] p-5 transition-colors hover:border-[#D9AD61]/55">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="font-mono text-xs font-semibold uppercase tracking-wide text-[#D9AD61]">
                          {item.eventCode}
                        </span>
                        <span
                          className={`shrink-0 rounded border px-2 py-0.5 text-xs font-medium ${
                            isCheckedIn
                              ? "border-emerald-400/40 bg-emerald-950/60 text-emerald-300"
                              : "border-[#D9AD61]/45 bg-[#350A0A] text-[#D9AD61]"
                          }`}
                        >
                          {ENTRY_STATUS_LABELS[item.entryStatus]}
                        </span>
                      </div>

                      <h3 className="mt-2 font-display text-base font-bold text-[#F5F0EC] sm:text-lg">
                        {item.eventName}
                      </h3>

                      <p className="mt-2 text-sm leading-relaxed text-[#B9AAA5]">
                        {item.eventDescription?.trim()
                          ? item.eventDescription
                          : "No event description has been added yet."}
                      </p>
                    </div>

                    <dl className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#542525] pt-3 text-xs">
                      <div className="flex items-center gap-1.5">
                        <dt className="text-[#B9AAA5]">Event Status:</dt>
                        <dd className="font-semibold text-[#F5F0EC]">
                          {EVENT_STATUS_LABELS[item.eventStatus]}
                        </dd>
                      </div>
                      {item.eventStatus === "active" ? (
                        <Link
                          href="/team/rounds"
                          className="inline-flex items-center gap-1 font-medium text-[#D9AD61] hover:text-[#E4BC77] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9AD61]"
                        >
                          <span>Check Rounds</span>
                          <ArrowRight className="h-3 w-3" aria-hidden="true" />
                        </Link>
                      ) : null}
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
