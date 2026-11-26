import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdminSupabaseConfigured } from "@/lib/supabase/server-env";
import { classifyCompetitionDocumentsLoadError } from "@/lib/documents/validation";
import type {
  AdminRoundDocumentItem,
  CompetitionDocumentRecord,
} from "@/types/competition";

if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/documents/read.ts contains server-only database access and cannot run in the browser.",
  );
}

export interface LoadRoundDocumentsResult {
  documents: AdminRoundDocumentItem[];
  migrationMissing: boolean;
  loadError: string | null;
}

function toAdminRoundDocumentItem(
  row: CompetitionDocumentRecord,
): AdminRoundDocumentItem {
  return {
    id: row.id,
    eventId: row.event_id,
    roundId: row.round_id,
    title: row.title,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    fileSizeBytes: Number(row.file_size_bytes),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Loads active PDFs attached to a round for an authenticated Super Admin view.
 * Strips internal storage_object_path and storage_bucket fields from the UI DTO.
 */
export async function loadRoundDocumentsForSuperAdmin(
  eventId: string,
  roundId: string,
): Promise<LoadRoundDocumentsResult> {
  if (!isAdminSupabaseConfigured()) {
    return {
      documents: [],
      migrationMissing: false,
      loadError:
        "SUPABASE_SERVICE_ROLE_KEY is missing on the server. Round PDF management requires server-side configuration.",
    };
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("competition_documents")
      .select(
        "id, event_id, round_id, title, original_filename, mime_type, file_size_bytes, status, created_at, updated_at",
      )
      .eq("event_id", eventId)
      .eq("round_id", roundId)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .returns<CompetitionDocumentRecord[]>();

    const errorKind = classifyCompetitionDocumentsLoadError(error);
    if (errorKind === "migration_missing") {
      return {
        documents: [],
        migrationMissing: true,
        loadError: null,
      };
    }

    if (errorKind === "load_error") {
      return {
        documents: [],
        migrationMissing: false,
        loadError: "Unable to load round PDF documents from the database.",
      };
    }

    return {
      documents: (data ?? []).map(toAdminRoundDocumentItem),
      migrationMissing: false,
      loadError: null,
    };
  } catch (err) {
    console.error(
      "[documents-read] unexpected failure:",
      err instanceof Error ? err.message : "Unknown error",
    );
    return {
      documents: [],
      migrationMissing: false,
      loadError: "Unable to load round PDF documents from the database.",
    };
  }
}
