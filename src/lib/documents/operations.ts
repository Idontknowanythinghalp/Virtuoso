import { validateUuid } from "@/lib/competition/validation";
import {
  ALLOWED_COMPETITION_DOCUMENT_MIME,
  buildCompetitionDocumentStoragePath,
  COMPETITION_DOCUMENTS_BUCKET,
  isSafeCompetitionDocumentStoragePath,
  MAX_COMPETITION_DOCUMENT_BYTES,
  validateDocumentTitle,
  validatePdfBufferHeader,
  validatePdfUploadInput,
  validatePdfUploadMetadataInput,
  validateSafePdfFilename,
} from "@/lib/documents/validation";
import type { OrganiserRole } from "@/types/auth";
import type {
  CompetitionDocumentRecord,
  DocumentOperationResult,
  SignedUploadIntentResult,
  UploadedStorageObjectInspection,
} from "@/types/competition";

export type {
  DocumentOperationResult,
  SignedUploadIntentResult,
  UploadedStorageObjectInspection,
};

export interface DocumentActorContext {
  userId: string;
  email: string;
  role: OrganiserRole;
  isActive: boolean;
}

export interface DocumentAuditEntryInput {
  actorUserId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export interface RoundDocumentOpsDeps {
  generateUuid: () => string;
  nowIso: () => string;
  onError?: (context: string, detail: string) => void;
  findRoundForEvent: (
    eventId: string,
    roundId: string,
  ) => Promise<{
    round: { id: string; event_id: string; round_number: number; name: string } | null;
    error: string | null;
  }>;
  findActiveDocument: (
    eventId: string,
    roundId: string,
    documentId: string,
  ) => Promise<{
    document: CompetitionDocumentRecord | null;
    error: string | null;
  }>;
  uploadStorageObject: (params: {
    objectPath: string;
    fileBytes: Uint8Array;
  }) => Promise<{ ok: boolean; error?: string }>;
  removeStorageObject: (params: {
    objectPath: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  insertDocumentMetadata: (params: {
    id: string;
    eventId: string;
    roundId: string;
    title: string;
    originalFilename: string;
    storageBucket: string;
    storageObjectPath: string;
    mimeType: string;
    fileSizeBytes: number;
    actorUserId: string;
  }) => Promise<{
    document: CompetitionDocumentRecord | null;
    error: string | null;
    isConflict?: boolean;
  }>;
  updateDocumentTitle: (params: {
    eventId: string;
    roundId: string;
    documentId: string;
    title: string;
    actorUserId: string;
  }) => Promise<{
    document: CompetitionDocumentRecord | null;
    error: string | null;
  }>;
  replaceDocumentMetadata: (params: {
    eventId: string;
    roundId: string;
    documentId: string;
    expectedOldStoragePath: string;
    title: string;
    originalFilename: string;
    newStorageObjectPath: string;
    mimeType: string;
    fileSizeBytes: number;
    actorUserId: string;
  }) => Promise<{
    document: CompetitionDocumentRecord | null;
    error: string | null;
    isConflict?: boolean;
  }>;
  archiveDocumentMetadata: (params: {
    eventId: string;
    roundId: string;
    documentId: string;
    expectedStoragePath: string;
    archivedAtIso: string;
    actorUserId: string;
  }) => Promise<{
    document: CompetitionDocumentRecord | null;
    error: string | null;
  }>;
  recordAudit: (
    entry: DocumentAuditEntryInput,
  ) => Promise<{ ok: boolean; error?: string }>;
}

export interface DirectUploadRoundDocumentOpsDeps extends RoundDocumentOpsDeps {
  createSignedUpload: (params: {
    objectPath: string;
  }) => Promise<{
    ok: boolean;
    path?: string;
    token?: string;
    error?: string;
  }>;
  inspectUploadedObject: (params: {
    objectPath: string;
  }) => Promise<UploadedStorageObjectInspection>;
  isStoragePathRegistered: (
    storageObjectPath: string,
  ) => Promise<{ exists: boolean; error: string | null }>;
}

function assertSuperAdminActor(
  actor: DocumentActorContext,
): { ok: true; userId: string } | { ok: false; message: string } {
  const actorIdCheck = validateUuid(actor.userId, "Administrator");
  if (!actorIdCheck.ok || !actor.isActive || actor.role !== "super_admin") {
    return {
      ok: false,
      message: "Only an active Super Admin may manage round PDF documents.",
    };
  }
  return { ok: true, userId: actorIdCheck.value.toLowerCase() };
}

function toSafeAuditSnapshot(
  doc: CompetitionDocumentRecord,
): Record<string, unknown> {
  return {
    id: doc.id,
    event_id: doc.event_id,
    round_id: doc.round_id,
    title: doc.title,
    original_filename: doc.original_filename,
    storage_bucket: doc.storage_bucket,
    storage_object_path: doc.storage_object_path,
    mime_type: doc.mime_type,
    file_size_bytes: doc.file_size_bytes,
    status: doc.status,
    archived_at: doc.archived_at,
  };
}

function reportSecondaryError(
  deps: RoundDocumentOpsDeps,
  context: string,
  detail: string,
): void {
  if (deps.onError) {
    try {
      deps.onError(context, detail);
      return;
    } catch (loggerErr) {
      const loggerDetail =
        loggerErr instanceof Error ? loggerErr.message : String(loggerErr);
      console.error(
        `[documents] secondary error logger failed (${loggerDetail}); original error [${context}]:`,
        detail,
      );
      return;
    }
  }
  console.error(`[documents] ${context}:`, detail);
}

async function safeRemoveStorageObject(
  deps: RoundDocumentOpsDeps,
  objectPath: string,
  context: string,
): Promise<{ ok: boolean }> {
  try {
    const res = await deps.removeStorageObject({ objectPath });
    if (!res.ok) {
      reportSecondaryError(
        deps,
        context,
        res.error ?? `Storage removal returned failure for ${objectPath}`,
      );
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    const detail =
      err instanceof Error ? err.message : "Unknown storage removal exception";
    reportSecondaryError(deps, context, detail);
    return { ok: false };
  }
}

async function safeRecordAudit(
  deps: RoundDocumentOpsDeps,
  entry: DocumentAuditEntryInput,
): Promise<{ ok: boolean }> {
  try {
    const res = await deps.recordAudit(entry);
    if (!res.ok) {
      reportSecondaryError(
        deps,
        `audit:${entry.action}`,
        res.error ?? "Audit log recording returned failure",
      );
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    const detail =
      err instanceof Error ? err.message : "Unknown audit logging exception";
    reportSecondaryError(deps, `audit:${entry.action}`, detail);
    return { ok: false };
  }
}

function joinWarnings(warnings: string[]): string | undefined {
  const filtered = warnings.map((w) => w.trim()).filter(Boolean);
  return filtered.length > 0 ? filtered.join(" ") : undefined;
}

export async function uploadRoundDocumentWithDeps(
  input: {
    actor: DocumentActorContext;
    eventId: string;
    roundId: string;
    title: string;
    fileName: string;
    mimeType: string;
    fileBytes: Uint8Array;
  },
  deps: RoundDocumentOpsDeps,
): Promise<DocumentOperationResult> {
  const actorCheck = assertSuperAdminActor(input.actor);
  if (!actorCheck.ok) return { ok: false, message: actorCheck.message };

  const eventCheck = validateUuid(input.eventId, "Event");
  if (!eventCheck.ok) return { ok: false, message: eventCheck.error };

  const roundCheck = validateUuid(input.roundId, "Round");
  if (!roundCheck.ok) return { ok: false, message: roundCheck.error };

  const eventId = eventCheck.value.toLowerCase();
  const roundId = roundCheck.value.toLowerCase();

  const fileCheck = validatePdfUploadInput({
    title: input.title,
    fileName: input.fileName,
    mimeType: input.mimeType,
    fileSizeBytes: input.fileBytes.byteLength,
    headerBytes: input.fileBytes,
  });
  if (!fileCheck.ok) {
    return { ok: false, message: fileCheck.error };
  }

  const roundRes = await deps.findRoundForEvent(eventId, roundId);
  if (roundRes.error) {
    return {
      ok: false,
      message: "Unable to verify target round before uploading PDF.",
    };
  }
  if (!roundRes.round) {
    return {
      ok: false,
      message: "Target round was not found for this event.",
    };
  }

  const docUuid = deps.generateUuid().trim().toLowerCase();
  const objectUuid = deps.generateUuid().trim().toLowerCase();
  const docIdCheck = validateUuid(docUuid, "Document");
  if (!docIdCheck.ok) {
    return { ok: false, message: "Unable to allocate document identifier." };
  }

  const pathCheck = buildCompetitionDocumentStoragePath(
    eventId,
    roundId,
    objectUuid,
  );
  if (!pathCheck.ok) {
    return { ok: false, message: pathCheck.error };
  }
  const storageObjectPath = pathCheck.value;

  const uploadRes = await deps.uploadStorageObject({
    objectPath: storageObjectPath,
    fileBytes: input.fileBytes,
  });
  if (!uploadRes.ok) {
    return {
      ok: false,
      message:
        "Unable to upload the PDF file to private storage. Please try again.",
    };
  }

  const insertRes = await deps.insertDocumentMetadata({
    id: docIdCheck.value.toLowerCase(),
    eventId,
    roundId,
    title: fileCheck.value.title,
    originalFilename: fileCheck.value.originalFilename,
    storageBucket: COMPETITION_DOCUMENTS_BUCKET,
    storageObjectPath,
    mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
    fileSizeBytes: fileCheck.value.fileSizeBytes,
    actorUserId: actorCheck.userId,
  });

  if (insertRes.error || !insertRes.document) {
    const cleanupRes = await safeRemoveStorageObject(
      deps,
      storageObjectPath,
      "upload-insert-rollback-cleanup",
    );
    return {
      ok: false,
      message: cleanupRes.ok
        ? "Unable to save document metadata after upload. No document was attached."
        : `Unable to save document metadata after upload, and storage cleanup failed. An orphaned object may remain in storage at "${storageObjectPath}".`,
    };
  }

  const auditRes = await safeRecordAudit(deps, {
    actorUserId: actorCheck.userId,
    actorEmail: input.actor.email,
    action: "round_document.uploaded",
    entityType: "competition_document",
    entityId: insertRes.document.id,
    afterData: toSafeAuditSnapshot(insertRes.document),
    metadata: {
      eventId,
      roundId,
      roundNumber: roundRes.round.round_number,
    },
  });

  return {
    ok: true,
    documentId: insertRes.document.id,
    message: `Uploaded PDF "${insertRes.document.title}".`,
    ...(auditRes.ok
      ? {}
      : {
          warning:
            "The PDF was uploaded and saved, but recording the audit log failed. Do not re-upload.",
        }),
  };
}

export async function updateRoundDocumentTitleWithDeps(
  input: {
    actor: DocumentActorContext;
    eventId: string;
    roundId: string;
    documentId: string;
    title: string;
  },
  deps: RoundDocumentOpsDeps,
): Promise<DocumentOperationResult> {
  const actorCheck = assertSuperAdminActor(input.actor);
  if (!actorCheck.ok) return { ok: false, message: actorCheck.message };

  const eventCheck = validateUuid(input.eventId, "Event");
  if (!eventCheck.ok) return { ok: false, message: eventCheck.error };

  const roundCheck = validateUuid(input.roundId, "Round");
  if (!roundCheck.ok) return { ok: false, message: roundCheck.error };

  const docCheck = validateUuid(input.documentId, "Document");
  if (!docCheck.ok) return { ok: false, message: docCheck.error };

  const titleCheck = validateDocumentTitle(input.title);
  if (!titleCheck.ok) return { ok: false, message: titleCheck.error };

  const eventId = eventCheck.value.toLowerCase();
  const roundId = roundCheck.value.toLowerCase();
  const documentId = docCheck.value.toLowerCase();

  const existingRes = await deps.findActiveDocument(
    eventId,
    roundId,
    documentId,
  );
  if (existingRes.error) {
    return {
      ok: false,
      message: "Unable to load document record before updating its title.",
    };
  }
  if (!existingRes.document || existingRes.document.status !== "active") {
    return {
      ok: false,
      message: "Active round document was not found.",
    };
  }

  const updateRes = await deps.updateDocumentTitle({
    eventId,
    roundId,
    documentId,
    title: titleCheck.value,
    actorUserId: actorCheck.userId,
  });
  if (updateRes.error || !updateRes.document) {
    return {
      ok: false,
      message: "Unable to update the PDF title right now.",
    };
  }

  const auditRes = await safeRecordAudit(deps, {
    actorUserId: actorCheck.userId,
    actorEmail: input.actor.email,
    action: "round_document.renamed",
    entityType: "competition_document",
    entityId: documentId,
    beforeData: toSafeAuditSnapshot(existingRes.document),
    afterData: toSafeAuditSnapshot(updateRes.document),
    metadata: { eventId, roundId },
  });

  return {
    ok: true,
    documentId,
    message: `Updated document title to "${updateRes.document.title}".`,
    ...(auditRes.ok
      ? {}
      : {
          warning:
            "The document title was updated, but recording the audit log failed.",
        }),
  };
}

export async function replaceRoundDocumentWithDeps(
  input: {
    actor: DocumentActorContext;
    eventId: string;
    roundId: string;
    documentId: string;
    title: string;
    fileName: string;
    mimeType: string;
    fileBytes: Uint8Array;
  },
  deps: RoundDocumentOpsDeps,
): Promise<DocumentOperationResult> {
  const actorCheck = assertSuperAdminActor(input.actor);
  if (!actorCheck.ok) return { ok: false, message: actorCheck.message };

  const eventCheck = validateUuid(input.eventId, "Event");
  if (!eventCheck.ok) return { ok: false, message: eventCheck.error };

  const roundCheck = validateUuid(input.roundId, "Round");
  if (!roundCheck.ok) return { ok: false, message: roundCheck.error };

  const docCheck = validateUuid(input.documentId, "Document");
  if (!docCheck.ok) return { ok: false, message: docCheck.error };

  const eventId = eventCheck.value.toLowerCase();
  const roundId = roundCheck.value.toLowerCase();
  const documentId = docCheck.value.toLowerCase();

  const fileCheck = validatePdfUploadInput({
    title: input.title,
    fileName: input.fileName,
    mimeType: input.mimeType,
    fileSizeBytes: input.fileBytes.byteLength,
    headerBytes: input.fileBytes,
  });
  if (!fileCheck.ok) {
    return { ok: false, message: fileCheck.error };
  }

  const existingRes = await deps.findActiveDocument(
    eventId,
    roundId,
    documentId,
  );
  if (existingRes.error) {
    return {
      ok: false,
      message: "Unable to verify existing document before replacement.",
    };
  }
  const existingDoc = existingRes.document;
  if (
    !existingDoc ||
    existingDoc.status !== "active" ||
    !isSafeCompetitionDocumentStoragePath(
      existingDoc.storage_object_path,
      eventId,
      roundId,
    )
  ) {
    return {
      ok: false,
      message: "Active round document was not found.",
    };
  }
  const oldStoragePath = existingDoc.storage_object_path!;

  const newObjectUuid = deps.generateUuid().trim().toLowerCase();
  const newPathCheck = buildCompetitionDocumentStoragePath(
    eventId,
    roundId,
    newObjectUuid,
  );
  if (!newPathCheck.ok) {
    return { ok: false, message: newPathCheck.error };
  }
  const newStoragePath = newPathCheck.value;

  // Step 1: Upload the new PDF file first. Old metadata and old object remain untouched if this fails.
  const uploadRes = await deps.uploadStorageObject({
    objectPath: newStoragePath,
    fileBytes: input.fileBytes,
  });
  if (!uploadRes.ok) {
    return {
      ok: false,
      message:
        "Unable to upload the replacement PDF to private storage. The existing PDF remains unchanged.",
    };
  }

  // Step 2: Update database metadata to point to the new storage object.
  const replaceDbRes = await deps.replaceDocumentMetadata({
    eventId,
    roundId,
    documentId,
    expectedOldStoragePath: oldStoragePath,
    title: fileCheck.value.title,
    originalFilename: fileCheck.value.originalFilename,
    newStorageObjectPath: newStoragePath,
    mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
    fileSizeBytes: fileCheck.value.fileSizeBytes,
    actorUserId: actorCheck.userId,
  });

  if (replaceDbRes.error || !replaceDbRes.document) {
    // Metadata update failed: NEVER delete oldStoragePath; clean up orphan newStoragePath instead.
    const cleanupRes = await safeRemoveStorageObject(
      deps,
      newStoragePath,
      "replace-db-rollback-cleanup",
    );
    return {
      ok: false,
      documentId,
      message: cleanupRes.ok
        ? "Unable to update document metadata for the replacement PDF. The previous PDF remains active and unchanged."
        : `Unable to update document metadata for the replacement PDF. The previous PDF remains active and unchanged, but cleanup of the newly uploaded storage object failed and an orphaned file may remain at "${newStoragePath}" (document ${documentId}).`,
    };
  }

  // Step 3: Only after DB metadata points to the new file, remove the superseded storage object.
  const removeOldRes = await safeRemoveStorageObject(
    deps,
    oldStoragePath,
    "replace-old-object-cleanup",
  );

  const auditRes = await safeRecordAudit(deps, {
    actorUserId: actorCheck.userId,
    actorEmail: input.actor.email,
    action: "round_document.replaced",
    entityType: "competition_document",
    entityId: documentId,
    beforeData: toSafeAuditSnapshot(existingDoc),
    afterData: toSafeAuditSnapshot(replaceDbRes.document),
    metadata: {
      eventId,
      roundId,
      previousObjectRemoved: removeOldRes.ok,
    },
  });

  const warnings: string[] = [];
  if (!removeOldRes.ok) {
    warnings.push(
      `Removing the previous storage object "${oldStoragePath}" for document ${documentId} could not be confirmed; an administrator should verify or remove the old file manually without retrying replacement.`,
    );
  }
  if (!auditRes.ok) {
    warnings.push("Recording the audit log failed.");
  }

  const warning = joinWarnings(warnings);
  return {
    ok: true,
    documentId,
    message: `Replaced PDF "${replaceDbRes.document.title}".`,
    ...(warning ? { warning } : {}),
  };
}

export async function removeRoundDocumentWithDeps(
  input: {
    actor: DocumentActorContext;
    eventId: string;
    roundId: string;
    documentId: string;
  },
  deps: RoundDocumentOpsDeps,
): Promise<DocumentOperationResult> {
  const actorCheck = assertSuperAdminActor(input.actor);
  if (!actorCheck.ok) return { ok: false, message: actorCheck.message };

  const eventCheck = validateUuid(input.eventId, "Event");
  if (!eventCheck.ok) return { ok: false, message: eventCheck.error };

  const roundCheck = validateUuid(input.roundId, "Round");
  if (!roundCheck.ok) return { ok: false, message: roundCheck.error };

  const docCheck = validateUuid(input.documentId, "Document");
  if (!docCheck.ok) return { ok: false, message: docCheck.error };

  const eventId = eventCheck.value.toLowerCase();
  const roundId = roundCheck.value.toLowerCase();
  const documentId = docCheck.value.toLowerCase();

  const existingRes = await deps.findActiveDocument(
    eventId,
    roundId,
    documentId,
  );
  if (existingRes.error) {
    return {
      ok: false,
      message: "Unable to load document metadata before removal.",
    };
  }

  const existingDoc = existingRes.document;
  if (
    !existingDoc ||
    existingDoc.status !== "active" ||
    !isSafeCompetitionDocumentStoragePath(
      existingDoc.storage_object_path,
      eventId,
      roundId,
    )
  ) {
    return {
      ok: false,
      message: "Active round document was not found.",
    };
  }

  const oldStoragePath = existingDoc.storage_object_path!;
  const archivedAtIso = deps.nowIso();

  // Step 1: Archive metadata and clear storage_object_path BEFORE deleting the object,
  // ensuring active metadata never points to a deleted storage object.
  // Once archived, NEVER restore the record to active even if Storage deletion reports an error.
  const archiveRes = await deps.archiveDocumentMetadata({
    eventId,
    roundId,
    documentId,
    expectedStoragePath: oldStoragePath,
    archivedAtIso,
    actorUserId: actorCheck.userId,
  });

  if (archiveRes.error || !archiveRes.document) {
    return {
      ok: false,
      message:
        "Unable to archive document metadata. The PDF file was not removed.",
    };
  }

  // Step 2: Permanently delete the file from private Supabase Storage.
  const removeRes = await safeRemoveStorageObject(
    deps,
    oldStoragePath,
    "remove-document-storage-cleanup",
  );

  const auditRes = await safeRecordAudit(deps, {
    actorUserId: actorCheck.userId,
    actorEmail: input.actor.email,
    action: "round_document.removed",
    entityType: "competition_document",
    entityId: documentId,
    beforeData: toSafeAuditSnapshot(existingDoc),
    afterData: toSafeAuditSnapshot(archiveRes.document),
    metadata: {
      eventId,
      roundId,
      storageObjectDeleted: removeRes.ok,
    },
  });

  const warnings: string[] = [];
  if (!removeRes.ok) {
    warnings.push(
      `Document metadata (ID: ${documentId}) was archived and is hidden from participants, but storage cleanup for "${oldStoragePath}" could not be confirmed. Do not retry document removal; an administrator should verify or remove the storage object manually.`,
    );
  }
  if (!auditRes.ok) {
    warnings.push("Recording the audit log failed.");
  }

  const warning = joinWarnings(warnings);
  return {
    ok: true,
    documentId,
    message: removeRes.ok
      ? `Removed PDF "${existingDoc.title}".`
      : `Archived PDF "${existingDoc.title}" (ID: ${documentId}); storage cleanup unconfirmed.`,
    ...(warning ? { warning } : {}),
  };
}

async function verifyUploadedPdfObject(
  deps: DirectUploadRoundDocumentOpsDeps,
  storageObjectPath: string,
  cleanupContext: string,
): Promise<{ ok: true; sizeBytes: number } | { ok: false; message: string }> {
  let inspection: UploadedStorageObjectInspection;
  try {
    inspection = await deps.inspectUploadedObject({
      objectPath: storageObjectPath,
    });
  } catch (err) {
    reportSecondaryError(
      deps,
      `${cleanupContext}-inspect`,
      err instanceof Error ? err.message : "Unknown object inspection exception",
    );
    return {
      ok: false,
      message: "Unable to verify the uploaded PDF in private storage.",
    };
  }

  if (!inspection.exists) {
    return {
      ok: false,
      message:
        "Uploaded PDF object was not found in private storage. Please upload the file again.",
    };
  }

  if (
    inspection.sizeBytes === null ||
    !Number.isInteger(inspection.sizeBytes) ||
    inspection.sizeBytes <= 0
  ) {
    const cleanupRes = await safeRemoveStorageObject(
      deps,
      storageObjectPath,
      cleanupContext,
    );
    return {
      ok: false,
      message: cleanupRes.ok
        ? "Uploaded PDF file is empty or has an invalid size."
        : `Uploaded PDF file is empty or has an invalid size, and cleanup failed; an orphaned file may remain at "${storageObjectPath}".`,
    };
  }

  if (inspection.sizeBytes > MAX_COMPETITION_DOCUMENT_BYTES) {
    const cleanupRes = await safeRemoveStorageObject(
      deps,
      storageObjectPath,
      cleanupContext,
    );
    return {
      ok: false,
      message: cleanupRes.ok
        ? "Uploaded PDF exceeds the maximum allowed size of 25 MB."
        : `Uploaded PDF exceeds the maximum allowed size of 25 MB, and cleanup failed; an orphaned file may remain at "${storageObjectPath}".`,
    };
  }

  const normalizedContentType = (inspection.contentType ?? "").trim().toLowerCase();
  if (normalizedContentType !== ALLOWED_COMPETITION_DOCUMENT_MIME) {
    const cleanupRes = await safeRemoveStorageObject(
      deps,
      storageObjectPath,
      cleanupContext,
    );
    return {
      ok: false,
      message: cleanupRes.ok
        ? "Uploaded object does not have a valid PDF content type (application/pdf)."
        : `Uploaded object does not have a valid PDF content type (application/pdf), and cleanup failed; an orphaned file may remain at "${storageObjectPath}".`,
    };
  }

  if (!inspection.headerBytes) {
    const cleanupRes = await safeRemoveStorageObject(
      deps,
      storageObjectPath,
      cleanupContext,
    );
    return {
      ok: false,
      message: cleanupRes.ok
        ? "Unable to verify uploaded PDF signature. Please upload the file again."
        : `Unable to verify uploaded PDF signature, and cleanup failed; an orphaned file may remain at "${storageObjectPath}".`,
    };
  }

  const headerCheck = validatePdfBufferHeader(inspection.headerBytes);
  if (!headerCheck.ok) {
    const cleanupRes = await safeRemoveStorageObject(
      deps,
      storageObjectPath,
      cleanupContext,
    );
    return {
      ok: false,
      message: cleanupRes.ok
        ? headerCheck.error
        : `${headerCheck.error} Storage cleanup also failed; an orphaned file may remain at "${storageObjectPath}".`,
    };
  }

  return { ok: true, sizeBytes: inspection.sizeBytes };
}

export async function createRoundDocumentUploadIntentWithDeps(
  input: {
    actor: DocumentActorContext;
    eventId: string;
    roundId: string;
    title: string;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
  },
  deps: DirectUploadRoundDocumentOpsDeps,
): Promise<SignedUploadIntentResult> {
  const actorCheck = assertSuperAdminActor(input.actor);
  if (!actorCheck.ok) return { ok: false, message: actorCheck.message };

  const eventCheck = validateUuid(input.eventId, "Event");
  if (!eventCheck.ok) return { ok: false, message: eventCheck.error };

  const roundCheck = validateUuid(input.roundId, "Round");
  if (!roundCheck.ok) return { ok: false, message: roundCheck.error };

  const eventId = eventCheck.value.toLowerCase();
  const roundId = roundCheck.value.toLowerCase();

  const metadataCheck = validatePdfUploadMetadataInput({
    title: input.title,
    fileName: input.fileName,
    mimeType: input.mimeType,
    fileSizeBytes: input.fileSizeBytes,
  });
  if (!metadataCheck.ok) {
    return { ok: false, message: metadataCheck.error };
  }

  const roundRes = await deps.findRoundForEvent(eventId, roundId);
  if (roundRes.error) {
    return {
      ok: false,
      message: "Unable to verify target round before issuing upload permission.",
    };
  }
  if (!roundRes.round) {
    return {
      ok: false,
      message: "Target round was not found for this event.",
    };
  }

  const objectUuid = deps.generateUuid().trim().toLowerCase();
  const pathCheck = buildCompetitionDocumentStoragePath(
    eventId,
    roundId,
    objectUuid,
  );
  if (!pathCheck.ok) {
    return { ok: false, message: pathCheck.error };
  }
  const storageObjectPath = pathCheck.value;

  const signedRes = await deps.createSignedUpload({
    objectPath: storageObjectPath,
  });
  if (!signedRes.ok || !signedRes.token || !signedRes.path) {
    if (signedRes.error) {
      reportSecondaryError(deps, "create-signed-upload-intent", signedRes.error);
    }
    return {
      ok: false,
      message:
        "Unable to issue a signed upload token for private storage. Please try again.",
    };
  }

  if (
    !isSafeCompetitionDocumentStoragePath(signedRes.path, eventId, roundId) ||
    signedRes.path !== storageObjectPath
  ) {
    return {
      ok: false,
      message: "Signed upload path validation failed.",
    };
  }

  return {
    ok: true,
    message: "Upload permission granted.",
    storageObjectPath: signedRes.path,
    token: signedRes.token,
  };
}

export async function createRoundDocumentReplaceIntentWithDeps(
  input: {
    actor: DocumentActorContext;
    eventId: string;
    roundId: string;
    documentId: string;
    title: string;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
  },
  deps: DirectUploadRoundDocumentOpsDeps,
): Promise<SignedUploadIntentResult> {
  const actorCheck = assertSuperAdminActor(input.actor);
  if (!actorCheck.ok) return { ok: false, message: actorCheck.message };

  const eventCheck = validateUuid(input.eventId, "Event");
  if (!eventCheck.ok) return { ok: false, message: eventCheck.error };

  const roundCheck = validateUuid(input.roundId, "Round");
  if (!roundCheck.ok) return { ok: false, message: roundCheck.error };

  const docCheck = validateUuid(input.documentId, "Document");
  if (!docCheck.ok) return { ok: false, message: docCheck.error };

  const eventId = eventCheck.value.toLowerCase();
  const roundId = roundCheck.value.toLowerCase();
  const documentId = docCheck.value.toLowerCase();

  const metadataCheck = validatePdfUploadMetadataInput({
    title: input.title,
    fileName: input.fileName,
    mimeType: input.mimeType,
    fileSizeBytes: input.fileSizeBytes,
  });
  if (!metadataCheck.ok) {
    return { ok: false, message: metadataCheck.error };
  }

  const existingRes = await deps.findActiveDocument(
    eventId,
    roundId,
    documentId,
  );
  if (existingRes.error) {
    return {
      ok: false,
      message: "Unable to verify existing document before replacement.",
    };
  }
  const existingDoc = existingRes.document;
  if (
    !existingDoc ||
    existingDoc.status !== "active" ||
    !isSafeCompetitionDocumentStoragePath(
      existingDoc.storage_object_path,
      eventId,
      roundId,
    )
  ) {
    return {
      ok: false,
      message: "Active round document was not found.",
    };
  }

  const newObjectUuid = deps.generateUuid().trim().toLowerCase();
  const pathCheck = buildCompetitionDocumentStoragePath(
    eventId,
    roundId,
    newObjectUuid,
  );
  if (!pathCheck.ok) {
    return { ok: false, message: pathCheck.error };
  }
  const newStoragePath = pathCheck.value;
  if (newStoragePath === existingDoc.storage_object_path) {
    return {
      ok: false,
      message: "Unable to allocate a distinct replacement storage path.",
    };
  }

  const signedRes = await deps.createSignedUpload({
    objectPath: newStoragePath,
  });
  if (!signedRes.ok || !signedRes.token || !signedRes.path) {
    if (signedRes.error) {
      reportSecondaryError(deps, "create-signed-replace-intent", signedRes.error);
    }
    return {
      ok: false,
      message:
        "Unable to issue a signed upload token for the replacement PDF. The existing PDF remains unchanged.",
    };
  }

  if (
    !isSafeCompetitionDocumentStoragePath(signedRes.path, eventId, roundId) ||
    signedRes.path !== newStoragePath
  ) {
    return {
      ok: false,
      message: "Signed replacement upload path validation failed.",
    };
  }

  return {
    ok: true,
    message: "Replacement upload permission granted.",
    storageObjectPath: signedRes.path,
    token: signedRes.token,
  };
}

export async function finalizeRoundDocumentUploadWithDeps(
  input: {
    actor: DocumentActorContext;
    eventId: string;
    roundId: string;
    title: string;
    originalFilename: string;
    storageObjectPath: string;
  },
  deps: DirectUploadRoundDocumentOpsDeps,
): Promise<DocumentOperationResult> {
  const actorCheck = assertSuperAdminActor(input.actor);
  if (!actorCheck.ok) return { ok: false, message: actorCheck.message };

  const eventCheck = validateUuid(input.eventId, "Event");
  if (!eventCheck.ok) return { ok: false, message: eventCheck.error };

  const roundCheck = validateUuid(input.roundId, "Round");
  if (!roundCheck.ok) return { ok: false, message: roundCheck.error };

  const titleCheck = validateDocumentTitle(input.title);
  if (!titleCheck.ok) return { ok: false, message: titleCheck.error };

  const filenameCheck = validateSafePdfFilename(input.originalFilename);
  if (!filenameCheck.ok) return { ok: false, message: filenameCheck.error };

  const eventId = eventCheck.value.toLowerCase();
  const roundId = roundCheck.value.toLowerCase();
  const storageObjectPath = input.storageObjectPath;

  if (
    !isSafeCompetitionDocumentStoragePath(storageObjectPath, eventId, roundId)
  ) {
    return {
      ok: false,
      message: "Storage object path is invalid for the selected event and round.",
    };
  }

  const roundRes = await deps.findRoundForEvent(eventId, roundId);
  if (roundRes.error) {
    return {
      ok: false,
      message: "Unable to verify target round before finalising upload.",
    };
  }
  if (!roundRes.round) {
    return {
      ok: false,
      message: "Target round was not found for this event.",
    };
  }

  const registeredCheck = await deps.isStoragePathRegistered(storageObjectPath);
  if (registeredCheck.error) {
    return {
      ok: false,
      message: "Unable to verify storage object registration state.",
    };
  }
  if (registeredCheck.exists) {
    return {
      ok: false,
      message: "This uploaded PDF has already been registered to a document.",
    };
  }

  const verifiedObject = await verifyUploadedPdfObject(
    deps,
    storageObjectPath,
    "direct-upload-verify-cleanup",
  );
  if (!verifiedObject.ok) {
    return { ok: false, message: verifiedObject.message };
  }

  const docUuid = deps.generateUuid().trim().toLowerCase();
  const docIdCheck = validateUuid(docUuid, "Document");
  if (!docIdCheck.ok) {
    const cleanupRes = await safeRemoveStorageObject(
      deps,
      storageObjectPath,
      "direct-upload-docid-rollback-cleanup",
    );
    return {
      ok: false,
      message: cleanupRes.ok
        ? "Unable to allocate document identifier."
        : `Unable to allocate document identifier, and storage cleanup failed; an orphaned file may remain at "${storageObjectPath}".`,
    };
  }

  const insertRes = await deps.insertDocumentMetadata({
    id: docIdCheck.value.toLowerCase(),
    eventId,
    roundId,
    title: titleCheck.value,
    originalFilename: filenameCheck.value,
    storageBucket: COMPETITION_DOCUMENTS_BUCKET,
    storageObjectPath,
    mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
    fileSizeBytes: verifiedObject.sizeBytes,
    actorUserId: actorCheck.userId,
  });

  if (insertRes.error || !insertRes.document) {
    if (insertRes.isConflict) {
      return {
        ok: false,
        message: "This uploaded PDF has already been registered to a document.",
      };
    }

    const cleanupRes = await safeRemoveStorageObject(
      deps,
      storageObjectPath,
      "direct-upload-insert-rollback-cleanup",
    );
    return {
      ok: false,
      message: cleanupRes.ok
        ? "Unable to save document metadata after upload. No document was attached."
        : `Unable to save document metadata after upload, and storage cleanup failed. An orphaned object may remain in storage at "${storageObjectPath}".`,
    };
  }

  const auditRes = await safeRecordAudit(deps, {
    actorUserId: actorCheck.userId,
    actorEmail: input.actor.email,
    action: "round_document.uploaded",
    entityType: "competition_document",
    entityId: insertRes.document.id,
    afterData: toSafeAuditSnapshot(insertRes.document),
    metadata: {
      eventId,
      roundId,
      roundNumber: roundRes.round.round_number,
      uploadMode: "direct_signed_url",
    },
  });

  return {
    ok: true,
    documentId: insertRes.document.id,
    message: `Uploaded PDF "${insertRes.document.title}".`,
    ...(auditRes.ok
      ? {}
      : {
          warning:
            "The PDF was uploaded and saved, but recording the audit log failed. Do not re-upload.",
        }),
  };
}

export async function finalizeRoundDocumentReplacementWithDeps(
  input: {
    actor: DocumentActorContext;
    eventId: string;
    roundId: string;
    documentId: string;
    title: string;
    originalFilename: string;
    newStorageObjectPath: string;
  },
  deps: DirectUploadRoundDocumentOpsDeps,
): Promise<DocumentOperationResult> {
  const actorCheck = assertSuperAdminActor(input.actor);
  if (!actorCheck.ok) return { ok: false, message: actorCheck.message };

  const eventCheck = validateUuid(input.eventId, "Event");
  if (!eventCheck.ok) return { ok: false, message: eventCheck.error };

  const roundCheck = validateUuid(input.roundId, "Round");
  if (!roundCheck.ok) return { ok: false, message: roundCheck.error };

  const docCheck = validateUuid(input.documentId, "Document");
  if (!docCheck.ok) return { ok: false, message: docCheck.error };

  const titleCheck = validateDocumentTitle(input.title);
  if (!titleCheck.ok) return { ok: false, message: titleCheck.error };

  const filenameCheck = validateSafePdfFilename(input.originalFilename);
  if (!filenameCheck.ok) return { ok: false, message: filenameCheck.error };

  const eventId = eventCheck.value.toLowerCase();
  const roundId = roundCheck.value.toLowerCase();
  const documentId = docCheck.value.toLowerCase();
  const newStoragePath = input.newStorageObjectPath;

  if (
    !isSafeCompetitionDocumentStoragePath(newStoragePath, eventId, roundId)
  ) {
    return {
      ok: false,
      message:
        "Replacement storage object path is invalid for the selected event and round.",
    };
  }

  const existingRes = await deps.findActiveDocument(
    eventId,
    roundId,
    documentId,
  );
  if (existingRes.error) {
    return {
      ok: false,
      message: "Unable to verify existing document before finalising replacement.",
    };
  }
  const existingDoc = existingRes.document;
  if (
    !existingDoc ||
    existingDoc.status !== "active" ||
    !isSafeCompetitionDocumentStoragePath(
      existingDoc.storage_object_path,
      eventId,
      roundId,
    )
  ) {
    return {
      ok: false,
      message: "Active round document was not found.",
    };
  }
  const oldStoragePath = existingDoc.storage_object_path!;

  if (newStoragePath === oldStoragePath) {
    return {
      ok: false,
      documentId,
      message: "Replacement PDF must use a new storage object path.",
    };
  }

  const registeredCheck = await deps.isStoragePathRegistered(newStoragePath);
  if (registeredCheck.error) {
    return {
      ok: false,
      documentId,
      message: "Unable to verify replacement storage object registration state.",
    };
  }
  if (registeredCheck.exists) {
    return {
      ok: false,
      documentId,
      message: "This replacement PDF path is already attached to a document.",
    };
  }

  const verifiedObject = await verifyUploadedPdfObject(
    deps,
    newStoragePath,
    "direct-replace-verify-cleanup",
  );
  if (!verifiedObject.ok) {
    return {
      ok: false,
      documentId,
      message: `${verifiedObject.message} The previous PDF remains active and unchanged.`,
    };
  }

  // Step 2: Update database metadata to point to the verified new storage object.
  const replaceDbRes = await deps.replaceDocumentMetadata({
    eventId,
    roundId,
    documentId,
    expectedOldStoragePath: oldStoragePath,
    title: titleCheck.value,
    originalFilename: filenameCheck.value,
    newStorageObjectPath: newStoragePath,
    mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
    fileSizeBytes: verifiedObject.sizeBytes,
    actorUserId: actorCheck.userId,
  });

  if (replaceDbRes.error || !replaceDbRes.document) {
    if (replaceDbRes.isConflict) {
      return {
        ok: false,
        documentId,
        message:
          "This replacement PDF path is already in use. The previous PDF remains active and unchanged.",
      };
    }

    // Metadata update failed: NEVER delete oldStoragePath; clean up orphan newStoragePath instead.
    const cleanupRes = await safeRemoveStorageObject(
      deps,
      newStoragePath,
      "direct-replace-db-rollback-cleanup",
    );
    return {
      ok: false,
      documentId,
      message: cleanupRes.ok
        ? "Unable to update document metadata for the replacement PDF. The previous PDF remains active and unchanged."
        : `Unable to update document metadata for the replacement PDF. The previous PDF remains active and unchanged, but cleanup of the newly uploaded storage object failed and an orphaned file may remain at "${newStoragePath}" (document ${documentId}).`,
    };
  }

  // Step 3: Only after DB metadata points to the new file, remove the superseded storage object.
  const removeOldRes = await safeRemoveStorageObject(
    deps,
    oldStoragePath,
    "direct-replace-old-object-cleanup",
  );

  const auditRes = await safeRecordAudit(deps, {
    actorUserId: actorCheck.userId,
    actorEmail: input.actor.email,
    action: "round_document.replaced",
    entityType: "competition_document",
    entityId: documentId,
    beforeData: toSafeAuditSnapshot(existingDoc),
    afterData: toSafeAuditSnapshot(replaceDbRes.document),
    metadata: {
      eventId,
      roundId,
      previousObjectRemoved: removeOldRes.ok,
      uploadMode: "direct_signed_url",
    },
  });

  const warnings: string[] = [];
  if (!removeOldRes.ok) {
    warnings.push(
      `Removing the previous storage object "${oldStoragePath}" for document ${documentId} could not be confirmed; an administrator should verify or remove the old file manually without retrying replacement.`,
    );
  }
  if (!auditRes.ok) {
    warnings.push("Recording the audit log failed.");
  }

  const warning = joinWarnings(warnings);
  return {
    ok: true,
    documentId,
    message: `Replaced PDF "${replaceDbRes.document.title}".`,
    ...(warning ? { warning } : {}),
  };
}
