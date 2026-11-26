import { deriveRoundReleaseState } from "@/lib/competition/round-release";
import { validateUuid } from "@/lib/competition/validation";
import type {
  EventRecord,
  RoundRecord,
  RoundReleaseSessionRecord,
} from "@/types/competition";

export interface ParticipantCurrentRoundItem {
  roundId: string;
  eventId: string;
  eventCode: string;
  eventName: string;
  roundNumber: number;
  roundName: string;
  roundDescription: string | null;
}

export type TeamCurrentRoundsResult =
  | { ok: true; rounds: ParticipantCurrentRoundItem[] }
  | { ok: false; error: string };

export type TeamVisibleEventLookupRow = Pick<
  EventRecord,
  "id" | "code" | "name" | "status"
>;

export type TeamVisibleRoundLookupRow = Pick<
  RoundRecord,
  | "id"
  | "event_id"
  | "round_number"
  | "name"
  | "description"
  | "status"
  | "duration_minutes"
  | "is_locked"
>;

export interface TeamCurrentRoundsDeps {
  getDbServerTimestamp: () => Promise<{
    timestampIso: string | null;
    error: string | null;
  }>;
  findOpenReleaseSessions: (params: { dbNowIso: string }) => Promise<{
    rows: RoundReleaseSessionRecord[];
    error: string | null;
  }>;
  findActiveEventsByIds: (eventIds: string[]) => Promise<{
    rows: TeamVisibleEventLookupRow[];
    error: string | null;
  }>;
  findDeployedRoundsByIds: (roundIds: string[]) => Promise<{
    rows: TeamVisibleRoundLookupRow[];
    error: string | null;
  }>;
  onError?: (context: string, detail: string) => void;
}

const ROUNDS_LOAD_ERROR_MESSAGE =
  "Unable to load active rounds right now. Please refresh the page or contact a Virtuoso organiser.";

/**
 * Loads currently released and open competition rounds for an authenticated team.
 *
 * Visibility is derived strictly from the authoritative Stage 2C lifecycle:
 *   - Parent event: status === 'active'
 *   - Round: status === 'deployed'
 *   - Release session: closed_at IS NULL AND started_at <= dbNow < expires_at
 *
 * Access does NOT depend on contingent event_entries or client-provided IDs.
 */
export async function loadTeamCurrentRoundsWithDeps(
  verifiedTeamContingentId: string,
  deps: TeamCurrentRoundsDeps,
): Promise<TeamCurrentRoundsResult> {
  // Confirm an authenticated server-verified team contingent context is present,
  // without scoping round visibility to that contingent or its registrations.
  const teamCheck = validateUuid(verifiedTeamContingentId, "Contingent");
  if (!teamCheck.ok) {
    return {
      ok: false,
      error: "Unable to verify your team session. Please sign in again.",
    };
  }

  let dbTimeRes: { timestampIso: string | null; error: string | null };
  try {
    dbTimeRes = await deps.getDbServerTimestamp();
  } catch (err) {
    deps.onError?.(
      "db_timestamp_throw",
      err instanceof Error ? err.message : "Unknown error",
    );
    return { ok: false, error: ROUNDS_LOAD_ERROR_MESSAGE };
  }

  if (dbTimeRes.error || typeof dbTimeRes.timestampIso !== "string") {
    deps.onError?.(
      "db_timestamp_error",
      dbTimeRes.error ?? "Missing database server timestamp",
    );
    return { ok: false, error: ROUNDS_LOAD_ERROR_MESSAGE };
  }

  const dbNowMs = Date.parse(dbTimeRes.timestampIso);
  if (!Number.isFinite(dbNowMs)) {
    deps.onError?.("db_timestamp_invalid", dbTimeRes.timestampIso);
    return { ok: false, error: ROUNDS_LOAD_ERROR_MESSAGE };
  }

  const dbNowIso = new Date(dbNowMs).toISOString();

  let sessionsRes: { rows: RoundReleaseSessionRecord[]; error: string | null };
  try {
    sessionsRes = await deps.findOpenReleaseSessions({ dbNowIso });
  } catch (err) {
    deps.onError?.(
      "release_sessions_throw",
      err instanceof Error ? err.message : "Unknown error",
    );
    return { ok: false, error: ROUNDS_LOAD_ERROR_MESSAGE };
  }

  if (sessionsRes.error) {
    deps.onError?.("release_sessions_error", sessionsRes.error);
    return { ok: false, error: ROUNDS_LOAD_ERROR_MESSAGE };
  }

  // Defensive read-time session window check before loading parent rounds/events
  const candidateSessions = sessionsRes.rows.filter((session) => {
    if (session.closed_at !== null) {
      return false;
    }
    const startedMs = Date.parse(session.started_at);
    const expiresMs = Date.parse(session.expires_at);
    return (
      Number.isFinite(startedMs) &&
      Number.isFinite(expiresMs) &&
      dbNowMs >= startedMs &&
      dbNowMs < expiresMs
    );
  });

  if (candidateSessions.length === 0) {
    return { ok: true, rounds: [] };
  }

  const eventIds = Array.from(
    new Set(candidateSessions.map((s) => s.event_id.trim().toLowerCase())),
  );
  const roundIds = Array.from(
    new Set(candidateSessions.map((s) => s.round_id.trim().toLowerCase())),
  );

  let eventsRes: { rows: TeamVisibleEventLookupRow[]; error: string | null };
  let roundsRes: { rows: TeamVisibleRoundLookupRow[]; error: string | null };
  try {
    [eventsRes, roundsRes] = await Promise.all([
      deps.findActiveEventsByIds(eventIds),
      deps.findDeployedRoundsByIds(roundIds),
    ]);
  } catch (err) {
    deps.onError?.(
      "rounds_or_events_throw",
      err instanceof Error ? err.message : "Unknown error",
    );
    return { ok: false, error: ROUNDS_LOAD_ERROR_MESSAGE };
  }

  if (eventsRes.error) {
    deps.onError?.("events_error", eventsRes.error);
    return { ok: false, error: ROUNDS_LOAD_ERROR_MESSAGE };
  }

  if (roundsRes.error) {
    deps.onError?.("rounds_error", roundsRes.error);
    return { ok: false, error: ROUNDS_LOAD_ERROR_MESSAGE };
  }

  const activeEventById = new Map<string, TeamVisibleEventLookupRow>();
  for (const event of eventsRes.rows) {
    if (event.status === "active") {
      activeEventById.set(event.id.trim().toLowerCase(), event);
    }
  }

  const sessionsByRoundId = new Map<string, RoundReleaseSessionRecord[]>();
  for (const session of candidateSessions) {
    const key = session.round_id.trim().toLowerCase();
    const list = sessionsByRoundId.get(key) ?? [];
    list.push(session);
    sessionsByRoundId.set(key, list);
  }

  const visibleRounds: ParticipantCurrentRoundItem[] = [];
  const seenRoundIds = new Set<string>();

  for (const round of roundsRes.rows) {
    const normalizedRoundId = round.id.trim().toLowerCase();
    if (seenRoundIds.has(normalizedRoundId)) {
      continue;
    }

    const normalizedEventId = round.event_id.trim().toLowerCase();
    const event = activeEventById.get(normalizedEventId);
    if (!event || event.status !== "active") {
      continue;
    }

    const matchingSessions = (
      sessionsByRoundId.get(normalizedRoundId) ?? []
    ).filter(
      (session) => session.event_id.trim().toLowerCase() === normalizedEventId,
    );

    if (matchingSessions.length === 0) {
      continue;
    }

    const derived = deriveRoundReleaseState({
      round,
      eventStatus: event.status,
      sessions: matchingSessions,
      dbNowMs,
    });

    if (!derived.isTeamVisible) {
      continue;
    }

    seenRoundIds.add(normalizedRoundId);
    visibleRounds.push({
      roundId: round.id,
      eventId: event.id,
      eventCode: event.code,
      eventName: event.name,
      roundNumber: round.round_number,
      roundName: round.name,
      roundDescription: round.description,
    });
  }

  visibleRounds.sort(
    (a, b) =>
      a.eventCode.localeCompare(b.eventCode) ||
      a.eventName.localeCompare(b.eventName) ||
      a.roundNumber - b.roundNumber ||
      a.roundName.localeCompare(b.roundName),
  );

  return { ok: true, rounds: visibleRounds };
}
