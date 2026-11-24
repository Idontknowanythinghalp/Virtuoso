import React from "react";
import { notFound } from "next/navigation";
import { CmsShell } from "@/components/layout/CmsShell";
import {
  ParticipantDetailManager,
  type ParticipantEntryWithEvent,
} from "@/components/competition/ParticipantDetailManager";
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

interface ParticipantDetailPageProps {
  params: Promise<{ participantId: string }>;
}

export default async function ParticipantDetailPage({
  params,
}: ParticipantDetailPageProps) {
  const { sessionUser } = await requireActiveUser(ALL_ORGANISER_ROLES, {
    routeLabel: "/participants/[participantId]",
  });

  const { participantId } = await params;
  const idCheck = validateUuid(participantId, "Participant");
  if (!idCheck.ok) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();

  const [participantRes, contingentsRes, entriesRes, eventsRes] =
    await Promise.all([
      supabase
        .from("participants")
        .select("*")
        .eq("id", idCheck.value)
        .maybeSingle<ParticipantRecord>(),
      supabase
        .from("contingents")
        .select("id, contingent_code, name, institution_name, is_active")
        .order("contingent_code", { ascending: true })
        .returns<
          Pick<
            ContingentRecord,
            "id" | "contingent_code" | "name" | "institution_name" | "is_active"
          >[]
        >(),
      supabase
        .from("event_entries")
        .select("*")
        .eq("participant_id", idCheck.value)
        .order("created_at", { ascending: false })
        .returns<EventEntryRecord[]>(),
      supabase
        .from("events")
        .select("id, code, name, status")
        .returns<Pick<EventRecord, "id" | "code" | "name" | "status">[]>(),
    ]);

  if (participantRes.error || !participantRes.data) {
    notFound();
  }

  const participant = participantRes.data;
  const contingents = contingentsRes.data ?? [];
  const rawEntries = entriesRes.data ?? [];
  const eventsById = new Map((eventsRes.data ?? []).map((e) => [e.id, e]));

  const entries: ParticipantEntryWithEvent[] = rawEntries.map((entry) => ({
    ...entry,
    event: eventsById.get(entry.event_id) ?? null,
  }));

  return (
    <CmsShell
      user={sessionUser}
      breadcrumbs={[
        { label: siteConfig.appName, href: "/" },
        { label: "Participants", href: "/participants" },
        { label: `${participant.participant_code} · ${participant.full_name}` },
      ]}
    >
      <section className="space-y-2 border-b border-slate-200 pb-6">
        <p className="font-mono text-xs font-medium text-[#4B0507]">
          {participant.participant_code}
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {participant.full_name}
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
          {participant.institution_name}
        </p>
      </section>

      <ParticipantDetailManager
        participant={participant}
        contingents={contingents}
        entries={entries}
      />
    </CmsShell>
  );
}
