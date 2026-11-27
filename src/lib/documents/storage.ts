import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ALLOWED_COMPETITION_DOCUMENT_MIME,
  COMPETITION_DOCUMENTS_BUCKET,
  MAX_COMPETITION_DOCUMENT_BYTES,
} from "@/lib/documents/validation";
import type { UploadedStorageObjectInspection } from "@/types/competition";

export type { UploadedStorageObjectInspection };

if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/documents/storage.ts contains server-only Storage operations and cannot run in the browser.",
  );
}

export interface StorageOperationResult {
  ok: boolean;
  error?: string;
}

export interface SignedUploadCreationResult {
  ok: boolean;
  path?: string;
  token?: string;
  error?: string;
}

const PDF_HEADER_READ_LIMIT_BYTES = 16;

async function readLeadingBytesBounded(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array | null> {
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer.slice(0, maxBytes));
  }

  const reader = response.body.getReader();
  const collected: number[] = [];
  try {
    while (collected.length < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      for (let i = 0; i < value.byteLength && collected.length < maxBytes; i++) {
        collected.push(value[i]);
      }
      if (collected.length >= maxBytes) {
        await reader.cancel();
        break;
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Ignore stream cancel errors after reading leading bytes.
    }
  }

  return new Uint8Array(collected);
}

/**
 * Generates a single-path, non-overwriting signed upload token for direct browser upload.
 * Never returns or logs the service-role key or signedUrl.
 */
export async function createCompetitionDocumentSignedUpload(params: {
  objectPath: string;
}): Promise<SignedUploadCreationResult> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.storage
      .from(COMPETITION_DOCUMENTS_BUCKET)
      .createSignedUploadUrl(params.objectPath, { upsert: false });

    if (error || !data?.token || !data?.path) {
      console.error(
        "[documents-storage] createSignedUploadUrl failed:",
        error?.message ?? "Missing signed upload token",
      );
      return {
        ok: false,
        error: error?.message ?? "Unable to issue signed upload token.",
      };
    }

    return {
      ok: true,
      path: data.path,
      token: data.token,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown signed upload creation error";
    console.error("[documents-storage] unexpected createSignedUploadUrl error:", message);
    return { ok: false, error: message };
  }
}

/**
 * Inspects an uploaded object in private Storage using the service-role client:
 * 1. Verifies existence and authoritative metadata (size, contentType) via info().
 * 2. Performs a bounded Range read (falling back to bounded download only within 25 MiB)
 *    to read the leading bytes for %PDF- signature verification.
 */
export async function inspectUploadedCompetitionDocumentObject(params: {
  objectPath: string;
}): Promise<UploadedStorageObjectInspection> {
  try {
    const admin = createSupabaseAdminClient();
    const bucket = admin.storage.from(COMPETITION_DOCUMENTS_BUCKET);

    const { data: infoData, error: infoError } = await bucket.info(params.objectPath);
    if (infoError || !infoData || infoData.isDeleteMarker) {
      if (infoError) {
        console.error("[documents-storage] info lookup failed:", infoError.message);
      }
      return {
        exists: false,
        sizeBytes: null,
        contentType: null,
        headerBytes: null,
        error: infoError?.message ?? null,
      };
    }

    const rawSize =
      typeof infoData.size === "number"
        ? infoData.size
        : typeof infoData.metadata?.size === "number"
          ? infoData.metadata.size
          : null;
    const rawContentType =
      (infoData.contentType ?? infoData.metadata?.mimetype ?? "")
        .trim()
        .toLowerCase() || null;

    if (
      rawSize === null ||
      !Number.isInteger(rawSize) ||
      rawSize <= 0 ||
      rawSize > MAX_COMPETITION_DOCUMENT_BYTES ||
      rawContentType !== ALLOWED_COMPETITION_DOCUMENT_MIME
    ) {
      return {
        exists: true,
        sizeBytes: rawSize,
        contentType: rawContentType,
        headerBytes: null,
        error: null,
      };
    }

    // Prefer a bounded Range read via a short-lived server-side signed URL.
    let headerBytes: Uint8Array | null = null;
    try {
      const { data: signedData, error: signedErr } = await bucket.createSignedUrl(
        params.objectPath,
        60,
      );
      if (!signedErr && signedData?.signedUrl) {
        const res = await fetch(signedData.signedUrl, {
          headers: { Range: `bytes=0-${PDF_HEADER_READ_LIMIT_BYTES - 1}` },
          cache: "no-store",
        });
        if (res.status === 206 || res.status === 200) {
          headerBytes = await readLeadingBytesBounded(
            res,
            PDF_HEADER_READ_LIMIT_BYTES,
          );
        }
      }
    } catch (rangeErr) {
      console.error(
        "[documents-storage] bounded range header read failed, falling back to bounded download:",
        rangeErr instanceof Error ? rangeErr.message : rangeErr,
      );
    }

    // Fallback to bounded download only after size <= 25 MiB is already confirmed via info().
    if (!headerBytes) {
      const { data: blob, error: downloadError } = await bucket.download(
        params.objectPath,
      );
      if (downloadError || !blob) {
        console.error(
          "[documents-storage] header verification download failed:",
          downloadError?.message ?? "No blob returned",
        );
        return {
          exists: true,
          sizeBytes: rawSize,
          contentType: rawContentType,
          headerBytes: null,
          error: downloadError?.message ?? "Unable to read uploaded PDF header",
        };
      }
      const sliceBuffer = await blob
        .slice(0, PDF_HEADER_READ_LIMIT_BYTES)
        .arrayBuffer();
      headerBytes = new Uint8Array(sliceBuffer);
    }

    return {
      exists: true,
      sizeBytes: rawSize,
      contentType: rawContentType,
      headerBytes,
      error: null,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown storage inspection error";
    console.error("[documents-storage] unexpected inspect error:", message);
    return {
      exists: false,
      sizeBytes: null,
      contentType: null,
      headerBytes: null,
      error: message,
    };
  }
}

export interface SignedViewCreationResult {
  ok: boolean;
  viewUrl?: string;
  expiresInSeconds?: number;
  error?: string;
}

export function clampCompetitionDocumentSignedViewTtl(
  expiresInSeconds?: number,
): number {
  if (
    typeof expiresInSeconds === "number" &&
    Number.isFinite(expiresInSeconds)
  ) {
    return Math.min(Math.max(Math.floor(expiresInSeconds), 15), 120);
  }
  return 60;
}

/**
 * Generates a short-lived signed URL for inline browser viewing of a private PDF.
 * Does not pass the download option (allowing inline PDF viewing) and never logs
 * or returns the service-role key or signed URL token.
 */
export async function createCompetitionDocumentSignedViewUrl(params: {
  objectPath: string;
  expiresInSeconds?: number;
}): Promise<SignedViewCreationResult> {
  try {
    const clampedTtl = clampCompetitionDocumentSignedViewTtl(
      params.expiresInSeconds,
    );
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.storage
      .from(COMPETITION_DOCUMENTS_BUCKET)
      .createSignedUrl(params.objectPath, clampedTtl);

    if (error || !data?.signedUrl) {
      console.error(
        "[documents-storage] createSignedUrl failed:",
        error?.message ?? "Missing signed view URL",
      );
      return {
        ok: false,
        error: error?.message ?? "Unable to generate temporary document view link.",
      };
    }

    return {
      ok: true,
      viewUrl: data.signedUrl,
      expiresInSeconds: clampedTtl,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown signed view URL error";
    console.error("[documents-storage] unexpected createSignedUrl error:", message);
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
