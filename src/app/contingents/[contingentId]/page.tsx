import React from "react";
import { notFound } from "next/navigation";
import { CmsShell } from "@/components/layout/CmsShell";
import {
  ContingentDetailManager,
  type ContingentEntryWithEvent,
} from "@/components/competition/ContingentDetailManager";
import { requireActiveUser } from "@/lib/auth/guards";
import { ALL_ORGANISER_ROLES } from "@/lib/auth/policy";
import { validateUuid } from "@/lib/competition/validation";
import { siteConfig } from "@/lib/site-config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  ContingentRecord,
  EventEntryRecord,
  EventRecord,
  ParticipantRecord,
} from "@/types/competition";

export const dynamic = "force-dynamic";

interface ContingentDetailPageProps {
  params: Promise<{ contingentId: string }>;
}

export default async function ContingentDetailPage({
  params,
}: ContingentDetailPageProps) {
  const { sessionUser } = await requireActiveUser(ALL_ORGANISER_ROLES, {
    routeLabel: "/contingents/[contingentId]",
  });

  const { contingentId } = await params;
  const idCheck = validateUuid(contingentId, "Contingent");
  if (!idCheck.ok) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();

  const [contingentRes, membersRes, entriesRes, eventsRes] = await Promise.all([
    supabase
      .from("contingents")
      .select("*")
      .eq("id", idCheck.value)
      .maybeSingle<ContingentRecord>(),
    supabase
      .from("participants")
      .select("*")
      .eq("contingent_id", idCheck.value)
      .order("is_contingent_lead", { ascending: false })
      .order("full_name", { ascending: true })
      .returns<ParticipantRecord[]>(),
    supabase
      .from("event_entries")
      .select("*")
      .eq("contingent_id", idCheck.value)
      .order("created_at", { ascending: false })
      .returns<EventEntryRecord[]>(),
    supabase
      .from("events")
      .select("id, code, name, status")
      .returns<Pick<EventRecord, "id" | "code" | "name" | "status">[]>(),
  ]);

  if (contingentRes.error || !contingentRes.data) {
    notFound();
  }

  const contingent = contingentRes.data;
  const members = membersRes.data ?? [];
  const rawEntries = entriesRes.data ?? [];
  const eventsById = new Map((eventsRes.data ?? []).map((e) => [e.id, e]));

  const entries: ContingentEntryWithEvent[] = rawEntries.map((entry) => ({
    ...entry,
    event: eventsById.get(entry.event_id) ?? null,
  }));

  return (
    <CmsShell
      user={sessionUser}
      breadcrumbs={[
        { label: siteConfig.appName, href: "/" },
        { label: "Contingents", href: "/contingents" },
        { label: `${contingent.contingent_code} · ${contingent.name}` },
      ]}
    >
      <section className="space-y-2 border-b border-slate-200 pb-6">
        <p className="font-mono text-xs font-medium text-[#4B0507]">
          {contingent.contingent_code}
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {contingent.name}
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
          {contingent.institution_name}
          {contingent.institution_city
            ? ` · ${contingent.institution_city}`
            : ""}
        </p>
      </section>

      <ContingentDetailManager
        contingent={contingent}
        members={members}
        entries={entries}
      />
    </CmsShell>
  );
}
