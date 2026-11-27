import "server-only";

import { requireActiveUser } from "@/lib/auth/guards";
import { ALL_ORGANISER_ROLES } from "@/lib/auth/policy";
import { validateUuid } from "@/lib/competition/validation";
import {
  calculateCompetitionRankings,
  classifyLeaderboardLoadError,
  haveDraftAndPublishedDiverged,
  normalizeNumericScore,
  sortPublishedLeaderboardRows,
  toLeaderboardPublicationState,
  type LeaderboardLoadErrorKind,
} from "@/lib/leaderboard/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  ContingentRecord,
  EventEntryRecord,
  EventRecord,
  LeaderboardEntryRecord,
  LeaderboardEntryView,
  LeaderboardPublicationRecord,
  LeaderboardPublicationState,
  LeaderboardPublishedEntryRecord,
  ReadOnlyLeaderboardRow,
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
      publishedEntries: ReadOnlyLeaderboardRow[];
      eligibleContingents: Pick<
        ContingentRecord,
        "id" | "contingent_code" | "name" | "institution_name" | "is_active"
      >[];
      publication: LeaderboardPublicationState;
      hasUnpublishedChanges: boolean;
      canManagePublication: boolean;
      migrationMissing: boolean;
      publicationMigrationMissing: boolean;
      snapshotMigrationMissing: boolean;
      loadError: string | null;
      publicationLoadError: string | null;
      snapshotLoadError: string | null;
    }
  | {
      ok: false;
      reason: "not_found" | "invalid_id";
    };

/**
 * Loads draft numeric leaderboard standings, the latest published snapshot,
 * publication status, and eligible contingents for active organisers.
 * Uses the caller's authenticated Supabase server client under organiser RLS.
 */
export async function getOrganiserEventLeaderboard(
  eventId: string,
): Promise<OrganiserLeaderboardLoadResult> {
  const { sessionUser } = await requireActiveUser(ALL_ORGANISER_ROLES, {
    routeLabel: "/events/[eventId]/leaderboard",
  });

  const eventCheck = validateUuid(eventId, "Event");
  if (!eventCheck.ok) {
    return { ok: false, reason: "invalid_id" };
  }

  const supabase = await createSupabaseServerClient();

  const [
    eventRes,
    eventEntriesRes,
    contingentsRes,
    leaderboardRes,
    publicationRes,
    publishedSnapshotRes,
  ] = await Promise.all([
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
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .returns<LeaderboardEntryRecord[]>(),
    supabase
      .from("leaderboard_publications")
      .select("*")
      .eq("event_id", eventCheck.value)
      .maybeSingle<LeaderboardPublicationRecord>(),
    supabase
      .from("leaderboard_published_entries")
      .select("*")
      .eq("event_id", eventCheck.value)
      .order("rank", { ascending: true, nullsFirst: false })
      .order("score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: true })
      .returns<LeaderboardPublishedEntryRecord[]>(),
  ]);

  if (eventRes.error || !eventRes.data) {
    return { ok: false, reason: "not_found" };
  }

  const leaderboardErrorKind: LeaderboardLoadErrorKind =
    classifyLeaderboardLoadError(leaderboardRes.error);
  const migrationMissing = leaderboardErrorKind === "migration_missing";

  const publicationErrorKind: LeaderboardLoadErrorKind =
    classifyLeaderboardLoadError(publicationRes.error);
  const publicationMigrationMissing =
    publicationErrorKind === "migration_missing";

  const snapshotErrorKind: LeaderboardLoadErrorKind =
    classifyLeaderboardLoadError(publishedSnapshotRes.error);
  const snapshotMigrationMissing = snapshotErrorKind === "migration_missing";

  let loadError: string | null = null;
  if (eventEntriesRes.error || contingentsRes.error) {
    loadError =
      "Unable to load registered contingents for this event. Verify organiser permissions and refresh.";
  } else if (!migrationMissing && leaderboardErrorKind === "load_error") {
    loadError =
      "Unable to load leaderboard entries from Supabase. Verify permissions and refresh.";
  }

  const publicationLoadError =
    !publicationMigrationMissing && publicationErrorKind === "load_error"
      ? "Unable to load leaderboard publication status from Supabase. Verify permissions and refresh."
      : null;

  const snapshotLoadError =
    !snapshotMigrationMissing && snapshotErrorKind === "load_error"
      ? "Unable to load published leaderboard snapshot from Supabase. Verify permissions and refresh."
      : null;

  const publication =
    publicationMigrationMissing || publicationErrorKind === "load_error"
      ? toLeaderboardPublicationState(null)
      : toLeaderboardPublicationState(publicationRes.data);

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

  const rawDraftRows =
    migrationMissing || leaderboardErrorKind === "load_error"
      ? []
      : (leaderboardRes.data ?? []).map((row) => ({
          ...row,
          score: normalizeNumericScore(row.score),
          contingent: contingentById.get(row.contingent_id) ?? null,
          eventEntryStatus:
            entryStatusByContingentId.get(row.contingent_id) ?? null,
        }));

  const entries: LeaderboardEntryView[] =
    calculateCompetitionRankings(rawDraftRows);

  const rawPublishedRows =
    snapshotMigrationMissing || snapshotErrorKind === "load_error"
      ? []
      : (publishedSnapshotRes.data ?? []).map((row) => ({
          ...row,
          score: normalizeNumericScore(row.score),
          contingent: contingentById.get(row.contingent_id) ?? null,
        }));

  const publishedEntries: ReadOnlyLeaderboardRow[] =
    sortPublishedLeaderboardRows(
      rawPublishedRows.map((row) => ({
        id: row.id,
        rank: row.rank ?? null,
        score: row.score,
        displayLabel: row.display_label ?? null,
        contingentId: row.contingent_id,
        contingentCode: row.contingent?.contingent_code ?? "—",
        contingentName: row.contingent?.name ?? "Contingent",
        institutionName: row.contingent?.institution_name ?? "—",
        updatedAt: row.updated_at,
        created_at: row.created_at,
      })),
    ).map((item) => ({
      id: item.id,
      rank: item.rank,
      score: item.score,
      displayLabel: item.displayLabel,
      contingentId: item.contingentId,
      contingentCode: item.contingentCode,
      contingentName: item.contingentName,
      institutionName: item.institutionName,
      updatedAt: item.updatedAt,
    }));

  const hasUnpublishedChanges =
    !migrationMissing &&
    !publicationMigrationMissing &&
    !snapshotMigrationMissing &&
    !loadError &&
    !publicationLoadError &&
    !snapshotLoadError &&
    haveDraftAndPublishedDiverged({
      isPublished: publication.isPublished,
      draftEntries: entries,
      publishedEntries: rawPublishedRows,
    });

  const onLeaderboardContingentIds = new Set(
    rawDraftRows.map((row) => row.contingent_id),
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
    publishedEntries,
    eligibleContingents,
    publication,
    hasUnpublishedChanges,
    canManagePublication: sessionUser.role === "super_admin",
    migrationMissing,
    publicationMigrationMissing,
    snapshotMigrationMissing,
    loadError,
    publicationLoadError,
    snapshotLoadError,
  };
}
