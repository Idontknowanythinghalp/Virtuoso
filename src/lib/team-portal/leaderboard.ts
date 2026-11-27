import { validateUuid } from "@/lib/competition/validation";
import {
  classifyLeaderboardLoadError,
  countRankOccurrences,
  normalizeNumericScore,
  sortPublishedLeaderboardRows,
} from "@/lib/leaderboard/validation";
import type { ReadOnlyLeaderboardRow } from "@/types/competition";

export interface ParticipantLeaderboardRpcEntryRow {
  id: string;
  event_id?: string;
  contingent_id: string;
  contingent_code?: string | null;
  contingent_name?: string | null;
  institution_name?: string | null;
  rank: number | null;
  score: number | string | null;
  display_label?: string | null;
  updated_at: string;
}

export interface ParticipantLeaderboardRpcEventRow {
  event_id: string;
  event_code: string;
  event_name: string;
  entry_mode?: string;
  event_status: string;
  is_published: boolean;
  published_at: string | null;
  entries?: ParticipantLeaderboardRpcEntryRow[] | null;
}

export interface ParticipantEventLeaderboard {
  eventId: string;
  eventCode: string;
  eventName: string;
  eventStatus: string;
  isPublished: boolean;
  publishedAt: string | null;
  entries: ReadOnlyLeaderboardRow[];
}

export type ParticipantLeaderboardsResult =
  | {
      ok: true;
      leaderboards: ParticipantEventLeaderboard[];
    }
  | {
      ok: false;
      error: string;
    };

export const LEADERBOARD_LOAD_ERROR_MESSAGE =
  "Leaderboard standings are temporarily unavailable. Please contact a Virtuoso organiser.";

export interface LoadTeamLeaderboardsDeps {
  fetchParticipantLeaderboardsSnapshot: (contingentId: string) => Promise<{
    rows: ParticipantLeaderboardRpcEventRow[];
    error: { code?: string | null; message?: string | null } | null;
  }>;
  onError?: (context: string, detail?: string) => void;
}

function reportError(
  deps: LoadTeamLeaderboardsDeps,
  context: string,
  detail?: string,
): void {
  try {
    deps.onError?.(context, detail);
  } catch (err) {
    console.error(
      `[team-portal-leaderboard] error logger failed (${context}):`,
      err instanceof Error ? err.message : "unknown",
    );
  }
}

function isEventEligibleForPublishedLeaderboard(
  row: ParticipantLeaderboardRpcEventRow,
): boolean {
  if (row.event_status !== "active" && row.event_status !== "archived") {
    return false;
  }
  if (row.entry_mode === "individual") {
    return false;
  }
  return (
    row.is_published === true &&
    typeof row.published_at === "string" &&
    row.published_at.trim().length > 0
  );
}

/**
 * Loads explicitly published numeric leaderboard snapshots for events in which
 * the authenticated contingent holds an active registration.
 *
 * Security & Lifecycle Rules:
 * 1. Derives contingent scope strictly from verified session contingentId.
 * 2. Consumes a single-statement PostgreSQL snapshot (get_participant_leaderboards_for_contingent)
 *    reading strictly from leaderboard_published_entries (never draft leaderboard_entries).
 * 3. Draft, inactive, and unpublished events never expose standings even if stale
 *    rows are returned by a caller/mock.
 * 4. Individual-only events are excluded.
 * 5. Archived events remain readable ONLY if already published prior to archiving.
 * 6. Projects rows strictly to ReadOnlyLeaderboardRow, stripping notes, created_by,
 *    updated_by, event_entry_id, and any other organiser-only fields.
 * 7. Preserves calculated standard competition rankings (1, 1, 3) and optional unranked (null) rows.
 */
export async function loadTeamLeaderboardsWithDeps(
  contingentId: string,
  deps: LoadTeamLeaderboardsDeps,
): Promise<ParticipantLeaderboardsResult> {
  const contingentCheck = validateUuid(contingentId, "Contingent");
  if (!contingentCheck.ok) {
    reportError(deps, "invalid_contingent_uuid", contingentCheck.error);
    return {
      ok: false,
      error: "Unable to verify your team session. Please sign in again.",
    };
  }

  const normalizedContingentId = contingentCheck.value.toLowerCase();

  let snapshotRes: {
    rows: ParticipantLeaderboardRpcEventRow[];
    error: { code?: string | null; message?: string | null } | null;
  };
  try {
    snapshotRes = await deps.fetchParticipantLeaderboardsSnapshot(
      normalizedContingentId,
    );
  } catch (err) {
    reportError(
      deps,
      "fetch_snapshot_throw",
      err instanceof Error ? err.message : "Unknown error",
    );
    return { ok: false, error: LEADERBOARD_LOAD_ERROR_MESSAGE };
  }

  const errorKind = classifyLeaderboardLoadError(snapshotRes.error);
  if (errorKind !== "none") {
    reportError(
      deps,
      errorKind === "migration_missing"
        ? "migration_0013_missing"
        : "fetch_snapshot_error",
      snapshotRes.error?.message ?? "Unknown leaderboard snapshot error",
    );
    return { ok: false, error: LEADERBOARD_LOAD_ERROR_MESSAGE };
  }

  if (!Array.isArray(snapshotRes.rows)) {
    reportError(deps, "invalid_snapshot_payload", "Expected array payload");
    return { ok: false, error: LEADERBOARD_LOAD_ERROR_MESSAGE };
  }

  const leaderboards: ParticipantEventLeaderboard[] = [];
  const seenEventIds = new Set<string>();

  for (const row of snapshotRes.rows) {
    if (!row || typeof row.event_id !== "string") {
      continue;
    }

    const eventUuidCheck = validateUuid(row.event_id, "Event");
    if (!eventUuidCheck.ok) {
      continue;
    }

    const normEventId = eventUuidCheck.value.toLowerCase();
    if (seenEventIds.has(normEventId)) {
      continue;
    }

    if (row.entry_mode === "individual") {
      continue;
    }

    seenEventIds.add(normEventId);

    const isPublished = isEventEligibleForPublishedLeaderboard(row);

    if (!isPublished || !row.published_at) {
      leaderboards.push({
        eventId: row.event_id,
        eventCode: row.event_code,
        eventName: row.event_name,
        eventStatus: row.event_status,
        isPublished: false,
        publishedAt: null,
        entries: [],
      });
      continue;
    }

    const rawEntries = Array.isArray(row.entries) ? row.entries : [];
    const safeEventEntries: ReadOnlyLeaderboardRow[] = [];

    for (const entry of rawEntries) {
      if (
        !entry ||
        typeof entry.id !== "string" ||
        typeof entry.contingent_id !== "string"
      ) {
        continue;
      }

      if (
        entry.event_id &&
        entry.event_id.trim().toLowerCase() !== normEventId
      ) {
        continue;
      }

      const normalizedRank =
        typeof entry.rank === "number" && Number.isInteger(entry.rank)
          ? entry.rank
          : null;
      const normalizedScore = normalizeNumericScore(entry.score);
      const displayLabel =
        typeof entry.display_label === "string" &&
        entry.display_label.trim().length > 0
          ? entry.display_label.trim()
          : null;

      safeEventEntries.push({
        id: entry.id,
        rank: normalizedRank,
        score: normalizedScore,
        displayLabel,
        contingentId: entry.contingent_id,
        contingentCode: entry.contingent_code?.trim() || "—",
        contingentName: entry.contingent_name?.trim() || "Contingent",
        institutionName: entry.institution_name?.trim() || "—",
        updatedAt: entry.updated_at,
      });
    }

    const sortedEntries = sortPublishedLeaderboardRows(safeEventEntries);

    leaderboards.push({
      eventId: row.event_id,
      eventCode: row.event_code,
      eventName: row.event_name,
      eventStatus: row.event_status,
      isPublished: true,
      publishedAt: row.published_at,
      entries: sortedEntries,
    });
  }

  leaderboards.sort(
    (a, b) =>
      a.eventCode.localeCompare(b.eventCode) ||
      a.eventName.localeCompare(b.eventName),
  );

  return { ok: true, leaderboards };
}

export { countRankOccurrences, sortPublishedLeaderboardRows };
