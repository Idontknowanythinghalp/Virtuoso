import React from "react";
import { CmsShell } from "@/components/layout/CmsShell";
import { TeamSessionsManager } from "@/components/admin/TeamSessionsManager";
import { requireActiveUser } from "@/lib/auth/guards";
import { SUPER_ADMIN_ONLY } from "@/lib/auth/policy";
import {
  fetchTeamSessionDetails,
  fetchTeamSessionOverviews,
} from "@/lib/auth/team-sessions-read";
import { siteConfig } from "@/lib/site-config";

export const dynamic = "force-dynamic";

interface AdminTeamSessionsPageProps {
  searchParams: Promise<{
    team?: string;
  }>;
}

export default async function AdminTeamSessionsPage({
  searchParams,
}: AdminTeamSessionsPageProps) {
  const { sessionUser } = await requireActiveUser(SUPER_ADMIN_ONLY, {
    routeLabel: "/admin/team-sessions",
  });

  const params = await searchParams;
  const requestedTeam = (params.team ?? "").trim();

  const [overviewRes, initialDetailsRes] = await Promise.all([
    fetchTeamSessionOverviews(),
    requestedTeam
      ? fetchTeamSessionDetails(requestedTeam)
      : Promise.resolve(null),
  ]);

  return (
    <CmsShell
      user={sessionUser}
      breadcrumbs={[
        { label: siteConfig.appName, href: "/" },
        { label: "Administration" },
        { label: "Team Sessions" },
      ]}
    >
      <section className="space-y-2 border-b border-slate-200 pb-6">
        <p className="text-xs font-medium text-[#4B0507]">
          Super Admin Session Operations
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Team Sessions
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
          Monitor live participant device sessions, reclaim abandoned login
          slots under the 4-device limit, or force teams to sign out across all
          devices.
        </p>
      </section>

      {!overviewRes.ok ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800"
        >
          Unable to load team sessions right now ({overviewRes.error}). Verify
          that Stage 3B and Stage 4.5 database migrations have been applied.
        </div>
      ) : (
        <TeamSessionsManager
          initialOverview={overviewRes.data}
          initialDetails={
            initialDetailsRes && initialDetailsRes.ok
              ? initialDetailsRes.data
              : null
          }
          initialDetailsError={
            initialDetailsRes && !initialDetailsRes.ok
              ? initialDetailsRes.error
              : null
          }
        />
      )}
    </CmsShell>
  );
}
