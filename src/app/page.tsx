import React from "react";
import Link from "next/link";
import { ArrowRight, FileSearch, UserCog } from "lucide-react";
import { CmsShell } from "@/components/layout/CmsShell";
import { AuthNoticeBanner } from "@/components/cms/AuthNoticeBanner";
import { ModuleOverviewGrid } from "@/components/cms/ModuleOverviewGrid";
import { CMS_MODULES } from "@/lib/navigation";
import { siteConfig } from "@/lib/site-config";
import { requireActiveUser } from "@/lib/auth/guards";
import { ALL_ORGANISER_ROLES } from "@/lib/auth/policy";
import { formatOrganiserRole } from "@/types/auth";

export const dynamic = "force-dynamic";

const FOUNDATION_CHECKLIST = [
  {
    id: "01",
    area: "Next.js App Router & TypeScript",
    scope: "Strict TypeScript configuration with src/ directory layout",
    state: "Configured",
  },
  {
    id: "02",
    area: "Supabase Auth & SSR Session Refresh",
    scope: "Browser/server/admin clients, proxy.ts refresh, login and logout",
    state: "Configured",
  },
  {
    id: "03",
    area: "Organiser Roles & Server Guards",
    scope: "Super Admin & Event Coordinator profiles with requireActiveUser()",
    state: "Configured",
  },
  {
    id: "04",
    area: "Row Level Security & Audit Logs",
    scope: "Versioned SQL migrations, strict RLS policies, immutable audit trail",
    state: "Configured",
  },
  {
    id: "05",
    area: "Events, Rounds & Deployment",
    scope: "Competition setup, round creation, and deployment controls",
    state: "Not Yet Implemented",
  },
  {
    id: "06",
    area: "Competitor Portal",
    scope: "Separate team login interface for deployed round access",
    state: "Not Yet Implemented",
  },
] as const;

export default async function HomePage() {
  const { sessionUser } = await requireActiveUser(ALL_ORGANISER_ROLES, {
    routeLabel: "/",
  });
  const isSuperAdmin = sessionUser.role === "super_admin";

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
              immutable security audit records.
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
                    Active in Stage 1B
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
                    Active in Stage 1B
                  </span>
                </div>
                <h3 className="font-display text-base font-semibold text-slate-900 group-hover:text-[#4B0507]">
                  Security Audit Log
                </h3>
                <p className="text-sm leading-relaxed text-slate-600">
                  Inspect append-only records of account provisioning, role
                  changes, status toggles, and sign-in events.
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
            Platform Readiness
          </h2>
          <p className="text-sm text-slate-600">
            Current implementation boundary for Stage 1B.
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
                  Layer
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
                    <span
                      className={`text-xs font-medium ${
                        item.state === "Configured"
                          ? "text-emerald-700"
                          : "text-slate-500"
                      }`}
                    >
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
