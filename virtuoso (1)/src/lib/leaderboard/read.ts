import "server-only";

import { requireActiveUser } from "@/lib/auth/guards";
import { ALL_ORGANISER_ROLES } from "@/lib/auth/policy";
import { validateUuid } from "@/lib/competition/validation";
import {
  classifyLeaderboardLoadError,
  sortLeaderboardEntries,
  type LeaderboardLoadErrorKind,
} from "@/lib/leaderboard/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  ContingentRecord,
  EventEntryRecord,
  EventRecord,
  LeaderboardEntryRecord,
  LeaderboardEntryView,
} from "@/types/competition";

if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/leaderboard/read.ts contains server-only database access and cannot run in the browser.",
  );
}

export type OrganiserLeaderboardLoadResult =
  | {
      ok: true;
      event: Pick<
        EventRecord,
        "id" | "code" | "name" | "entry_mode" | "status"
      >;
      entries: LeaderboardEntryView[];
      eligibleContingents: Pick<
        ContingentRecord,
        "id" | "contingent_code" | "name" | "institution_name" | "is_active"
      >[];
      migrationMissing: boolean;
      loadError: string | null;
    }
  | {
      ok: false;
      reason: "not_found" | "invalid_id";
    };

/**
 * Loads overall leaderboard standings and eligible contingents for active organisers.
 * Uses the caller's authenticated Supabase server client under organiser RLS.
 *
 * Note on participant/team leaderboard reads:
 * The team-facing leaderboard read path is intentionally deferred until Team Portal
 * authentication (organiser-created shared team accounts with one POC and up to four
 * device sessions, mapped to verified contingents/event entries) is implemented.
 */
export async function getOrganiserEventLeaderboard(
  eventId: string,
): Promise<OrganiserLeaderboardLoadResult> {
  await requireActiveUser(ALL_ORGANISER_ROLES, {
    routeLabel: "/events/[eventId]/leaderboard",
  });

  const eventCheck = validateUuid(eventId, "Event");
  if (!eventCheck.ok) {
    return { ok: false, reason: "invalid_id" };
  }

  const supabase = await createSupabaseServerClient();

  const [eventRes, eventEntriesRes, contingentsRes, leaderboardRes] =
    await Promise.all([
      supabase
        .from("events")
        .select("id, code, name, entry_mode, status")
        .eq("id", eventCheck.value)
        .maybeSingle<
          Pick<EventRecord, "id" | "code" | "name" | "entry_mode" | "status">
        >(),
      supabase
        .from("event_entries")
        .select("id, event_id, entry_type, contingent_id, status")
        .eq("event_id", eventCheck.value)
        .eq("entry_type", "contingent")
        .returns<
          Pick<
            EventEntryRecord,
            "id" | "event_id" | "entry_type" | "contingent_id" | "status"
          >[]
        >(),
      supabase
        .from("contingents")
        .select("id, contingent_code, name, institution_name, is_active")
        .order("contingent_code", { ascending: true })
        .returns<
          Pick<
            ContingentRecord,
            | "id"
            | "contingent_code"
            | "name"
            | "institution_name"
            | "is_active"
          >[]
        >(),
      supabase
        .from("leaderboard_entries")
        .select("*")
        .eq("event_id", eventCheck.value)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .returns<LeaderboardEntryRecord[]>(),
    ]);

  if (eventRes.error || !eventRes.data) {
    return { ok: false, reason: "not_found" };
  }

  const leaderboardErrorKind: LeaderboardLoadErrorKind =
    classifyLeaderboardLoadError(leaderboardRes.error);
  const migrationMissing = leaderboardErrorKind === "migration_missing";

  let loadError: string | null = null;
  if (eventEntriesRes.error || contingentsRes.error) {
    loadError =
      "Unable to load registered contingents for this event. Verify organiser permissions and refresh.";
  } else if (!migrationMissing && leaderboardErrorKind === "load_error") {
    loadError =
      "Unable to load leaderboard entries from Supabase. Verify permissions and refresh.";
  }

  const contingentById = new Map(
    (contingentsRes.data ?? []).map((c) => [c.id, c]),
  );

  const eventEntries = eventEntriesRes.data ?? [];
  const entryStatusByContingentId = new Map<
    string,
    EventEntryRecord["status"]
  >();
  for (const row of eventEntries) {
    if (row.contingent_id) {
      entryStatusByContingentId.set(row.contingent_id, row.status);
    }
  }

  const rawLeaderboardRows =
    migrationMissing || leaderboardErrorKind === "load_error"
      ? []
      : sortLeaderboardEntries(leaderboardRes.data ?? []);

  const entries: LeaderboardEntryView[] = rawLeaderboardRows.map((row) => ({
    ...row,
    contingent: contingentById.get(row.contingent_id) ?? null,
    eventEntryStatus:
      entryStatusByContingentId.get(row.contingent_id) ?? null,
  }));

  const onLeaderboardContingentIds = new Set(
    rawLeaderboardRows.map((row) => row.contingent_id),
  );

  const eligibleContingents: Pick<
    ContingentRecord,
    "id" | "contingent_code" | "name" | "institution_name" | "is_active"
  >[] = [];

  for (const eventEntry of eventEntries) {
    if (!eventEntry.contingent_id) continue;
    if (onLeaderboardContingentIds.has(eventEntry.contingent_id)) continue;
    if (
      eventEntry.status !== "registered" &&
      eventEntry.status !== "checked_in"
    ) {
      continue;
    }
    const contingent = contingentById.get(eventEntry.contingent_id);
    if (!contingent || !contingent.is_active) continue;
    eligibleContingents.push(contingent);
  }

  eligibleContingents.sort((a, b) =>
    a.contingent_code.localeCompare(b.contingent_code),
  );

  return {
    ok: true,
    event: eventRes.data,
    entries,
    eligibleContingents,
    migrationMissing,
    loadError,
  };
}
