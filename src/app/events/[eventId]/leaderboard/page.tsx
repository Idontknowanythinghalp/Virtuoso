import React from "react";
import { notFound } from "next/navigation";
import { CmsShell } from "@/components/layout/CmsShell";
import { LeaderboardManager } from "@/components/competition/LeaderboardManager";
import { requireActiveUser } from "@/lib/auth/guards";
import { ALL_ORGANISER_ROLES } from "@/lib/auth/policy";
import { getOrganiserEventLeaderboard } from "@/lib/leaderboard/read";
import { siteConfig } from "@/lib/site-config";

export const dynamic = "force-dynamic";

interface EventLeaderboardPageProps {
  params: Promise<{ eventId: string }>;
}

export default async function EventLeaderboardPage({
  params,
}: EventLeaderboardPageProps) {
  const { sessionUser } = await requireActiveUser(ALL_ORGANISER_ROLES, {
    routeLabel: "/events/[eventId]/leaderboard",
  });

  const { eventId } = await params;
  const loaded = await getOrganiserEventLeaderboard(eventId);

  if (!loaded.ok) {
    notFound();
  }

  return (
    <CmsShell
      user={sessionUser}
      breadcrumbs={[
        { label: siteConfig.appName, href: "/" },
        { label: "Events & Rounds", href: "/events" },
        {
          label: `${loaded.event.code} · ${loaded.event.name}`,
          href: `/events/${loaded.event.id}`,
        },
        { label: "Overall Leaderboard" },
      ]}
    >
      <section className="space-y-2 border-b border-slate-200 pb-6">
        <p className="font-mono text-xs font-medium text-[#4B0507]">
          {loaded.event.code} · Overall Leaderboard
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Overall Leaderboard
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
          Maintain overall event standings for registered contingents,
          including manual positions, tied ranks, and flexible score or result
          values.
        </p>
      </section>

      <LeaderboardManager
        event={loaded.event}
        entries={loaded.entries}
        eligibleContingents={loaded.eligibleContingents}
        migrationMissing={loaded.migrationMissing}
        loadError={loaded.loadError}
      />
    </CmsShell>
  );
}
