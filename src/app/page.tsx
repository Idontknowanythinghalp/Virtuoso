import React from "react";
import { CmsShell } from "@/components/layout/CmsShell";
import { AuthNoticeBanner } from "@/components/cms/AuthNoticeBanner";
import { ModuleOverviewGrid } from "@/components/cms/ModuleOverviewGrid";
import { CMS_MODULES } from "@/lib/navigation";
import { siteConfig } from "@/lib/site-config";

const FOUNDATION_CHECKLIST = [
  {
    id: "01",
    area: "Next.js App Router & TypeScript",
    scope: "Strict TypeScript configuration with src/ directory layout",
    state: "Configured",
  },
  {
    id: "02",
    area: "Styling & Lint Tooling",
    scope: "Tailwind CSS v4 and ESLint (eslint-config-next)",
    state: "Configured",
  },
  {
    id: "03",
    area: "Environment Separation",
    scope: ".env.example placeholders with zero client-exposed secrets",
    state: "Configured",
  },
  {
    id: "04",
    area: "Authentication & Roles",
    scope: "Supabase Auth, session management, and RBAC permissions",
    state: "Deferred",
  },
  {
    id: "05",
    area: "Database Schema & RLS",
    scope: "PostgreSQL tables, migrations, and row-level security policies",
    state: "Deferred",
  },
  {
    id: "06",
    area: "Competition & Scoring Workflows",
    scope: "Events, contingents, judging sheets, results, and audit logs",
    state: "Deferred",
  },
] as const;

export default function HomePage() {
  return (
    <CmsShell breadcrumbs={[{ label: siteConfig.appName, href: "/" }, { label: "System Overview" }]}>
      <section className="space-y-2 border-b border-slate-200 pb-6">
        <p className="text-xs font-medium text-[#4B0507]">
          {siteConfig.institution} · {siteConfig.department}
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Virtuoso Competition Management System
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
          Administrative foundation shell for managing Virtuoso competitions,
          contingents, judging workflows, and official results. This Stage 1A
          build establishes the application architecture prior to authentication
          and database integration.
        </p>
      </section>

      <AuthNoticeBanner />

      <section
        aria-label="Temporary Git bundle download"
        className="flex flex-col gap-3 rounded-lg border border-slate-300 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-slate-900">
            Temporary Stage 1A Git Bundle Export
          </h2>
          <p className="text-sm text-slate-600">
            Download <span className="font-mono text-xs">virtuoso-stage1a.bundle</span>{" "}
            (1.8 MB) directly from this preview window to push commit{" "}
            <span className="font-mono text-xs">3ef4367</span> to{" "}
            <span className="font-mono text-xs">cms-foundation</span>.
          </p>
        </div>
        <a
          href="/api/stage1a-bundle"
          download="virtuoso-stage1a.bundle"
          className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md bg-[#4B0507] px-4 py-2 text-sm font-medium whitespace-nowrap text-white transition-colors hover:bg-[#330205] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
        >
          Download Bundle (1.8 MB)
        </a>
      </section>

      <ModuleOverviewGrid modules={CMS_MODULES} />

      <section aria-labelledby="foundation-status-heading" className="space-y-4">
        <div>
          <h2
            id="foundation-status-heading"
            className="font-display text-lg font-semibold tracking-tight text-slate-900"
          >
            Foundation Readiness
          </h2>
          <p className="text-sm text-slate-600">
            Current implementation boundary for Stage 1A.
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
