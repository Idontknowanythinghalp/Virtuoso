import React from "react";
import { notFound } from "next/navigation";
import { CmsShell } from "@/components/layout/CmsShell";
import {
  CodenamesManager,
  type CodenameEntryView,
} from "@/components/competition/CodenamesManager";
import { requireActiveUser } from "@/lib/auth/guards";
import { ALL_ORGANISER_ROLES } from "@/lib/auth/policy";
import { classifyCodenameLoadError } from "@/lib/codenames/validation";
import { validateUuid } from "@/lib/competition/validation";
import { siteConfig } from "@/lib/site-config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  ContingentRecord,
  EntryCodenameRecord,
  EventEntryRecord,
  EventRecord,
  ParticipantRecord,
  RoundRecord,
} from "@/types/competition";

export const dynamic = "force-dynamic";

interface EventCodenamesPageProps {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ roundId?: string }>;
}

export default async function EventCodenamesPage({
  params,
  searchParams,
}: EventCodenamesPageProps) {
  const { sessionUser } = await requireActiveUser(ALL_ORGANISER_ROLES, {
    routeLabel: "/events/[eventId]/codenames",
  });

  const { eventId } = await params;
  const resolvedSearchParams = await searchParams;

  const eventCheck = validateUuid(eventId, "Event");
  if (!eventCheck.ok) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();

  const [eventRes, roundsRes, entriesRes, contingentsRes, participantsRes] =
    await Promise.all([
      supabase
        .from("events")
        .select("id, code, name, codename_mode, entry_mode, status")
        .eq("id", eventCheck.value)
        .maybeSingle<
          Pick<
            EventRecord,
            "id" | "code" | "name" | "codename_mode" | "entry_mode" | "status"
          >
        >(),
      supabase
        .from("rounds")
        .select("id, round_number, name, status")
        .eq("event_id", eventCheck.value)
        .order("round_number", { ascending: true })
        .returns<
          Pick<RoundRecord, "id" | "round_number" | "name" | "status">[]
        >(),
      supabase
        .from("event_entries")
        .select("*")
        .eq("event_id", eventCheck.value)
        .order("created_at", { ascending: true })
        .returns<EventEntryRecord[]>(),
      supabase
        .from("contingents")
        .select("id, contingent_code, name, institution_name, is_active")
        .returns<
          Pick<
            ContingentRecord,
            "id" | "contingent_code" | "name" | "institution_name" | "is_active"
          >[]
        >(),
      supabase
        .from("participants")
        .select("id, participant_code, full_name, institution_name, is_active")
        .returns<
          Pick<
            ParticipantRecord,
            "id" | "participant_code" | "full_name" | "institution_name" | "is_active"
          >[]
        >(),
    ]);

  if (eventRes.error || !eventRes.data) {
    notFound();
  }

  const event = eventRes.data;
  const rounds = roundsRes.data ?? [];
  const rawEntries = entriesRes.data ?? [];
  const allContingents = contingentsRes.data ?? [];
  const allParticipants = participantsRes.data ?? [];

  let selectedRoundId: string | null = null;
  if (event.codename_mode === "per_round") {
    const requested = resolvedSearchParams.roundId?.trim() || "";
    const matchedRound = rounds.find((r) => r.id === requested);
    selectedRoundId = matchedRound?.id ?? rounds[0]?.id ?? null;
  }

  let codenames: EntryCodenameRecord[] = [];
  let migrationMissing = false;
  let loadError: string | null = null;

  if (roundsRes.error || entriesRes.error) {
    loadError =
      "Unable to load event rounds or entries. Check your connection and organiser permissions, then refresh.";
  }

  if (event.codename_mode === "event_wide" || selectedRoundId) {
    let codenameQuery = supabase
      .from("entry_codenames")
      .select("*")
      .eq("event_id", event.id);

    if (event.codename_mode === "event_wide") {
      codenameQuery = codenameQuery.is("round_id", null);
    } else if (selectedRoundId) {
      codenameQuery = codenameQuery.eq("round_id", selectedRoundId);
    }

    const codenamesRes = await codenameQuery.returns<EntryCodenameRecord[]>();
    if (codenamesRes.error) {
      const errorKind = classifyCodenameLoadError(codenamesRes.error);
      if (errorKind === "migration_missing") {
        migrationMissing = true;
      } else {
        loadError =
          "Unable to load codename assignments from Supabase. Verify your connection and permissions, then refresh.";
      }
    } else {
      codenames = codenamesRes.data ?? [];
    }
  }

  const contingentById = new Map(allContingents.map((c) => [c.id, c]));
  const participantById = new Map(allParticipants.map((p) => [p.id, p]));
  const assignmentByEntryId = new Map(
    codenames.map((c) => [c.event_entry_id, c]),
  );

  const entries: CodenameEntryView[] = rawEntries.map((entry) => ({
    ...entry,
    contingent: entry.contingent_id
      ? contingentById.get(entry.contingent_id) ?? null
      : null,
    participant: entry.participant_id
      ? participantById.get(entry.participant_id) ?? null
      : null,
    assignment: assignmentByEntryId.get(entry.id) ?? null,
  }));

  return (
    <CmsShell
      user={sessionUser}
      breadcrumbs={[
        { label: siteConfig.appName, href: "/" },
        { label: "Events & Rounds", href: "/events" },
        { label: `${event.code} · ${event.name}`, href: `/events/${event.id}` },
        { label: "Codenames" },
      ]}
    >
      <section className="space-y-2 border-b border-slate-200 pb-6">
        <p className="font-mono text-xs font-medium text-[#4B0507]">
          {event.code} · Codenames
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Codename Assignment &amp; Management
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
          Assign and audit anonymous entry codenames for blind judging while
          preserving existing assignments and event-mode isolation.
        </p>
      </section>

      <CodenamesManager
        event={event}
        rounds={rounds}
        selectedRoundId={selectedRoundId}
        entries={entries}
        migrationMissing={migrationMissing}
        loadError={loadError}
      />
    </CmsShell>
  );
}
