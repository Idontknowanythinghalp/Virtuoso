import React from "react";
import { CmsShell } from "@/components/layout/CmsShell";
import {
  ContingentsManager,
  type ContingentSummaryItem,
} from "@/components/competition/ContingentsManager";
import { requireActiveUser } from "@/lib/auth/guards";
import { ALL_ORGANISER_ROLES } from "@/lib/auth/policy";
import { siteConfig } from "@/lib/site-config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ContingentRecord } from "@/types/competition";

export const dynamic = "force-dynamic";

async function loadContingentsSummary(): Promise<{
  contingents: ContingentSummaryItem[];
  migrationMissing: boolean;
}> {
  const supabase = await createSupabaseServerClient();
  const { data: contingentData, error } = await supabase
    .from("contingents")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<ContingentRecord[]>();

  if (error || !contingentData) {
    return { contingents: [], migrationMissing: Boolean(error) };
  }

  const [{ data: memberRows }, { data: entryRows }] = await Promise.all([
    supabase
      .from("participants")
      .select("contingent_id")
      .not("contingent_id", "is", null),
    supabase
      .from("event_entries")
      .select("contingent_id")
      .not("contingent_id", "is", null),
  ]);

  const memberCounts = new Map<string, number>();
  for (const row of memberRows ?? []) {
    const cid = (row as { contingent_id: string | null }).contingent_id;
    if (cid) {
      memberCounts.set(cid, (memberCounts.get(cid) ?? 0) + 1);
    }
  }

  const entryCounts = new Map<string, number>();
  for (const row of entryRows ?? []) {
    const cid = (row as { contingent_id: string | null }).contingent_id;
    if (cid) {
      entryCounts.set(cid, (entryCounts.get(cid) ?? 0) + 1);
    }
  }

  const contingents: ContingentSummaryItem[] = contingentData.map((c) => ({
    ...c,
    memberCount: memberCounts.get(c.id) ?? 0,
    entryCount: entryCounts.get(c.id) ?? 0,
  }));

  return { contingents, migrationMissing: false };
}

export default async function ContingentsPage() {
  const { sessionUser } = await requireActiveUser(ALL_ORGANISER_ROLES, {
    routeLabel: "/contingents",
  });

  const { contingents, migrationMissing } = await loadContingentsSummary();

  return (
    <CmsShell
      user={sessionUser}
      breadcrumbs={[
        { label: siteConfig.appName, href: "/" },
        { label: "Contingents" },
      ]}
    >
      <section className="space-y-2 border-b border-slate-200 pb-6">
        <p className="text-xs font-medium text-[#4B0507]">
          Stage 2A · Participant Registry
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Contingents &amp; Teams
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
          Manage participating institutional contingents and variable-size team
          rosters. Individual participants without a contingent can be managed in
          the Participants Registry.
        </p>
      </section>

      <ContingentsManager
        contingents={contingents}
        migrationMissing={migrationMissing}
      />
    </CmsShell>
  );
}
