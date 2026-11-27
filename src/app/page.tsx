import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  Building2,
  FileSearch,
  UserCheck,
  UserCog,
} from "lucide-react";
import { CmsShell } from "@/components/layout/CmsShell";
import { AuthNoticeBanner } from "@/components/cms/AuthNoticeBanner";
import { ModuleOverviewGrid } from "@/components/cms/ModuleOverviewGrid";
import { CMS_MODULES } from "@/lib/navigation";
import { siteConfig } from "@/lib/site-config";
import { requireActiveUser } from "@/lib/auth/guards";
import { ALL_ORGANISER_ROLES } from "@/lib/auth/policy";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatOrganiserRole } from "@/types/auth";

export const dynamic = "force-dynamic";

const FOUNDATION_CHECKLIST = [
  {
    id: "01",
    area: "Organiser Auth & Role Governance",
    scope: "Super Admin & Event Coordinator profiles, server guards, and account provisioning",
    state: "Active",
  },
  {
    id: "02",
    area: "Row Level Security & Audit Trail",
    scope: "Versioned SQL migrations, strict RLS policies, and append-only audit logs",
    state: "Active",
  },
  {
    id: "03",
    area: "Events, Rounds & Criteria",
    scope: "Event setup, entry/codename modes, ordered rounds, scoring method, and lock triggers",
    state: "Active",
  },
  {
    id: "04",
    area: "Contingents, Participants & Entries",
    scope: "Variable team rosters, independent individuals, and strict contingent XOR participant entries",
    state: "Active",
  },
  {
    id: "05",
    area: "Registration Imports & Codenames",
    scope: "CSV/XLSX mapping, server validation, atomic batch commits, and blind codenames",
    state: "Active",
  },
  {
    id: "06",
    area: "Round Releases & Case PDFs",
    scope: "Server-authoritative round countdowns, manual reopen controls, and PDF management",
    state: "Active",
  },
  {
    id: "07",
    area: "Team Portal & Participant Access",
    scope: "Contingent login, single-session enforcement, live round windows, and document viewer",
    state: "Active",
  },
  {
    id: "08",
    area: "Overall Leaderboard & Publication",
    scope: "Draft numeric scores, automatic tie ranking (1, 1, 3), and live snapshot publication",
    state: "Active",
  },
] as const;

interface StructureCounts {
  eventsCount: number | null;
  roundsCount: number | null;
  contingentsCount: number | null;
  participantsCount: number | null;
  entriesCount: number | null;
  migrationMissing: boolean;
}

async function fetchStructureCounts(): Promise<StructureCounts> {
  try {
    const supabase = await createSupabaseServerClient();
    const [eventsRes, roundsRes, contingentsRes, participantsRes, entriesRes] =
      await Promise.all([
        supabase.from("events").select("*", { count: "exact", head: true }),
        supabase.from("rounds").select("*", { count: "exact", head: true }),
        supabase.from("contingents").select("*", { count: "exact", head: true }),
        supabase
          .from("participants")
          .select("*", { count: "exact", head: true }),
        supabase
          .from("event_entries")
          .select("*", { count: "exact", head: true }),
      ]);

    const anyError =
      eventsRes.error ||
      roundsRes.error ||
      contingentsRes.error ||
      participantsRes.error ||
      entriesRes.error;

    if (anyError) {
      return {
        eventsCount: null,
        roundsCount: null,
        contingentsCount: null,
        participantsCount: null,
        entriesCount: null,
        migrationMissing: true,
      };
    }

    return {
      eventsCount: eventsRes.count ?? 0,
      roundsCount: roundsRes.count ?? 0,
      contingentsCount: contingentsRes.count ?? 0,
      participantsCount: participantsRes.count ?? 0,
      entriesCount: entriesRes.count ?? 0,
      migrationMissing: false,
    };
  } catch {
    return {
      eventsCount: null,
      roundsCount: null,
      contingentsCount: null,
      participantsCount: null,
      entriesCount: null,
      migrationMissing: true,
    };
  }
}

export default async function HomePage() {
  const { sessionUser } = await requireActiveUser(ALL_ORGANISER_ROLES, {
    routeLabel: "/",
  });
  const isSuperAdmin = sessionUser.role === "super_admin";
  const counts = await fetchStructureCounts();

  return (
    <CmsShell
      user={sessionUser}
      breadcrumbs={[
        { label: siteConfig.appName, href: "/" },
        { label: "System Overview" },
      ]}
    >
      <section className="space-y-2 border-b border-slate-200 pb-6">
        <p className="text-xs font-medium text-[#4B0507]">
          {siteConfig.institution} · {siteConfig.department}
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Virtuoso Competition Management System
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
          Protected organiser workspace for Virtuoso (4–5 December 2026). Signed
          in as{" "}
          <span className="font-medium text-slate-900">
            {sessionUser.fullName}
          </span>{" "}
          ({formatOrganiserRole(sessionUser.role)}).
        </p>
      </section>

      <AuthNoticeBanner user={sessionUser} />

      {counts.migrationMissing ? (
        <div
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          Competition database tables are not reachable yet. Apply{" "}
          <code className="font-mono text-xs">
            supabase/migrations/202611160003_stage2a_competition_structure.sql
          </code>{" "}
          to your Supabase project to enable events, rounds, criteria,
          contingents, participants, and event entries.
        </div>
      ) : null}

      <section aria-labelledby="competition-operations-heading" className="space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h2
              id="competition-operations-heading"
              className="font-display text-lg font-semibold tracking-tight text-slate-900"
            >
              Competition Operations
            </h2>
            <p className="text-sm text-slate-600">
              Configure events, round releases, judging rubrics, institutional
              contingents, participants, and event entries.
            </p>
          </div>
          {!counts.migrationMissing ? (
            <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums text-slate-600">
              <span>{counts.eventsCount} events</span>
              <span>{counts.roundsCount} rounds</span>
              <span>{counts.contingentsCount} contingents</span>
              <span>{counts.participantsCount} participants</span>
              <span>{counts.entriesCount} entries</span>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Link
            href="/events"
            className="group flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300 hover:bg-slate-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-[#4B0507]">
                  <Award className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="font-mono text-xs tabular-nums text-emerald-700">
                  {counts.eventsCount !== null
                    ? `${counts.eventsCount} configured`
                    : "Active"}
                </span>
              </div>
              <h3 className="font-display text-base font-semibold text-slate-900 group-hover:text-[#4B0507]">
                Events, Rounds &amp; Criteria
              </h3>
              <p className="text-sm leading-relaxed text-slate-600">
                Manage competition events, entry and codename modes, round
                order, scoring settings, and judging criteria.
              </p>
            </div>
            <div className="mt-4 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-xs font-medium text-slate-700 group-hover:text-[#4B0507]">
              <span>Open events workspace</span>
              <ArrowRight
                className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </div>
          </Link>

          <Link
            href="/contingents"
            className="group flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300 hover:bg-slate-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-[#4B0507]">
                  <Building2 className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="font-mono text-xs tabular-nums text-emerald-700">
                  {counts.contingentsCount !== null
                    ? `${counts.contingentsCount} registered`
                    : "Active"}
                </span>
              </div>
              <h3 className="font-display text-base font-semibold text-slate-900 group-hover:text-[#4B0507]">
                Contingents &amp; Teams
              </h3>
              <p className="text-sm leading-relaxed text-slate-600">
                Manage institutional contingents, variable team rosters, team
                leads, and activation status.
              </p>
            </div>
            <div className="mt-4 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-xs font-medium text-slate-700 group-hover:text-[#4B0507]">
              <span>Open contingents registry</span>
              <ArrowRight
                className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </div>
          </Link>

          <Link
            href="/participants"
            className="group flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300 hover:bg-slate-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-[#4B0507]">
                  <UserCheck className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="font-mono text-xs tabular-nums text-emerald-700">
                  {counts.participantsCount !== null
                    ? `${counts.participantsCount} registered`
                    : "Active"}
                </span>
              </div>
              <h3 className="font-display text-base font-semibold text-slate-900 group-hover:text-[#4B0507]">
                Participants Registry
              </h3>
              <p className="text-sm leading-relaxed text-slate-600">
                Register contingent team members or independent individual
                participants without forcing contingent membership.
              </p>
            </div>
            <div className="mt-4 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-xs font-medium text-slate-700 group-hover:text-[#4B0507]">
              <span>Open participants registry</span>
              <ArrowRight
                className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </div>
          </Link>
        </div>
      </section>

      {isSuperAdmin ? (
        <section aria-labelledby="admin-tools-heading" className="space-y-4">
          <div>
            <h2
              id="admin-tools-heading"
              className="font-display text-lg font-semibold tracking-tight text-slate-900"
            >
              Super Admin Governance
            </h2>
            <p className="text-sm text-slate-600">
              Provision organiser accounts, manage activation status, and review
              immutable security and structure audit records.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Link
              href="/admin/accounts"
              className="group flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300 hover:bg-slate-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-[#4B0507]">
                    <UserCog className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="text-xs font-medium text-emerald-700">
                    Active
                  </span>
                </div>
                <h3 className="font-display text-base font-semibold text-slate-900 group-hover:text-[#4B0507]">
                  Organiser Accounts
                </h3>
                <p className="text-sm leading-relaxed text-slate-600">
                  Create Event Coordinator accounts, assign roles, and activate
                  or deactivate organiser access.
                </p>
              </div>
              <div className="mt-4 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-xs font-medium text-slate-700 group-hover:text-[#4B0507]">
                <span>Manage organiser accounts</span>
                <ArrowRight
                  className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </div>
            </Link>

            <Link
              href="/admin/audit-logs"
              className="group flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300 hover:bg-slate-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-[#4B0507]">
                    <FileSearch className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="text-xs font-medium text-emerald-700">
                    Active
                  </span>
                </div>
                <h3 className="font-display text-base font-semibold text-slate-900 group-hover:text-[#4B0507]">
                  Security &amp; Structure Audit Log
                </h3>
                <p className="text-sm leading-relaxed text-slate-600">
                  Inspect append-only records of account provisioning, event and
                  round setup, judging criteria edits, and participant entries.
                </p>
              </div>
              <div className="mt-4 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-xs font-medium text-slate-700 group-hover:text-[#4B0507]">
                <span>Open audit log viewer</span>
                <ArrowRight
                  className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </div>
            </Link>
          </div>
        </section>
      ) : null}

      <ModuleOverviewGrid modules={CMS_MODULES} />

      <section aria-labelledby="foundation-status-heading" className="space-y-4">
        <div>
          <h2
            id="foundation-status-heading"
            className="font-display text-lg font-semibold tracking-tight text-slate-900"
          >
            Platform Capabilities
          </h2>
          <p className="text-sm text-slate-600">
            Active Virtuoso CMS modules and governance controls for fest operations.
          </p>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-600">
                <th scope="col" className="px-4 py-3 font-mono">
                  #
                </th>
                <th scope="col" className="px-4 py-3">
                  Capability
                </th>
                <th scope="col" className="px-4 py-3">
                  Scope
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {FOUNDATION_CHECKLIST.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-500">
                    {item.id}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {item.area}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.scope}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs font-medium text-emerald-700">
                      {item.state}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </CmsShell>
  );
}
