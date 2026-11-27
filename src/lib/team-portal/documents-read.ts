import "server-only";

import { createCompetitionDocumentSignedViewUrl } from "@/lib/documents/storage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminSupabaseConfigured } from "@/lib/supabase/server-env";
import {
  PARTICIPANT_DOCUMENTS_LOAD_ERROR_MESSAGE,
  PARTICIPANT_DOCUMENT_OPEN_ERROR_MESSAGE,
  issueParticipantDocumentViewUrlWithDeps,
  loadParticipantRoundDocumentsWithDeps,
  type LoadParticipantDocumentsOutcome,
  type ParticipantDocumentEventLookupRow,
  type ParticipantDocumentLookupRow,
  type ParticipantDocumentRoundLookupRow,
  type ParticipantVisibleRoundRef,
} from "@/lib/team-portal/documents";
import type {
  ParticipantDocumentViewResult,
  RoundReleaseSessionRecord,
} from "@/types/competition";
import type { ActiveTeamSession } from "@/types/team-auth";

if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/team-portal/documents-read.ts contains server-only database and Storage access and cannot run in the browser.",
  );
}

const PARTICIPANT_DOCUMENT_SELECT =
  "id, event_id, round_id, title, storage_bucket, storage_object_path, mime_type, file_size_bytes, status, created_at, updated_at";

/**
 * Loads active PDFs for rounds already verified as visible to authenticated teams.
 * Strips internal storage_object_path/storage_bucket fields before returning to RSC/client UI.
 */
export async function loadParticipantDocumentsForVisibleRounds(
  team: ActiveTeamSession,
  visibleRounds: readonly ParticipantVisibleRoundRef[],
): Promise<LoadParticipantDocumentsOutcome> {
  if (visibleRounds.length === 0) {
    return {
      ok: true,
      documentsByRoundId: {},
      error: null,
    };
  }

  if (!isAdminSupabaseConfigured()) {
    return {
      ok: false,
      documentsByRoundId: {},
      error: PARTICIPANT_DOCUMENTS_LOAD_ERROR_MESSAGE,
    };
  }

  const admin = createSupabaseAdminClient();

  return loadParticipantRoundDocumentsWithDeps(
    team.contingentId,
    visibleRounds,
    {
      async findActiveDocumentsForRounds(roundIds) {
        const { data, error } = await admin
          .from("competition_documents")
          .select(PARTICIPANT_DOCUMENT_SELECT)
          .in("round_id", roundIds)
          .eq("status", "active")
          .order("created_at", { ascending: true })
          .returns<ParticipantDocumentLookupRow[]>();

        return {
          rows: data ?? [],
          error: error ? { code: error.code, message: error.message } : null,
        };
      },

      onError(context) {
        console.error(`[team-portal-documents] ${context}`);
      },
    },
  );
}

/**
 * Re-verifies document status, private Storage path safety, DB server time, and
 * Stage 2C round visibility before generating a 60-second signed view URL.
 */
export async function issueParticipantDocumentViewUrl(
  team: ActiveTeamSession,
  documentId: string,
): Promise<ParticipantDocumentViewResult> {
  if (!isAdminSupabaseConfigured()) {
    return {
      ok: false,
      reason: "error",
      message: PARTICIPANT_DOCUMENT_OPEN_ERROR_MESSAGE,
    };
  }

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  return issueParticipantDocumentViewUrlWithDeps(
    {
      verifiedTeamContingentId: team.contingentId,
      documentId,
    },
    {
      async findDocumentById(id) {
        const { data, error } = await admin
          .from("competition_documents")
          .select(PARTICIPANT_DOCUMENT_SELECT)
          .eq("id", id)
          .maybeSingle<ParticipantDocumentLookupRow>();

        return {
          row: data ?? null,
          error: error ? error.message : null,
        };
      },

      async getDbServerTimestamp() {
        const { data, error } = await supabase.rpc("get_db_server_timestamp");
        if (error || typeof data !== "string") {
          return {
            timestampIso: null,
            error: error?.message ?? "Unable to verify database server time",
          };
        }
        return { timestampIso: data, error: null };
      },

      async findEventById(eventId) {
        const { data, error } = await admin
          .from("events")
          .select("id, status")
          .eq("id", eventId)
          .maybeSingle<ParticipantDocumentEventLookupRow>();

        return {
          row: data ?? null,
          error: error ? error.message : null,
        };
      },

      async findRoundById(roundId) {
        const { data, error } = await admin
          .from("rounds")
          .select("id, event_id, status, duration_minutes, is_locked")
          .eq("id", roundId)
          .maybeSingle<ParticipantDocumentRoundLookupRow>();

        return {
          row: data ?? null,
          error: error ? error.message : null,
        };
      },

      async findReleaseSessionsForRound(roundId) {
        const { data, error } = await admin
          .from("round_release_sessions")
          .select(
            "id, event_id, round_id, session_number, duration_minutes, started_at, expires_at, closed_at, close_reason, released_by, closed_by, notes, created_at, updated_at",
          )
          .eq("round_id", roundId)
          .is("closed_at", null)
          .returns<RoundReleaseSessionRecord[]>();

        return {
          rows: data ?? [],
          error: error ? error.message : null,
        };
      },

      async createSignedViewUrl({ objectPath, expiresInSeconds }) {
        return createCompetitionDocumentSignedViewUrl({
          objectPath,
          expiresInSeconds,
        });
      },

      onError(context) {
        console.error(`[team-portal-documents] ${context}`);
      },
    },
  );
}
