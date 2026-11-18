"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminSupabaseConfigured } from "@/lib/supabase/server-env";
import { recordAuditLog } from "@/lib/audit/logger";
import {
  OrganiserAuthError,
  requireActiveUserForAction,
} from "@/lib/auth/guards";
import { ALL_ORGANISER_ROLES } from "@/lib/auth/policy";
import { validateUuid } from "@/lib/competition/validation";
import {
  COMPETITION_DOCUMENTS_BUCKET,
  getStorageProvider,
} from "@/lib/storage";
import type {
  CompetitionDocumentRecord,
  CompetitionDocumentView,
} from "@/types/data-operations";
import type { EventRecord, RoundRecord } from "@/types/competition";

const MAX_DOCUMENT_SIZE = 25 * 1024 * 1024; // 25 MB

const ALLOWED_MIME_TYPES = new Set([
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  // Images
  "image/png",
  "image/jpeg",
  "image/webp",
  // Archives
  "application/zip",
  "application/x-zip-compressed",
]);

const ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
  "csv",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "zip",
]);

function sanitizeFileName(fileName: string): string {
  const baseName = fileName.replace(/^.*[\\/]/, "");
  return baseName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function uploadDocumentAction(
  formData: FormData,
): Promise<{ ok: boolean; message: string; documentId?: string }> {
  try {
    const actor = await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "document.upload",
    });

    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        message:
          "Document upload requires SUPABASE_SERVICE_ROLE_KEY to be configured on the server for private storage access.",
      };
    }

    const eventId = String(formData.get("eventId") ?? "");
    const roundId = String(formData.get("roundId") ?? "") || null;
    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim() || null;
    const file = formData.get("file");

    const eventCheck = validateUuid(eventId, "Event");
    if (!eventCheck.ok) return { ok: false, message: eventCheck.error };

    let targetRoundId: string | null = null;
    if (roundId) {
      const roundCheck = validateUuid(roundId, "Round");
      if (!roundCheck.ok) return { ok: false, message: roundCheck.error };
      targetRoundId = roundCheck.value;
    }

    if (title.length < 2 || title.length > 160) {
      return {
        ok: false,
        message: "Document title must be between 2 and 160 characters.",
      };
    }

    if (!file || !(file instanceof File)) {
      return { ok: false, message: "Please select a valid document file." };
    }

    if (file.size === 0) {
      return { ok: false, message: "The selected file is empty (0 bytes)." };
    }

    if (file.size > MAX_DOCUMENT_SIZE) {
      return {
        ok: false,
        message: `File size exceeds the 25 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB).`,
      };
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return {
        ok: false,
        message: `File type .${ext} is not allowed. Supported formats: PDF, Word, Excel, PowerPoint, Text, CSV, PNG, JPG, ZIP.`,
      };
    }

    const mimeType = file.type || "application/octet-stream";
    if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
      // If MIME type is explicitly given and not in allowed list, reject
      return {
        ok: false,
        message: `MIME type "${file.type}" is not supported for competition documents.`,
      };
    }

    const supabase = await createSupabaseServerClient();

    // Verify Event & Round existence and relationship
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, name, code")
      .eq("id", eventCheck.value)
      .maybeSingle<EventRecord>();

    if (eventError || !event) {
      return { ok: false, message: "Event not found." };
    }

    if (targetRoundId) {
      const { data: round, error: roundError } = await supabase
        .from("rounds")
        .select("id, event_id, name")
        .eq("id", targetRoundId)
        .maybeSingle<RoundRecord>();

      if (roundError || !round || round.event_id !== event.id) {
        return {
          ok: false,
          message: "The specified round does not belong to this event.",
        };
      }
    }

    // Read buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const sanitizedName = sanitizeFileName(file.name);
    const storagePath = `events/${event.id}/${targetRoundId ?? "event_wide"}/${Date.now()}_${sanitizedName}`;

    // Upload to private bucket using StorageProvider abstraction
    const storageProvider = getStorageProvider();
    const uploadRes = await storageProvider.uploadFile(
      COMPETITION_DOCUMENTS_BUCKET,
      storagePath,
      buffer,
      mimeType,
    );

    if (!uploadRes.ok) {
      return {
        ok: false,
        message: `Storage upload failed: ${uploadRes.error}`,
      };
    }

    // Insert metadata into competition_documents
    const { data: docRecord, error: insertError } = await supabase
      .from("competition_documents")
      .insert({
        event_id: event.id,
        round_id: targetRoundId,
        title,
        description,
        file_name: file.name,
        file_path: uploadRes.path,
        file_size_bytes: file.size,
        mime_type: mimeType,
        storage_bucket: COMPETITION_DOCUMENTS_BUCKET,
        uploaded_by: actor.userId,
        is_archived: false,
      })
      .select("id")
      .single<{ id: string }>();

    if (insertError || !docRecord) {
      // Clean up uploaded file on DB insert failure
      await storageProvider.deleteFile(
        COMPETITION_DOCUMENTS_BUCKET,
        uploadRes.path,
      );
      return {
        ok: false,
        message: `Failed to record document metadata: ${insertError?.message ?? "DB error"}`,
      };
    }

    await recordAuditLog({
      actorUserId: actor.userId,
      actorEmail: actor.profile.email,
      action: "document.uploaded",
      entityType: "document",
      entityId: docRecord.id,
      metadata: {
        eventId: event.id,
        eventCode: event.code,
        roundId: targetRoundId,
        title,
        fileName: file.name,
        fileSizeBytes: file.size,
      },
    });

    revalidatePath(`/events/${event.id}`);
    if (targetRoundId) {
      revalidatePath(`/events/${event.id}/rounds/${targetRoundId}`);
    }

    return {
      ok: true,
      message: `Document "${title}" successfully uploaded.`,
      documentId: docRecord.id,
    };
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Unexpected error uploading document.",
    };
  }
}

export async function getDocumentSignedUrlAction(
  eventId: string,
  documentId: string,
): Promise<{ ok: boolean; message?: string; signedUrl?: string }> {
  try {
    const actor = await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "document.view",
    });

    const eventCheck = validateUuid(eventId, "Event");
    if (!eventCheck.ok) return { ok: false, message: eventCheck.error };

    const docCheck = validateUuid(documentId, "Document");
    if (!docCheck.ok) return { ok: false, message: docCheck.error };

    const supabase = await createSupabaseServerClient();

    // Scoped Authorization Check: Ensure document belongs to this event!
    // Prevents accessing other events' documents through manipulated identifiers.
    const { data: document, error: docError } = await supabase
      .from("competition_documents")
      .select("*")
      .eq("id", docCheck.value)
      .eq("event_id", eventCheck.value)
      .maybeSingle<CompetitionDocumentRecord>();

    if (docError || !document) {
      return {
        ok: false,
        message: "Document not found or does not belong to this event.",
      };
    }

    // Generate short-lived signed URL (300 seconds = 5 minutes)
    const storageProvider = getStorageProvider();
    const signedRes = await storageProvider.getSignedUrl(
      document.storage_bucket,
      document.file_path,
      300,
    );

    if (!signedRes.ok) {
      return { ok: false, message: signedRes.error };
    }

    await recordAuditLog({
      actorUserId: actor.userId,
      actorEmail: actor.profile.email,
      action: "document.viewed",
      entityType: "document",
      entityId: document.id,
      metadata: {
        eventId: document.event_id,
        roundId: document.round_id,
        title: document.title,
        fileName: document.file_name,
      },
    });

    return { ok: true, signedUrl: signedRes.url };
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : "Unexpected error retrieving document access URL.",
    };
  }
}

export async function deleteDocumentAction(
  eventId: string,
  documentId: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const actor = await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "document.delete",
    });

    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        message:
          "Document deletion requires SUPABASE_SERVICE_ROLE_KEY to be configured on the server.",
      };
    }

    const eventCheck = validateUuid(eventId, "Event");
    if (!eventCheck.ok) return { ok: false, message: eventCheck.error };

    const docCheck = validateUuid(documentId, "Document");
    if (!docCheck.ok) return { ok: false, message: docCheck.error };

    const supabase = await createSupabaseServerClient();

    // Scoped Check: Verify document belongs to event
    const { data: document, error: docError } = await supabase
      .from("competition_documents")
      .select("*")
      .eq("id", docCheck.value)
      .eq("event_id", eventCheck.value)
      .maybeSingle<CompetitionDocumentRecord>();

    if (docError || !document) {
      return {
        ok: false,
        message: "Document not found or does not belong to this event.",
      };
    }

    // Delete from storage
    const storageProvider = getStorageProvider();
    await storageProvider.deleteFile(
      document.storage_bucket,
      document.file_path,
    );

    // Delete metadata row from DB
    const { error: dbError } = await supabase
      .from("competition_documents")
      .delete()
      .eq("id", document.id);

    if (dbError) {
      return {
        ok: false,
        message: `Failed to remove document record: ${dbError.message}`,
      };
    }

    await recordAuditLog({
      actorUserId: actor.userId,
      actorEmail: actor.profile.email,
      action: "document.deleted",
      entityType: "document",
      entityId: document.id,
      metadata: {
        eventId: document.event_id,
        roundId: document.round_id,
        title: document.title,
        fileName: document.file_name,
      },
    });

    revalidatePath(`/events/${document.event_id}`);
    if (document.round_id) {
      revalidatePath(
        `/events/${document.event_id}/rounds/${document.round_id}`,
      );
    }

    return {
      ok: true,
      message: `Document "${document.title}" was permanently removed.`,
    };
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Failed to delete document.",
    };
  }
}

export async function getDocumentsForEventAction(
  eventId: string,
  roundId?: string | null,
): Promise<CompetitionDocumentView[]> {
  try {
    await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "document.list",
    });

    const eventCheck = validateUuid(eventId, "Event");
    if (!eventCheck.ok) return [];

    const supabase = await createSupabaseServerClient();

    let query = supabase
      .from("competition_documents")
      .select(
        `
        id,
        event_id,
        round_id,
        title,
        description,
        file_name,
        file_path,
        file_size_bytes,
        mime_type,
        storage_bucket,
        uploaded_by,
        is_archived,
        created_at,
        updated_at
      `,
      )
      .eq("event_id", eventCheck.value)
      .order("created_at", { ascending: false });

    if (roundId) {
      query = query.eq("round_id", roundId);
    }

    const { data: documents, error } = await query.returns<
      CompetitionDocumentRecord[]
    >();

    if (error || !documents) return [];

    // Optionally fetch uploader profiles
    const uploaderIds = documents
      .map((d) => d.uploaded_by)
      .filter(Boolean) as string[];

    const { data: profiles } =
      uploaderIds.length > 0
        ? await supabase
            .from("profiles")
            .select("id, full_name, email")
            .in("id", uploaderIds)
        : { data: [] };

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

    return documents.map((doc) => ({
      ...doc,
      uploaded_by_profile: doc.uploaded_by
        ? profileMap.get(doc.uploaded_by) ?? null
        : null,
    }));
  } catch {
    return [];
  }
}
