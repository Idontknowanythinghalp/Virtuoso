"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { recordAuditLog } from "@/lib/audit/logger";
import {
  OrganiserAuthError,
  requireActiveUserForAction,
} from "@/lib/auth/guards";
import { SUPER_ADMIN_ONLY } from "@/lib/auth/policy";
import {
  removeRoundDocumentWithDeps,
  replaceRoundDocumentWithDeps,
  updateRoundDocumentTitleWithDeps,
  uploadRoundDocumentWithDeps,
  type DocumentActorContext,
  type DocumentOperationResult,
  type RoundDocumentOpsDeps,
} from "@/lib/documents/operations";
import {
  removeCompetitionDocumentObject,
  uploadCompetitionDocumentObject,
} from "@/lib/documents/storage";
import { MAX_COMPETITION_DOCUMENT_BYTES } from "@/lib/documents/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdminSupabaseConfigured } from "@/lib/supabase/server-env";
import type { CompetitionDocumentRecord, RoundRecord } from "@/types/competition";

function createSupabaseDocumentOpsDeps(): RoundDocumentOpsDeps {
  const admin = createSupabaseAdminClient();

  return {
    generateUuid: () => randomUUID(),
    nowIso: () => new Date().toISOString(),
    onError(context, detail) {
      console.error(`[documents] ${context}:`, detail);
    },

    async findRoundForEvent(eventId, roundId) {
      const { data, error } = await admin
        .from("rounds")
        .select("id, event_id, round_number, name")
        .eq("id", roundId)
        .eq("event_id", eventId)
        .maybeSingle<
          Pick<RoundRecord, "id" | "event_id" | "round_number" | "name">
        >();

      if (error) {
        console.error("[documents] round lookup error:", error.message);
        return { round: null, error: error.message };
      }

      return { round: data ?? null, error: null };
    },

    async findActiveDocument(eventId, roundId, documentId) {
      const { data, error } = await admin
        .from("competition_documents")
        .select("*")
        .eq("id", documentId)
        .eq("event_id", eventId)
        .eq("round_id", roundId)
        .eq("status", "active")
        .maybeSingle<CompetitionDocumentRecord>();

      if (error) {
        console.error("[documents] document lookup error:", error.message);
        return { document: null, error: error.message };
      }

      return { document: data ?? null, error: null };
    },

    async uploadStorageObject(params) {
      return uploadCompetitionDocumentObject(params);
    },

    async removeStorageObject(params) {
      return removeCompetitionDocumentObject(params);
    },

    async insertDocumentMetadata(params) {
      const { data, error } = await admin
        .from("competition_documents")
        .insert({
          id: params.id,
          event_id: params.eventId,
          round_id: params.roundId,
          title: params.title,
          original_filename: params.originalFilename,
          storage_bucket: params.storageBucket,
          storage_object_path: params.storageObjectPath,
          mime_type: params.mimeType,
          file_size_bytes: params.fileSizeBytes,
          status: "active",
          created_by: params.actorUserId,
          updated_by: params.actorUserId,
        })
        .select("*")
        .single<CompetitionDocumentRecord>();

      if (error || !data) {
        console.error("[documents] insert metadata error:", error?.message);
        return {
          document: null,
          error: error?.message ?? "Insert returned no row",
        };
      }

      return { document: data, error: null };
    },

    async updateDocumentTitle(params) {
      const { data, error } = await admin
        .from("competition_documents")
        .update({
          title: params.title,
          updated_by: params.actorUserId,
        })
        .eq("id", params.documentId)
        .eq("event_id", params.eventId)
        .eq("round_id", params.roundId)
        .eq("status", "active")
        .select("*")
        .maybeSingle<CompetitionDocumentRecord>();

      if (error || !data) {
        console.error("[documents] rename error:", error?.message);
        return {
          document: null,
          error: error?.message ?? "Document update returned no row",
        };
      }

      return { document: data, error: null };
    },

    async replaceDocumentMetadata(params) {
      const { data, error } = await admin
        .from("competition_documents")
        .update({
          title: params.title,
          original_filename: params.originalFilename,
          storage_object_path: params.newStorageObjectPath,
          mime_type: params.mimeType,
          file_size_bytes: params.fileSizeBytes,
          updated_by: params.actorUserId,
        })
        .eq("id", params.documentId)
        .eq("event_id", params.eventId)
        .eq("round_id", params.roundId)
        .eq("status", "active")
        .eq("storage_object_path", params.expectedOldStoragePath)
        .select("*")
        .maybeSingle<CompetitionDocumentRecord>();

      if (error || !data) {
        console.error("[documents] replace metadata error:", error?.message);
        return {
          document: null,
          error: error?.message ?? "Replace update returned no row",
        };
      }

      return { document: data, error: null };
    },

    async archiveDocumentMetadata(params) {
      const { data, error } = await admin
        .from("competition_documents")
        .update({
          status: "archived",
          storage_object_path: null,
          archived_at: params.archivedAtIso,
          archived_by: params.actorUserId,
          updated_by: params.actorUserId,
        })
        .eq("id", params.documentId)
        .eq("event_id", params.eventId)
        .eq("round_id", params.roundId)
        .eq("status", "active")
        .eq("storage_object_path", params.expectedStoragePath)
        .select("*")
        .maybeSingle<CompetitionDocumentRecord>();

      if (error || !data) {
        console.error("[documents] archive metadata error:", error?.message);
        return {
          document: null,
          error: error?.message ?? "Archive update returned no row",
        };
      }

      return { document: data, error: null };
    },

    async recordAudit(entry) {
      return recordAuditLog(entry);
    },
  };
}

function appendResultWarning(
  result: DocumentOperationResult,
  extraWarning: string,
): DocumentOperationResult {
  if (!result.ok) return result;
  return {
    ...result,
    warning: result.warning
      ? `${result.warning} ${extraWarning}`
      : extraWarning,
  };
}

function tryRevalidateRoundPath(
  eventId: string,
  roundId: string,
  result: DocumentOperationResult,
): DocumentOperationResult {
  if (!result.ok) {
    return result;
  }

  try {
    revalidatePath(`/events/${eventId.trim()}/rounds/${roundId.trim()}`);
    return result;
  } catch (err) {
    const detail =
      err instanceof Error ? err.message : "Unknown revalidation error";
    console.error("[documents] revalidatePath failed:", detail);
    return appendResultWarning(
      result,
      "Page cache refresh could not be completed automatically; reload the page to confirm the updated list.",
    );
  }
}

function toDocumentActor(
  profile: { id: string; email: string; role: "super_admin" | "event_coordinator"; is_active: boolean },
): DocumentActorContext {
  return {
    userId: profile.id,
    email: profile.email,
    role: profile.role,
    isActive: profile.is_active,
  };
}

async function readValidatedFileFromFormData(
  formData: FormData,
): Promise<
  | {
      ok: true;
      fileName: string;
      mimeType: string;
      fileBytes: Uint8Array;
    }
  | { ok: false; message: string }
> {
  const entry = formData.get("file");
  if (!(entry instanceof File) || entry.size === 0) {
    return { ok: false, message: "Select a non-empty PDF file to upload." };
  }

  if (entry.size > MAX_COMPETITION_DOCUMENT_BYTES) {
    return {
      ok: false,
      message: "PDF file exceeds the maximum allowed size of 25 MB.",
    };
  }

  const arrayBuffer = await entry.arrayBuffer();
  return {
    ok: true,
    fileName: entry.name,
    mimeType: entry.type,
    fileBytes: new Uint8Array(arrayBuffer),
  };
}

export async function uploadRoundDocumentAction(
  _prevState: DocumentOperationResult | null,
  formData: FormData,
): Promise<DocumentOperationResult> {
  try {
    const actor = await requireActiveUserForAction(SUPER_ADMIN_ONLY, {
      actionName: "round_document.uploaded",
    });

    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        message:
          "SUPABASE_SERVICE_ROLE_KEY is missing on the server. PDF management requires admin configuration.",
      };
    }

    const eventId = String(formData.get("eventId") ?? "");
    const roundId = String(formData.get("roundId") ?? "");
    const title = String(formData.get("title") ?? "");

    const fileRes = await readValidatedFileFromFormData(formData);
    if (!fileRes.ok) {
      return { ok: false, message: fileRes.message };
    }

    const result = await uploadRoundDocumentWithDeps(
      {
        actor: toDocumentActor(actor.profile),
        eventId,
        roundId,
        title,
        fileName: fileRes.fileName,
        mimeType: fileRes.mimeType,
        fileBytes: fileRes.fileBytes,
      },
      createSupabaseDocumentOpsDeps(),
    );

    return tryRevalidateRoundPath(eventId, roundId, result);
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    console.error(
      "[documents] uploadRoundDocumentAction unexpected error:",
      err instanceof Error ? err.message : err,
    );
    return {
      ok: false,
      message: "Unexpected error while uploading the round PDF.",
    };
  }
}

export async function updateRoundDocumentTitleAction(
  formData: FormData,
): Promise<DocumentOperationResult> {
  try {
    const actor = await requireActiveUserForAction(SUPER_ADMIN_ONLY, {
      actionName: "round_document.renamed",
    });

    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        message:
          "SUPABASE_SERVICE_ROLE_KEY is missing on the server. PDF management requires admin configuration.",
      };
    }

    const eventId = String(formData.get("eventId") ?? "");
    const roundId = String(formData.get("roundId") ?? "");
    const documentId = String(formData.get("documentId") ?? "");
    const title = String(formData.get("title") ?? "");

    const result = await updateRoundDocumentTitleWithDeps(
      {
        actor: toDocumentActor(actor.profile),
        eventId,
        roundId,
        documentId,
        title,
      },
      createSupabaseDocumentOpsDeps(),
    );

    return tryRevalidateRoundPath(eventId, roundId, result);
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    console.error(
      "[documents] updateRoundDocumentTitleAction unexpected error:",
      err instanceof Error ? err.message : err,
    );
    return {
      ok: false,
      message: "Unexpected error while updating the document title.",
    };
  }
}

export async function replaceRoundDocumentAction(
  formData: FormData,
): Promise<DocumentOperationResult> {
  try {
    const actor = await requireActiveUserForAction(SUPER_ADMIN_ONLY, {
      actionName: "round_document.replaced",
    });

    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        message:
          "SUPABASE_SERVICE_ROLE_KEY is missing on the server. PDF management requires admin configuration.",
      };
    }

    const eventId = String(formData.get("eventId") ?? "");
    const roundId = String(formData.get("roundId") ?? "");
    const documentId = String(formData.get("documentId") ?? "");
    const title = String(formData.get("title") ?? "");

    const fileRes = await readValidatedFileFromFormData(formData);
    if (!fileRes.ok) {
      return { ok: false, message: fileRes.message };
    }

    const result = await replaceRoundDocumentWithDeps(
      {
        actor: toDocumentActor(actor.profile),
        eventId,
        roundId,
        documentId,
        title,
        fileName: fileRes.fileName,
        mimeType: fileRes.mimeType,
        fileBytes: fileRes.fileBytes,
      },
      createSupabaseDocumentOpsDeps(),
    );

    return tryRevalidateRoundPath(eventId, roundId, result);
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    console.error(
      "[documents] replaceRoundDocumentAction unexpected error:",
      err instanceof Error ? err.message : err,
    );
    return {
      ok: false,
      message: "Unexpected error while replacing the round PDF.",
    };
  }
}

export async function removeRoundDocumentAction(
  eventId: string,
  roundId: string,
  documentId: string,
): Promise<DocumentOperationResult> {
  try {
    const actor = await requireActiveUserForAction(SUPER_ADMIN_ONLY, {
      actionName: "round_document.removed",
    });

    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        message:
          "SUPABASE_SERVICE_ROLE_KEY is missing on the server. PDF management requires admin configuration.",
      };
    }

    const result = await removeRoundDocumentWithDeps(
      {
        actor: toDocumentActor(actor.profile),
        eventId,
        roundId,
        documentId,
      },
      createSupabaseDocumentOpsDeps(),
    );

    return tryRevalidateRoundPath(eventId, roundId, result);
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    console.error(
      "[documents] removeRoundDocumentAction unexpected error:",
      err instanceof Error ? err.message : err,
    );
    return {
      ok: false,
      message: "Unexpected error while removing the round PDF.",
    };
  }
}
