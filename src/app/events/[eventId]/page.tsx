import React from "react";
import { notFound } from "next/navigation";
import { CmsShell } from "@/components/layout/CmsShell";
import {
  EventDetailManager,
  type EventEntryView,
} from "@/components/competition/EventDetailManager";
import { requireActiveUser } from "@/lib/auth/guards";
import { ALL_ORGANISER_ROLES } from "@/lib/auth/policy";
import { validateUuid } from "@/lib/competition/validation";
import { classifyRoundReleaseLoadError } from "@/lib/competition/round-release";
import { siteConfig } from "@/lib/site-config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  ContingentRecord,
  EntryCodenameRecord,
  EventEntryRecord,
  EventRecord,
  ParticipantRecord,
  RoundRecord,
  RoundReleaseSessionRecord,
} from "@/types/competition";

export const dynamic = "force-dynamic";

interface EventDetailPageProps {
  params: Promise<{ eventId: string }>;
}

export default async function EventDetailPage({
  params,
}: EventDetailPageProps) {
  const { sessionUser } = await requireActiveUser(ALL_ORGANISER_ROLES, {
    routeLabel: "/events/[eventId]",
  });

  const { eventId } = await params;
  const idCheck = validateUuid(eventId, "Event");
  if (!idCheck.ok) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();

  const [
    eventRes,
    roundsRes,
    entriesRes,
    contingentsRes,
    participantsRes,
    codenamesRes,
    sessionsRes,
    dbNowRes,
  ] = await Promise.all([
    supabase
      .from("events")
      .select("*")
      .eq("id", idCheck.value)
      .maybeSingle<EventRecord>(),
    supabase
      .from("rounds")
      .select("*")
      .eq("event_id", idCheck.value)
      .order("round_number", { ascending: true })
      .returns<RoundRecord[]>(),
    supabase
      .from("event_entries")
      .select("*")
      .eq("event_id", idCheck.value)
      .order("created_at", { ascending: false })
      .returns<EventEntryRecord[]>(),
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
      .from("participants")
      .select("id, participant_code, full_name, institution_name, is_active")
      .order("participant_code", { ascending: true })
      .returns<
        Pick<
          ParticipantRecord,
          "id" | "participant_code" | "full_name" | "institution_name" | "is_active"
        >[]
      >(),
    supabase
      .from("entry_codenames")
      .select("event_entry_id, round_id, codename")
      .eq("event_id", idCheck.value)
      .returns<
        Pick<EntryCodenameRecord, "event_entry_id" | "round_id" | "codename">[]
      >(),
    supabase
      .from("round_release_sessions")
      .select("*")
      .eq("event_id", idCheck.value)
      .order("session_number", { ascending: false })
      .returns<RoundReleaseSessionRecord[]>(),
    supabase.rpc("get_db_server_timestamp"),
  ]);

  if (eventRes.error || !eventRes.data) {
    notFound();
  }

  const event = eventRes.data;
  const rounds = roundsRes.data ?? [];
  const rawEntries = entriesRes.data ?? [];
  const allContingents = contingentsRes.data ?? [];
  const allParticipants = participantsRes.data ?? [];

  const contingentById = new Map(allContingents.map((c) => [c.id, c]));
  const participantById = new Map(allParticipants.map((p) => [p.id, p]));

  const entries: EventEntryView[] = rawEntries.map((entry) => ({
    ...entry,
    contingent: entry.contingent_id
      ? contingentById.get(entry.contingent_id) ?? null
      : null,
    participant: entry.participant_id
      ? participantById.get(entry.participant_id) ?? null
      : null,
  }));

  const codenames = codenamesRes.error ? [] : (codenamesRes.data ?? []);
  const eventWideCodenameByEntryId: Record<string, string> = {};
  const roundCodenameCountMap: Record<string, number> = {};

  for (const row of codenames) {
    if (row.round_id === null) {
      eventWideCodenameByEntryId[row.event_entry_id] = row.codename;
    } else {
      roundCodenameCountMap[row.round_id] =
        (roundCodenameCountMap[row.round_id] ?? 0) + 1;
    }
  }

  const sessionsErrorKind = classifyRoundReleaseLoadError(sessionsRes.error);
  const releaseMigrationMissing = sessionsErrorKind === "migration_missing";
  const dbServerNowIso =
    !dbNowRes.error &&
    typeof dbNowRes.data === "string" &&
    Number.isFinite(Date.parse(dbNowRes.data))
      ? dbNowRes.data
      : null;

  let releaseLoadError: string | null = null;
  if (!releaseMigrationMissing) {
    if (sessionsErrorKind === "load_error") {
      releaseLoadError =
        "Unable to load round release sessions from the database.";
    } else if (!dbServerNowIso) {
      releaseLoadError =
        "Unable to read authoritative database clock timestamp.";
    }
  }

  const releaseSessions =
    releaseMigrationMissing || sessionsErrorKind === "load_error"
      ? []
      : (sessionsRes.data ?? []);
  const releaseSessionsByRoundId: Record<string, RoundReleaseSessionRecord[]> =
    {};
  for (const session of releaseSessions) {
    if (!releaseSessionsByRoundId[session.round_id]) {
      releaseSessionsByRoundId[session.round_id] = [];
    }
    releaseSessionsByRoundId[session.round_id].push(session);
  }

  return (
    <CmsShell
      user={sessionUser}
      breadcrumbs={[
        { label: siteConfig.appName, href: "/" },
        { label: "Events & Rounds", href: "/events" },
        { label: `${event.code} · ${event.name}` },
      ]}
    >
      <section className="space-y-2 border-b border-slate-200 pb-6">
        <p className="font-mono text-xs font-medium text-[#4B0507]">
          {event.code}
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {event.name}
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
          {event.description ||
            "Configure event settings, round sequence, and participating entries."}
        </p>
      </section>

      <EventDetailManager
        event={event}
        rounds={rounds}
        entries={entries}
        availableContingents={allContingents}
        availableParticipants={allParticipants}
        codenameAssignmentCount={codenames.length}
        eventWideCodenameByEntryId={eventWideCodenameByEntryId}
        roundCodenameCountMap={roundCodenameCountMap}
        releaseSessionsByRoundId={releaseSessionsByRoundId}
        dbServerNowIso={dbServerNowIso}
        releaseMigrationMissing={releaseMigrationMissing}
        releaseLoadError={releaseLoadError}
      />
    </CmsShell>
  );
}
