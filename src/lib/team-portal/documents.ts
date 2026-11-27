import { deriveRoundReleaseState } from "@/lib/competition/round-release";
import { validateUuid } from "@/lib/competition/validation";
import {
  ALLOWED_COMPETITION_DOCUMENT_MIME,
  COMPETITION_DOCUMENTS_BUCKET,
  PARTICIPANT_DOCUMENT_VIEW_TTL_SECONDS,
  classifyCompetitionDocumentsLoadError,
  isSafeCompetitionDocumentStoragePath,
} from "@/lib/documents/validation";
import type {
  CompetitionDocumentRecord,
  EventStatus,
  ParticipantDocumentViewResult,
  ParticipantRoundDocumentItem,
  RoundRecord,
  RoundReleaseSessionRecord,
} from "@/types/competition";

export const PARTICIPANT_DOCUMENTS_LOAD_ERROR_MESSAGE =
  "Unable to load round documents right now. Please refresh the page or contact a Virtuoso organiser.";

export const PARTICIPANT_DOCUMENT_UNAVAILABLE_MESSAGE =
  "This document is not available. The round may be closed, expired, or no longer accessible.";

export const PARTICIPANT_DOCUMENT_OPEN_ERROR_MESSAGE =
  "Unable to open this document right now. Please try again.";

export type ParticipantDocumentLookupRow = Pick<
  CompetitionDocumentRecord,
  | "id"
  | "event_id"
  | "round_id"
  | "title"
  | "storage_bucket"
  | "storage_object_path"
  | "mime_type"
  | "file_size_bytes"
  | "status"
  | "created_at"
  | "updated_at"
>;

export type ParticipantVisibleRoundRef = {
  roundId: string;
  eventId: string;
};

export interface LoadParticipantDocumentsDeps {
  findActiveDocumentsForRounds: (roundIds: string[]) => Promise<{
    rows: ParticipantDocumentLookupRow[];
    error: { code?: string; message?: string } | null;
  }>;
  onError?: (context: string, detail: string) => void;
}

export interface LoadParticipantDocumentsOutcome {
  ok: boolean;
  documentsByRoundId: Record<string, ParticipantRoundDocumentItem[]>;
  error: string | null;
}

export type ParticipantDocumentEventLookupRow = {
  id: string;
  status: EventStatus;
};

export type ParticipantDocumentRoundLookupRow = Pick<
  RoundRecord,
  "id" | "event_id" | "status" | "duration_minutes" | "is_locked"
>;

export interface IssueParticipantDocumentViewUrlDeps {
  findDocumentById: (documentId: string) => Promise<{
    row: ParticipantDocumentLookupRow | null;
    error: string | null;
  }>;
  getDbServerTimestamp: () => Promise<{
    timestampIso: string | null;
    error: string | null;
  }>;
  findEventById: (eventId: string) => Promise<{
    row: ParticipantDocumentEventLookupRow | null;
    error: string | null;
  }>;
  findRoundById: (roundId: string) => Promise<{
    row: ParticipantDocumentRoundLookupRow | null;
    error: string | null;
  }>;
  findReleaseSessionsForRound: (roundId: string) => Promise<{
    rows: RoundReleaseSessionRecord[];
    error: string | null;
  }>;
  createSignedViewUrl: (params: {
    objectPath: string;
    expiresInSeconds: number;
  }) => Promise<{
    ok: boolean;
    viewUrl?: string;
    expiresInSeconds?: number;
    error?: string;
  }>;
  onError?: (context: string, detail: string) => void;
}

function reportParticipantDocError(
  onError: ((context: string, detail: string) => void) | undefined,
  context: string,
  detail: string,
): void {
  if (!onError) return;
  try {
    onError(context, detail);
  } catch (err) {
    console.error(
      `[team-documents] secondary error logger failed during ${context}:`,
      err instanceof Error ? err.message : "Unknown error",
    );
  }
}

function toParticipantRoundDocumentItem(
  row: ParticipantDocumentLookupRow,
): ParticipantRoundDocumentItem {
  return {
    id: row.id,
    eventId: row.event_id,
    roundId: row.round_id,
    title: row.title,
    fileSizeBytes: Number(row.file_size_bytes),
    updatedAt: row.updated_at,
  };
}

/**
 * Loads active PDF metadata for a team's already-verified visible rounds.
 * Strips internal Storage paths, buckets, and actor identifiers from the DTO.
 */
export async function loadParticipantRoundDocumentsWithDeps(
  verifiedTeamContingentId: string,
  visibleRounds: readonly ParticipantVisibleRoundRef[],
  deps: LoadParticipantDocumentsDeps,
): Promise<LoadParticipantDocumentsOutcome> {
  const contingentCheck = validateUuid(verifiedTeamContingentId, "Contingent");
  if (!contingentCheck.ok) {
    return {
      ok: false,
      documentsByRoundId: {},
      error: "Unable to verify your team session. Please sign in again.",
    };
  }

  const visibleEventByRoundId = new Map<string, string>();
  const normalizedRoundIds: string[] = [];
  const originalRoundIdByNormalized = new Map<string, string>();

  for (const round of visibleRounds) {
    const roundCheck = validateUuid(round.roundId, "Round");
    const eventCheck = validateUuid(round.eventId, "Event");
    if (!roundCheck.ok || !eventCheck.ok) continue;

    const normRoundId = roundCheck.value.toLowerCase();
    const normEventId = eventCheck.value.toLowerCase();
    if (!visibleEventByRoundId.has(normRoundId)) {
      visibleEventByRoundId.set(normRoundId, normEventId);
      normalizedRoundIds.push(normRoundId);
      originalRoundIdByNormalized.set(normRoundId, round.roundId);
    }
  }

  if (normalizedRoundIds.length === 0) {
    return {
      ok: true,
      documentsByRoundId: {},
      error: null,
    };
  }

  let queryRes: {
    rows: ParticipantDocumentLookupRow[];
    error: { code?: string; message?: string } | null;
  };
  try {
    queryRes = await deps.findActiveDocumentsForRounds(normalizedRoundIds);
  } catch (err) {
    reportParticipantDocError(
      deps.onError,
      "participant_documents_throw",
      err instanceof Error ? err.message : "Unknown error",
    );
    return {
      ok: false,
      documentsByRoundId: {},
      error: PARTICIPANT_DOCUMENTS_LOAD_ERROR_MESSAGE,
    };
  }

  const errorKind = classifyCompetitionDocumentsLoadError(queryRes.error);
  if (errorKind !== "none") {
    reportParticipantDocError(
      deps.onError,
      errorKind === "migration_missing"
        ? "participant_documents_migration_missing"
        : "participant_documents_query_error",
      queryRes.error?.message ?? "Unknown query error",
    );
    return {
      ok: false,
      documentsByRoundId: {},
      error: PARTICIPANT_DOCUMENTS_LOAD_ERROR_MESSAGE,
    };
  }

  const groupedRaw = new Map<string, ParticipantDocumentLookupRow[]>();
  const seenDocIds = new Set<string>();

  for (const row of queryRes.rows) {
    const normDocId = row.id.trim().toLowerCase();
    if (seenDocIds.has(normDocId)) continue;

    const normRoundId = row.round_id.trim().toLowerCase();
    const normEventId = row.event_id.trim().toLowerCase();
    const expectedEventId = visibleEventByRoundId.get(normRoundId);

    if (!expectedEventId || expectedEventId !== normEventId) {
      continue;
    }

    if (
      row.status !== "active" ||
      row.storage_bucket !== COMPETITION_DOCUMENTS_BUCKET ||
      row.mime_type !== ALLOWED_COMPETITION_DOCUMENT_MIME ||
      !isSafeCompetitionDocumentStoragePath(
        row.storage_object_path,
        row.event_id,
        row.round_id,
      )
    ) {
      continue;
    }

    seenDocIds.add(normDocId);
    const list = groupedRaw.get(normRoundId) ?? [];
    list.push(row);
    groupedRaw.set(normRoundId, list);
  }

  const documentsByRoundId: Record<string, ParticipantRoundDocumentItem[]> = {};
  for (const [normRoundId, rows] of groupedRaw.entries()) {
    rows.sort((a, b) => {
      const aTime = Date.parse(a.created_at);
      const bTime = Date.parse(b.created_at);
      if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
        return aTime - bTime;
      }
      return (
        a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
      );
    });

    const roundKey = originalRoundIdByNormalized.get(normRoundId) ?? normRoundId;
    documentsByRoundId[roundKey] = rows.map(toParticipantRoundDocumentItem);
  }

  return {
    ok: true,
    documentsByRoundId,
    error: null,
  };
}

/**
 * Verifies a participant's right to view a specific competition document at request time,
 * reusing the Stage 2C round release lifecycle (active parent event, deployed round, and
 * open unexpired release session measured against database server time).
 *
 * Returns an identical non-enumerating denial message for invalid UUIDs, missing rows,
 * archived documents, and hidden/closed/unreleased rounds.
 */
export async function issueParticipantDocumentViewUrlWithDeps(
  params: {
    verifiedTeamContingentId: string;
    documentId: string;
  },
  deps: IssueParticipantDocumentViewUrlDeps,
): Promise<ParticipantDocumentViewResult> {
  const contingentCheck = validateUuid(
    params.verifiedTeamContingentId,
    "Contingent",
  );
  if (!contingentCheck.ok) {
    return {
      ok: false,
      reason: "invalid_team_session",
      message: "Your team session is no longer active. Please sign in again.",
    };
  }

  const docCheck = validateUuid(params.documentId, "Document");
  if (!docCheck.ok) {
    return {
      ok: false,
      reason: "not_found",
      message: PARTICIPANT_DOCUMENT_UNAVAILABLE_MESSAGE,
    };
  }
  const normalizedDocumentId = docCheck.value.toLowerCase();

  let docRes: {
    row: ParticipantDocumentLookupRow | null;
    error: string | null;
  };
  try {
    docRes = await deps.findDocumentById(normalizedDocumentId);
  } catch (err) {
    reportParticipantDocError(
      deps.onError,
      "participant_document_lookup_throw",
      err instanceof Error ? err.message : "Unknown error",
    );
    return {
      ok: false,
      reason: "error",
      message: PARTICIPANT_DOCUMENT_OPEN_ERROR_MESSAGE,
    };
  }

  if (docRes.error) {
    reportParticipantDocError(
      deps.onError,
      "participant_document_lookup_error",
      docRes.error,
    );
    return {
      ok: false,
      reason: "error",
      message: PARTICIPANT_DOCUMENT_OPEN_ERROR_MESSAGE,
    };
  }

  const doc = docRes.row;
  if (
    !doc ||
    doc.status !== "active" ||
    doc.storage_bucket !== COMPETITION_DOCUMENTS_BUCKET ||
    doc.mime_type !== ALLOWED_COMPETITION_DOCUMENT_MIME ||
    !isSafeCompetitionDocumentStoragePath(
      doc.storage_object_path,
      doc.event_id,
      doc.round_id,
    )
  ) {
    return {
      ok: false,
      reason: "not_found",
      message: PARTICIPANT_DOCUMENT_UNAVAILABLE_MESSAGE,
    };
  }

  let dbTimeRes: { timestampIso: string | null; error: string | null };
  try {
    dbTimeRes = await deps.getDbServerTimestamp();
  } catch (err) {
    reportParticipantDocError(
      deps.onError,
      "participant_document_db_time_throw",
      err instanceof Error ? err.message : "Unknown error",
    );
    return {
      ok: false,
      reason: "error",
      message: PARTICIPANT_DOCUMENT_OPEN_ERROR_MESSAGE,
    };
  }

  if (dbTimeRes.error || typeof dbTimeRes.timestampIso !== "string") {
    reportParticipantDocError(
      deps.onError,
      "participant_document_db_time_error",
      dbTimeRes.error ?? "Missing database server timestamp",
    );
    return {
      ok: false,
      reason: "error",
      message: PARTICIPANT_DOCUMENT_OPEN_ERROR_MESSAGE,
    };
  }

  const dbNowMs = Date.parse(dbTimeRes.timestampIso);
  if (!Number.isFinite(dbNowMs)) {
    reportParticipantDocError(
      deps.onError,
      "participant_document_db_time_invalid",
      dbTimeRes.timestampIso,
    );
    return {
      ok: false,
      reason: "error",
      message: PARTICIPANT_DOCUMENT_OPEN_ERROR_MESSAGE,
    };
  }

  let eventRes: {
    row: ParticipantDocumentEventLookupRow | null;
    error: string | null;
  };
  let roundRes: {
    row: ParticipantDocumentRoundLookupRow | null;
    error: string | null;
  };
  let sessionsRes: {
    rows: RoundReleaseSessionRecord[];
    error: string | null;
  };

  try {
    [eventRes, roundRes, sessionsRes] = await Promise.all([
      deps.findEventById(doc.event_id),
      deps.findRoundById(doc.round_id),
      deps.findReleaseSessionsForRound(doc.round_id),
    ]);
  } catch (err) {
    reportParticipantDocError(
      deps.onError,
      "participant_document_visibility_throw",
      err instanceof Error ? err.message : "Unknown error",
    );
    return {
      ok: false,
      reason: "error",
      message: PARTICIPANT_DOCUMENT_OPEN_ERROR_MESSAGE,
    };
  }

  if (eventRes.error || roundRes.error || sessionsRes.error) {
    reportParticipantDocError(
      deps.onError,
      "participant_document_visibility_error",
      eventRes.error ?? roundRes.error ?? sessionsRes.error ?? "Lookup error",
    );
    return {
      ok: false,
      reason: "error",
      message: PARTICIPANT_DOCUMENT_OPEN_ERROR_MESSAGE,
    };
  }

  const event = eventRes.row;
  const round = roundRes.row;
  if (
    !event ||
    !round ||
    round.event_id.trim().toLowerCase() !== event.id.trim().toLowerCase()
  ) {
    return {
      ok: false,
      reason: "not_visible",
      message: PARTICIPANT_DOCUMENT_UNAVAILABLE_MESSAGE,
    };
  }

  const matchingSessions = sessionsRes.rows.filter(
    (s) =>
      s.event_id.trim().toLowerCase() === event.id.trim().toLowerCase() &&
      s.round_id.trim().toLowerCase() === round.id.trim().toLowerCase(),
  );

  const derived = deriveRoundReleaseState({
    round,
    eventStatus: event.status,
    sessions: matchingSessions,
    dbNowMs,
  });

  if (!derived.isTeamVisible) {
    return {
      ok: false,
      reason: "not_visible",
      message: PARTICIPANT_DOCUMENT_UNAVAILABLE_MESSAGE,
    };
  }

  let signedRes: {
    ok: boolean;
    viewUrl?: string;
    expiresInSeconds?: number;
    error?: string;
  };
  try {
    signedRes = await deps.createSignedViewUrl({
      objectPath: doc.storage_object_path!,
      expiresInSeconds: PARTICIPANT_DOCUMENT_VIEW_TTL_SECONDS,
    });
  } catch (err) {
    reportParticipantDocError(
      deps.onError,
      "participant_document_signed_url_throw",
      err instanceof Error ? err.message : "Unknown error",
    );
    return {
      ok: false,
      reason: "error",
      message: PARTICIPANT_DOCUMENT_OPEN_ERROR_MESSAGE,
    };
  }

  if (!signedRes.ok || !signedRes.viewUrl) {
    reportParticipantDocError(
      deps.onError,
      "participant_document_signed_url_error",
      signedRes.error ?? "Missing signed view URL",
    );
    return {
      ok: false,
      reason: "error",
      message: PARTICIPANT_DOCUMENT_OPEN_ERROR_MESSAGE,
    };
  }

  return {
    ok: true,
    documentId: doc.id,
    title: doc.title,
    viewUrl: signedRes.viewUrl,
    expiresInSeconds:
      signedRes.expiresInSeconds ?? PARTICIPANT_DOCUMENT_VIEW_TTL_SECONDS,
  };
}
