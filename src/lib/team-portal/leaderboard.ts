import { validateUuid } from "@/lib/competition/validation";
import {
  countPositionOccurrences,
  sortLeaderboardEntries,
} from "@/lib/leaderboard/validation";
import type { ReadOnlyLeaderboardRow } from "@/types/competition";

export interface ParticipantLeaderboardEntryLookupRow {
  id: string;
  event_id: string;
  contingent_id: string;
  position: number;
  display_value: string;
  created_at?: string;
  updated_at: string;
}

export interface ParticipantContingentLookupRow {
  id: string;
  contingent_code: string;
  name: string;
  institution_name: string;
}

export interface ParticipantEventLookupRow {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  status: string;
}

export interface ParticipantEventEntryLookupRow {
  id: string;
  event_id: string;
  entry_type: string;
  contingent_id: string | null;
  status: string;
}

export interface ParticipantEventLeaderboard {
  eventId: string;
  eventCode: string;
  eventName: string;
  eventStatus: string;
  isPublished: boolean;
  lastUpdatedAt: string | null;
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
  findEligibleEventEntries: (params: {
    contingentId: string;
    statuses: readonly string[];
  }) => Promise<{
    rows: ParticipantEventEntryLookupRow[];
    error: string | null;
  }>;
  findEventsByIds: (eventIds: string[]) => Promise<{
    rows: ParticipantEventLookupRow[];
    error: string | null;
  }>;
  findPublishedLeaderboardEntries: (eventIds: string[]) => Promise<{
    rows: ParticipantLeaderboardEntryLookupRow[];
    error: string | null;
  }>;
  findContingentsByIds: (contingentIds: string[]) => Promise<{
    rows: ParticipantContingentLookupRow[];
    error: string | null;
  }>;
  onError?: (context: string, detail?: string) => void;
}

/**
 * Loads published leaderboard standings for all events that the authenticated
 * contingent is actively registered in.
 *
 * Strict Security Boundaries:
 * 1. Enforces event access matching the team dashboard decisions (contingent-registered events only).
 * 2. Only returns published standings for non-draft events with organiser entries.
 * 3. Projects rows to ReadOnlyLeaderboardRow, completely excluding notes, created_by,
 *    updated_by, and internal event_entry_id.
 * 4. Preserves manually entered positions (including ties) and display values verbatim.
 */
export async function loadTeamLeaderboardsWithDeps(
  contingentId: string,
  deps: LoadTeamLeaderboardsDeps,
): Promise<ParticipantLeaderboardsResult> {
  const contingentCheck = validateUuid(contingentId, "Contingent");
  if (!contingentCheck.ok) {
    deps.onError?.("invalid_contingent_uuid", contingentCheck.error);
    return { ok: false, error: LEADERBOARD_LOAD_ERROR_MESSAGE };
  }

  // 1. Find active registrations for the contingent
  const entriesRes = await deps.findEligibleEventEntries({
    contingentId: contingentCheck.value,
    statuses: ["registered", "checked_in"],
  });

  if (entriesRes.error) {
    deps.onError?.("find_eligible_entries_error", entriesRes.error);
    return { ok: false, error: LEADERBOARD_LOAD_ERROR_MESSAGE };
  }

  const eligibleEntries = entriesRes.rows.filter(
    (e) =>
      e.contingent_id === contingentCheck.value &&
      e.entry_type === "contingent" &&
      (e.status === "registered" || e.status === "checked_in"),
  );

  const distinctEventIds = Array.from(
    new Set(eligibleEntries.map((e) => e.event_id)),
  );

  if (distinctEventIds.length === 0) {
    return { ok: true, leaderboards: [] };
  }

  // 2. Fetch event records
  const eventsRes = await deps.findEventsByIds(distinctEventIds);
  if (eventsRes.error) {
    deps.onError?.("find_events_error", eventsRes.error);
    return { ok: false, error: LEADERBOARD_LOAD_ERROR_MESSAGE };
  }

  const eventById = new Map<string, ParticipantEventLookupRow>();
  for (const ev of eventsRes.rows) {
    eventById.set(ev.id, ev);
  }

  // Identify visible events that are not in draft status (draft events are unpublished)
  const nonDraftEventIds = eventsRes.rows
    .filter((ev) => ev.status !== "draft")
    .map((ev) => ev.id);

  // 3. Fetch published leaderboard entries for non-draft events
  let entriesByEventId = new Map<string, ParticipantLeaderboardEntryLookupRow[]>();
  let contingentById = new Map<string, ParticipantContingentLookupRow>();

  if (nonDraftEventIds.length > 0) {
    const lbEntriesRes = await deps.findPublishedLeaderboardEntries(nonDraftEventIds);
    if (lbEntriesRes.error) {
      deps.onError?.("find_leaderboard_entries_error", lbEntriesRes.error);
      return { ok: false, error: LEADERBOARD_LOAD_ERROR_MESSAGE };
    }

    const allContingentIds = Array.from(
      new Set(lbEntriesRes.rows.map((row) => row.contingent_id)),
    );

    if (allContingentIds.length > 0) {
      const contRes = await deps.findContingentsByIds(allContingentIds);
      if (contRes.error) {
        deps.onError?.("find_contingents_error", contRes.error);
        return { ok: false, error: LEADERBOARD_LOAD_ERROR_MESSAGE };
      }
      contingentById = new Map(contRes.rows.map((c) => [c.id, c]));
    }

    for (const row of lbEntriesRes.rows) {
      const list = entriesByEventId.get(row.event_id) ?? [];
      list.push(row);
      entriesByEventId.set(row.event_id, list);
    }
  }

  // 4. Build leaderboard result for each registered event
  const leaderboards: ParticipantEventLeaderboard[] = [];
  for (const event of eventsRes.rows) {
    if (event.status === "draft") {
      leaderboards.push({
        eventId: event.id,
        eventCode: event.code,
        eventName: event.name,
        eventStatus: event.status,
        isPublished: false,
        lastUpdatedAt: null,
        entries: [],
      });
      continue;
    }

    const rawRows = entriesByEventId.get(event.id) ?? [];
    if (rawRows.length === 0) {
      leaderboards.push({
        eventId: event.id,
        eventCode: event.code,
        eventName: event.name,
        eventStatus: event.status,
        isPublished: false,
        lastUpdatedAt: null,
        entries: [],
      });
      continue;
    }

    const sorted = sortLeaderboardEntries(rawRows);

    let maxUpdatedAt: string | null = null;
    for (const r of sorted) {
      if (r.updated_at) {
        if (!maxUpdatedAt || r.updated_at > maxUpdatedAt) {
          maxUpdatedAt = r.updated_at;
        }
      }
    }

    const mappedEntries: ReadOnlyLeaderboardRow[] = sorted.map((r) => {
      const c = contingentById.get(r.contingent_id);
      return {
        id: r.id,
        position: r.position,
        contingentId: r.contingent_id,
        contingentCode: c?.contingent_code ?? "—",
        contingentName: c?.name ?? "Contingent",
        institutionName: c?.institution_name ?? "—",
        displayValue: r.display_value,
        updatedAt: r.updated_at,
      };
    });

    leaderboards.push({
      eventId: event.id,
      eventCode: event.code,
      eventName: event.name,
      eventStatus: event.status,
      isPublished: true,
      lastUpdatedAt: maxUpdatedAt,
      entries: mappedEntries,
    });
  }

  leaderboards.sort(
    (a, b) =>
      a.eventCode.localeCompare(b.eventCode) ||
      a.eventName.localeCompare(b.eventName),
  );

  return { ok: true, leaderboards };
}
export { countPositionOccurrences, sortLeaderboardEntries };
