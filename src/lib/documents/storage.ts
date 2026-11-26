import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ALLOWED_COMPETITION_DOCUMENT_MIME,
  COMPETITION_DOCUMENTS_BUCKET,
} from "@/lib/documents/validation";

if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/documents/storage.ts contains server-only Storage operations and cannot run in the browser.",
  );
}

export interface StorageOperationResult {
  ok: boolean;
  error?: string;
}

/**
 * Uploads a validated PDF binary to the private competition-documents bucket.
 * Never creates public URLs or overwrites existing objects (upsert: false).
 */
export async function uploadCompetitionDocumentObject(params: {
  objectPath: string;
  fileBytes: Uint8Array;
}): Promise<StorageOperationResult> {
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.storage
      .from(COMPETITION_DOCUMENTS_BUCKET)
      .upload(params.objectPath, params.fileBytes, {
        contentType: ALLOWED_COMPETITION_DOCUMENT_MIME,
        upsert: false,
        cacheControl: "no-store",
      });

    if (error) {
      console.error("[documents-storage] upload failed:", error.message);
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown storage upload error";
    console.error("[documents-storage] unexpected upload error:", message);
    return { ok: false, error: message };
  }
}

/**
 * Removes an object from the private competition-documents bucket.
 */
export async function removeCompetitionDocumentObject(params: {
  objectPath: string;
}): Promise<StorageOperationResult> {
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.storage
      .from(COMPETITION_DOCUMENTS_BUCKET)
      .remove([params.objectPath]);

    if (error) {
      console.error("[documents-storage] remove failed:", error.message);
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown storage remove error";
    console.error("[documents-storage] unexpected remove error:", message);
    return { ok: false, error: message };
  }
}
