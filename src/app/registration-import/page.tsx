import React from "react";
import { CmsShell } from "@/components/layout/CmsShell";
import { RegistrationImportManager } from "@/components/imports/RegistrationImportManager";
import { requireActiveUser } from "@/lib/auth/guards";
import { ALL_ORGANISER_ROLES } from "@/lib/auth/policy";
import { siteConfig } from "@/lib/site-config";
import { getRegistrationImportHistoryAction } from "@/app/actions/registration-import";

export const dynamic = "force-dynamic";

export default async function RegistrationImportPage() {
  const { sessionUser } = await requireActiveUser(ALL_ORGANISER_ROLES, {
    routeLabel: "/registration-import",
  });

  const history = await getRegistrationImportHistoryAction();

  return (
    <CmsShell
      user={sessionUser}
      breadcrumbs={[
        { label: siteConfig.appName, href: "/" },
        { label: "Data Operations", href: "/registration-import" },
        { label: "Registration Import" },
      ]}
    >
      <section className="space-y-2 border-b border-slate-200 pb-6">
        <p className="font-mono text-xs font-medium text-[#4B0507]">
          Data Operations · Stage 2B
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Registration Data Import
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
          Import college registration exports from CSV or Excel (.xlsx) files. Verify column mappings, preview detected differences, and execute non-destructive imports that safeguard existing competition data.
        </p>
      </section>

      <RegistrationImportManager initialHistory={history} />
    </CmsShell>
  );
}
