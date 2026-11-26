import { validateUuid } from "@/lib/competition/validation";
import type {
  EventEntryRecord,
  EventEntryStatus,
  EventRecord,
  EventStatus,
} from "@/types/competition";

export const PARTICIPANT_VISIBLE_ENTRY_STATUSES = [
  "registered",
  "checked_in",
] as const satisfies readonly EventEntryStatus[];

export type ParticipantVisibleEntryStatus =
  (typeof PARTICIPANT_VISIBLE_ENTRY_STATUSES)[number];

export interface TeamRegisteredEventItem {
  entryId: string;
  eventId: string;
  eventCode: string;
  eventName: string;
  eventDescription: string | null;
  eventStatus: EventStatus;
  entryStatus: ParticipantVisibleEntryStatus;
}

export type TeamDashboardEventsResult =
  | { ok: true; events: TeamRegisteredEventItem[] }
  | { ok: false; error: string };

export type TeamEventEntryLookupRow = Pick<
  EventEntryRecord,
  "id" | "event_id" | "entry_type" | "contingent_id" | "status"
>;

export type TeamEventDetailLookupRow = Pick<
  EventRecord,
  "id" | "code" | "name" | "description" | "status"
>;

export interface TeamRegisteredEventsDeps {
  findEligibleEventEntries: (params: {
    contingentId: string;
    statuses: readonly ParticipantVisibleEntryStatus[];
  }) => Promise<{
    rows: TeamEventEntryLookupRow[];
    error: string | null;
  }>;
  findEventsByIds: (eventIds: string[]) => Promise<{
    rows: TeamEventDetailLookupRow[];
    error: string | null;
  }>;
  onError?: (context: string, detail: string) => void;
}

const DASHBOARD_LOAD_ERROR_MESSAGE =
  "Unable to load your registered events right now. Please refresh the page or contact a Virtuoso organiser.";

function isParticipantVisibleEntryStatus(
  status: string,
): status is ParticipantVisibleEntryStatus {
  return status === "registered" || status === "checked_in";
}

export async function loadTeamRegisteredEventsWithDeps(
  contingentId: string,
  deps: TeamRegisteredEventsDeps,
): Promise<TeamDashboardEventsResult> {
  const contingentCheck = validateUuid(contingentId, "Contingent");
  if (!contingentCheck.ok) {
    return {
      ok: false,
      error: "Unable to verify your contingent identity. Please sign in again.",
    };
  }

  const normalizedContingentId = contingentCheck.value.toLowerCase();

  let entriesRes: { rows: TeamEventEntryLookupRow[]; error: string | null };
  try {
    entriesRes = await deps.findEligibleEventEntries({
      contingentId: normalizedContingentId,
      statuses: PARTICIPANT_VISIBLE_ENTRY_STATUSES,
    });
  } catch (err) {
    deps.onError?.(
      "event_entries_throw",
      err instanceof Error ? err.message : "Unknown error",
    );
    return { ok: false, error: DASHBOARD_LOAD_ERROR_MESSAGE };
  }

  if (entriesRes.error) {
    deps.onError?.("event_entries_error", entriesRes.error);
    return { ok: false, error: DASHBOARD_LOAD_ERROR_MESSAGE };
  }

  // Enforce strict contingent isolation and registration status filtering even if
  // an underlying query layer returns extra rows.
  const eligibleEntries = entriesRes.rows.filter(
    (entry) =>
      entry.entry_type === "contingent" &&
      typeof entry.contingent_id === "string" &&
      entry.contingent_id.trim().toLowerCase() === normalizedContingentId &&
      isParticipantVisibleEntryStatus(entry.status),
  );

  if (eligibleEntries.length === 0) {
    return { ok: true, events: [] };
  }

  const uniqueEventIds = Array.from(
    new Set(eligibleEntries.map((entry) => entry.event_id.trim().toLowerCase())),
  );

  let eventsRes: { rows: TeamEventDetailLookupRow[]; error: string | null };
  try {
    eventsRes = await deps.findEventsByIds(uniqueEventIds);
  } catch (err) {
    deps.onError?.(
      "events_throw",
      err instanceof Error ? err.message : "Unknown error",
    );
    return { ok: false, error: DASHBOARD_LOAD_ERROR_MESSAGE };
  }

  if (eventsRes.error) {
    deps.onError?.("events_error", eventsRes.error);
    return { ok: false, error: DASHBOARD_LOAD_ERROR_MESSAGE };
  }

  const eventById = new Map<string, TeamEventDetailLookupRow>();
  for (const event of eventsRes.rows) {
    eventById.set(event.id.trim().toLowerCase(), event);
  }

  const registeredEvents: TeamRegisteredEventItem[] = [];
  for (const entry of eligibleEntries) {
    const normalizedEventId = entry.event_id.trim().toLowerCase();
    const event = eventById.get(normalizedEventId);
    if (!event) {
      deps.onError?.(
        "missing_event_record",
        `Missing event row for entry ${entry.id}`,
      );
      return { ok: false, error: DASHBOARD_LOAD_ERROR_MESSAGE };
    }

    if (!isParticipantVisibleEntryStatus(entry.status)) {
      continue;
    }

    registeredEvents.push({
      entryId: entry.id,
      eventId: event.id,
      eventCode: event.code,
      eventName: event.name,
      eventDescription: event.description,
      eventStatus: event.status,
      entryStatus: entry.status,
    });
  }

  registeredEvents.sort(
    (a, b) =>
      a.eventCode.localeCompare(b.eventCode) ||
      a.eventName.localeCompare(b.eventName),
  );

  return { ok: true, events: registeredEvents };
}
