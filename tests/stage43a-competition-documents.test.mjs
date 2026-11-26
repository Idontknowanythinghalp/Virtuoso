import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  ALLOWED_COMPETITION_DOCUMENT_MIME,
  COMPETITION_DOCUMENTS_BUCKET,
  MAX_COMPETITION_DOCUMENT_BYTES,
  buildCompetitionDocumentStoragePath,
  isSafeCompetitionDocumentStoragePath,
  validateDocumentTitle,
  validatePdfUploadInput,
  validateSafePdfFilename,
} from "../src/lib/documents/validation.ts";
import {
  removeRoundDocumentWithDeps,
  replaceRoundDocumentWithDeps,
  updateRoundDocumentTitleWithDeps,
  uploadRoundDocumentWithDeps,
} from "../src/lib/documents/operations.ts";

const ROOT_DIR = process.cwd();

const SUPER_ADMIN_ACTOR = {
  userId: "aaaa1111-1111-4111-8111-111111111111",
  email: "admin@virtuoso.edu",
  role: "super_admin",
  isActive: true,
};

const COORDINATOR_ACTOR = {
  userId: "bbbb1111-1111-4111-8111-111111111111",
  email: "coordinator@virtuoso.edu",
  role: "event_coordinator",
  isActive: true,
};

const INACTIVE_SUPER_ADMIN = {
  ...SUPER_ADMIN_ACTOR,
  isActive: false,
};

const EVENT_ID = "eeee1111-1111-4111-8111-111111111111";
const ROUND_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ROUND_ID = "33333333-3333-4333-8333-333333333333";

function makePdfBytes(content = "Sample PDF body") {
  return new TextEncoder().encode(`%PDF-1.7\n${content}\n%%EOF`);
}

function createInMemoryHarness() {
  let seq = 1;
  const storageObjects = new Map();
  const documents = new Map();
  const audits = [];
  const rounds = new Map([
    [
      `${EVENT_ID}:${ROUND_ID}`,
      { id: ROUND_ID, event_id: EVENT_ID, round_number: 1, name: "Round 1" },
    ],
  ]);

  const deps = {
    generateUuid() {
      const hex = String(seq++).padStart(12, "0");
      return `99999999-9999-4999-8999-${hex}`;
    },
    nowIso() {
      return "2026-11-26T12:00:00.000Z";
    },
    async findRoundForEvent(eventId, roundId) {
      return {
        round: rounds.get(`${eventId}:${roundId}`) ?? null,
        error: null,
      };
    },
    async findActiveDocument(eventId, roundId, documentId) {
      const row = documents.get(documentId);
      if (
        !row ||
        row.event_id !== eventId ||
        row.round_id !== roundId ||
        row.status !== "active"
      ) {
        return { document: null, error: null };
      }
      return { document: { ...row }, error: null };
    },
    async uploadStorageObject({ objectPath, fileBytes }) {
      storageObjects.set(objectPath, fileBytes);
      return { ok: true };
    },
    async removeStorageObject({ objectPath }) {
      storageObjects.delete(objectPath);
      return { ok: true };
    },
    async insertDocumentMetadata(params) {
      const now = "2026-11-26T12:00:00.000Z";
      const record = {
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
        archived_by: null,
        archived_at: null,
        created_at: now,
        updated_at: now,
      };
      documents.set(record.id, record);
      return { document: { ...record }, error: null };
    },
    async updateDocumentTitle(params) {
      const existing = documents.get(params.documentId);
      if (!existing) return { document: null, error: "Not found" };
      const updated = {
        ...existing,
        title: params.title,
        updated_by: params.actorUserId,
        updated_at: "2026-11-26T12:05:00.000Z",
      };
      documents.set(updated.id, updated);
      return { document: { ...updated }, error: null };
    },
    async replaceDocumentMetadata(params) {
      const existing = documents.get(params.documentId);
      if (
        !existing ||
        existing.storage_object_path !== params.expectedOldStoragePath
      ) {
        return { document: null, error: "Version mismatch" };
      }
      const updated = {
        ...existing,
        title: params.title,
        original_filename: params.originalFilename,
        storage_object_path: params.newStorageObjectPath,
        mime_type: params.mimeType,
        file_size_bytes: params.fileSizeBytes,
        updated_by: params.actorUserId,
        updated_at: "2026-11-26T12:10:00.000Z",
      };
      documents.set(updated.id, updated);
      return { document: { ...updated }, error: null };
    },
    async archiveDocumentMetadata(params) {
      const existing = documents.get(params.documentId);
      if (
        !existing ||
        existing.storage_object_path !== params.expectedStoragePath
      ) {
        return { document: null, error: "Not found" };
      }
      const archived = {
        ...existing,
        status: "archived",
        storage_object_path: null,
        archived_at: params.archivedAtIso,
        archived_by: params.actorUserId,
        updated_by: params.actorUserId,
      };
      documents.set(archived.id, archived);
      return { document: { ...archived }, error: null };
    },
    async recordAudit(entry) {
      audits.push(entry);
      return { ok: true };
    },
  };

  return { deps, storageObjects, documents, audits };
}

test("Stage 4.3A (1) [Mocked Unit Test]: Supports multiple PDFs per round with unpredictable storage paths and clean event/round association", async () => {
  const { deps, storageObjects, documents, audits } = createInMemoryHarness();

  const first = await uploadRoundDocumentWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "Round 1 Case Brief",
      fileName: "round1-brief.pdf",
      mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
      fileBytes: makePdfBytes("Brief A"),
    },
    deps,
  );
  const second = await uploadRoundDocumentWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "Financial Exhibits Appendix",
      fileName: "exhibits.pdf",
      mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
      fileBytes: makePdfBytes("Brief B"),
    },
    deps,
  );

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.notEqual(first.documentId, second.documentId);
  assert.equal(documents.size, 2);
  assert.equal(storageObjects.size, 2);
  assert.equal(audits.length, 2);

  for (const doc of documents.values()) {
    assert.equal(doc.event_id, EVENT_ID);
    assert.equal(doc.round_id, ROUND_ID);
    assert.equal(doc.storage_bucket, COMPETITION_DOCUMENTS_BUCKET);
    assert.equal(
      isSafeCompetitionDocumentStoragePath(
        doc.storage_object_path,
        EVENT_ID,
        ROUND_ID,
      ),
      true,
    );
    // Storage path must NOT contain original filename
    assert.equal(doc.storage_object_path.includes(doc.original_filename), false);
  }

  // Mismatched event/round relationship must be rejected before any storage write
  const wrongRound = await uploadRoundDocumentWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: OTHER_ROUND_ID,
      title: "Wrong Round Brief",
      fileName: "wrong.pdf",
      mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
      fileBytes: makePdfBytes(),
    },
    deps,
  );
  assert.equal(wrongRound.ok, false);
  assert.equal(storageObjects.size, 2);
});

test("Stage 4.3A (2) [Mocked Unit Test]: Enforces Super Admin-only authorization and rejects coordinators or inactive admins", async () => {
  const { deps, storageObjects, documents } = createInMemoryHarness();

  const coordAttempt = await uploadRoundDocumentWithDeps(
    {
      actor: COORDINATOR_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "Coordinator Upload",
      fileName: "brief.pdf",
      mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
      fileBytes: makePdfBytes(),
    },
    deps,
  );
  assert.equal(coordAttempt.ok, false);
  assert.match(coordAttempt.message, /Super Admin/i);

  const inactiveAttempt = await uploadRoundDocumentWithDeps(
    {
      actor: INACTIVE_SUPER_ADMIN,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "Inactive Upload",
      fileName: "brief.pdf",
      mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
      fileBytes: makePdfBytes(),
    },
    deps,
  );
  assert.equal(inactiveAttempt.ok, false);
  assert.equal(storageObjects.size, 0);
  assert.equal(documents.size, 0);

  // Seed one valid doc as Super Admin, then reject coordinator rename/replace/remove
  const validUpload = await uploadRoundDocumentWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "Official Brief",
      fileName: "brief.pdf",
      mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
      fileBytes: makePdfBytes(),
    },
    deps,
  );
  assert.equal(validUpload.ok, true);

  const coordRename = await updateRoundDocumentTitleWithDeps(
    {
      actor: COORDINATOR_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      documentId: validUpload.documentId,
      title: "Hijacked Title",
    },
    deps,
  );
  assert.equal(coordRename.ok, false);

  const coordReplace = await replaceRoundDocumentWithDeps(
    {
      actor: COORDINATOR_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      documentId: validUpload.documentId,
      title: "Hijacked",
      fileName: "hijack.pdf",
      mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
      fileBytes: makePdfBytes(),
    },
    deps,
  );
  assert.equal(coordReplace.ok, false);

  const coordRemove = await removeRoundDocumentWithDeps(
    {
      actor: COORDINATOR_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      documentId: validUpload.documentId,
    },
    deps,
  );
  assert.equal(coordRemove.ok, false);
  assert.equal(documents.get(validUpload.documentId).status, "active");
});

test("Stage 4.3A (3) [Mocked Unit Test]: Validates PDF MIME type, %PDF- signature, 25 MB limit, title, and rejects unsafe filenames/paths", () => {
  // MIME rejection
  assert.equal(
    validatePdfUploadInput({
      title: "Valid Title",
      fileName: "brief.pdf",
      mimeType: "text/html",
      fileSizeBytes: 1024,
      headerBytes: makePdfBytes(),
    }).ok,
    false,
  );

  // Spoofed MIME with non-PDF bytes rejected
  assert.equal(
    validatePdfUploadInput({
      title: "Valid Title",
      fileName: "brief.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 128,
      headerBytes: new TextEncoder().encode("<html><script>alert(1)</script></html>"),
    }).ok,
    false,
  );

  // Empty & oversized files rejected; exact 25 MB accepted
  assert.equal(
    validatePdfUploadInput({
      title: "Valid Title",
      fileName: "brief.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 0,
      headerBytes: makePdfBytes(),
    }).ok,
    false,
  );
  assert.equal(
    validatePdfUploadInput({
      title: "Valid Title",
      fileName: "brief.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: MAX_COMPETITION_DOCUMENT_BYTES + 1,
      headerBytes: makePdfBytes(),
    }).ok,
    false,
  );
  assert.equal(
    validatePdfUploadInput({
      title: "Exact Limit Brief",
      fileName: "brief.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: MAX_COMPETITION_DOCUMENT_BYTES,
      headerBytes: makePdfBytes(),
    }).ok,
    true,
  );

  // Unsafe filenames & traversal paths rejected
  for (const badName of [
    "../secret.pdf",
    "dir/brief.pdf",
    "dir\\brief.pdf",
    ".hidden.pdf",
    "brief.exe",
    "brief.pdf\u0000.png",
    ".pdf",
    "",
  ]) {
    assert.equal(
      validateSafePdfFilename(badName).ok,
      false,
      `Expected unsafe filename "${badName}" to fail`,
    );
  }

  assert.equal(validateDocumentTitle("A").ok, false);
  assert.equal(validateDocumentTitle("Bad\u0000Title").ok, false);
  assert.deepEqual(validateDocumentTitle("  Case   Brief  "), {
    ok: true,
    value: "Case Brief",
  });

  const built = buildCompetitionDocumentStoragePath(
    EVENT_ID,
    ROUND_ID,
    "44444444-4444-4444-8444-444444444444",
  );
  assert.equal(built.ok, true);
  assert.equal(
    isSafeCompetitionDocumentStoragePath(
      "../escape.pdf",
      EVENT_ID,
      ROUND_ID,
    ),
    false,
  );
  assert.equal(
    isSafeCompetitionDocumentStoragePath(
      `${EVENT_ID}/${OTHER_ROUND_ID}/44444444-4444-4444-8444-444444444444.pdf`,
      EVENT_ID,
      ROUND_ID,
    ),
    false,
  );
});

test("Stage 4.3A (4) [Mocked Unit Test]: Handles upload failure and DB metadata insertion failure with compensating storage cleanup", async () => {
  const { deps, storageObjects, documents } = createInMemoryHarness();

  // Storage upload fails -> no DB metadata inserted
  const uploadFails = await uploadRoundDocumentWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "Case Study",
      fileName: "case.pdf",
      mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
      fileBytes: makePdfBytes(),
    },
    {
      ...deps,
      async uploadStorageObject() {
        return { ok: false, error: "storage unavailable" };
      },
    },
  );
  assert.equal(uploadFails.ok, false);
  assert.equal(documents.size, 0);
  assert.equal(storageObjects.size, 0);

  // Metadata insert fails -> uploaded storage object is deleted cleanly
  const insertFails = await uploadRoundDocumentWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "Case Study",
      fileName: "case.pdf",
      mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
      fileBytes: makePdfBytes(),
    },
    {
      ...deps,
      async insertDocumentMetadata() {
        return { document: null, error: "db constraint violation" };
      },
    },
  );
  assert.equal(insertFails.ok, false);
  assert.equal(documents.size, 0);
  assert.equal(
    storageObjects.size,
    0,
    "Orphan storage object must be removed when DB insert fails",
  );
});

test("Stage 4.3A (5) [Mocked Unit Test]: Enforces safe replacement ordering (upload new -> update DB -> delete old) and preserves old file on failure", async () => {
  const { deps, storageObjects, documents } = createInMemoryHarness();

  const initial = await uploadRoundDocumentWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "Initial Brief",
      fileName: "v1.pdf",
      mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
      fileBytes: makePdfBytes("Version 1"),
    },
    deps,
  );
  assert.equal(initial.ok, true);
  const docId = initial.documentId;
  const originalPath = documents.get(docId).storage_object_path;

  // Case A: Replacement upload fails -> original metadata and storage object stay intact
  const replaceUploadFail = await replaceRoundDocumentWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      documentId: docId,
      title: "Updated Brief",
      fileName: "v2.pdf",
      mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
      fileBytes: makePdfBytes("Version 2"),
    },
    {
      ...deps,
      async uploadStorageObject() {
        return { ok: false, error: "upload network error" };
      },
    },
  );
  assert.equal(replaceUploadFail.ok, false);
  assert.equal(documents.get(docId).storage_object_path, originalPath);
  assert.equal(storageObjects.has(originalPath), true);

  // Case B: Metadata update fails -> DO NOT delete old file, and clean up newly uploaded orphan
  const replaceDbFail = await replaceRoundDocumentWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      documentId: docId,
      title: "Updated Brief",
      fileName: "v2.pdf",
      mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
      fileBytes: makePdfBytes("Version 2"),
    },
    {
      ...deps,
      async replaceDocumentMetadata() {
        return { document: null, error: "update failed" };
      },
    },
  );
  assert.equal(replaceDbFail.ok, false);
  assert.equal(documents.get(docId).storage_object_path, originalPath);
  assert.equal(storageObjects.has(originalPath), true);
  assert.equal(
    storageObjects.size,
    1,
    "Old file must remain and orphan replacement upload must be removed",
  );

  // Case B2: Metadata update fails AND orphan cleanup fails -> preserve old file and explicitly report orphaned object
  const replaceDbAndCleanupFail = await replaceRoundDocumentWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      documentId: docId,
      title: "Updated Brief",
      fileName: "v2.pdf",
      mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
      fileBytes: makePdfBytes("Version 2"),
    },
    {
      ...deps,
      async replaceDocumentMetadata() {
        return { document: null, error: "update failed" };
      },
      async removeStorageObject() {
        return { ok: false, error: "cleanup delete error" };
      },
    },
  );
  assert.equal(replaceDbAndCleanupFail.ok, false);
  assert.equal(documents.get(docId).storage_object_path, originalPath);
  assert.equal(storageObjects.has(originalPath), true);
  assert.match(replaceDbAndCleanupFail.message, /previous PDF remains active/i);
  assert.match(replaceDbAndCleanupFail.message, /orphaned file may remain/i);
  assert.match(replaceDbAndCleanupFail.message, new RegExp(docId));
  // Clean up orphan from test harness map before proceeding
  for (const key of Array.from(storageObjects.keys())) {
    if (key !== originalPath) storageObjects.delete(key);
  }

  // Case C: Old object deletion fails after DB update -> still ok: true with warning (never fail committed replacement)
  const replaceCleanupFail = await replaceRoundDocumentWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      documentId: docId,
      title: "Updated Brief",
      fileName: "v2.pdf",
      mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
      fileBytes: makePdfBytes("Version 2"),
    },
    {
      ...deps,
      async removeStorageObject() {
        return { ok: false, error: "cleanup timeout" };
      },
    },
  );
  assert.equal(replaceCleanupFail.ok, true);
  assert.ok(replaceCleanupFail.warning);
  assert.match(replaceCleanupFail.warning, new RegExp(originalPath));
  assert.match(replaceCleanupFail.warning, /without retrying replacement/i);
  const afterPartialPath = documents.get(docId).storage_object_path;
  assert.notEqual(afterPartialPath, originalPath);

  // Case D: Clean replacement succeeds and removes the superseded file
  const cleanReplace = await replaceRoundDocumentWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      documentId: docId,
      title: "Final Brief",
      fileName: "v3.pdf",
      mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
      fileBytes: makePdfBytes("Version 3"),
    },
    deps,
  );
  assert.equal(cleanReplace.ok, true);
  assert.equal(cleanReplace.warning, undefined);
  const finalPath = documents.get(docId).storage_object_path;
  assert.equal(documents.get(docId).title, "Final Brief");
  assert.equal(documents.get(docId).original_filename, "v3.pdf");
  assert.equal(storageObjects.has(afterPartialPath), false);
  assert.equal(storageObjects.has(finalPath), true);
});

test("Stage 4.3A (6) [Mocked Unit Test]: Enforces safe auditable removal (archive DB + clear path + remove storage; never restores active if storage delete is ambiguous)", async () => {
  const { deps, storageObjects, documents, audits } = createInMemoryHarness();

  const firstUpload = await uploadRoundDocumentWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "Ambiguous Delete Brief",
      fileName: "ambiguous.pdf",
      mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
      fileBytes: makePdfBytes("Ambiguous"),
    },
    deps,
  );
  const firstDocId = firstUpload.documentId;
  const firstObjectPath = documents.get(firstDocId).storage_object_path;

  // Storage deletion reports failure -> MUST remain archived (never restored to active) and return ok: true with warning
  const storageRemoveFail = await removeRoundDocumentWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      documentId: firstDocId,
    },
    {
      ...deps,
      async removeStorageObject() {
        return { ok: false, error: "network timeout after delete" };
      },
    },
  );
  assert.equal(storageRemoveFail.ok, true);
  assert.equal(storageRemoveFail.documentId, firstDocId);
  assert.ok(storageRemoveFail.warning);
  assert.match(storageRemoveFail.warning, new RegExp(firstDocId));
  assert.match(storageRemoveFail.warning, new RegExp(firstObjectPath));
  assert.match(storageRemoveFail.warning, /Do not retry document removal/i);
  assert.equal(documents.get(firstDocId).status, "archived");
  assert.equal(documents.get(firstDocId).storage_object_path, null);
  assert.ok(documents.get(firstDocId).archived_at);
  assert.equal(
    audits[audits.length - 1].metadata.storageObjectDeleted,
    false,
  );

  // Clean removal -> DB archived with storage_object_path cleared, storage deleted, audit preserved
  const secondUpload = await uploadRoundDocumentWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "Removable Brief",
      fileName: "remove-me.pdf",
      mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
      fileBytes: makePdfBytes("Removable"),
    },
    deps,
  );
  const docId = secondUpload.documentId;
  const objectPath = documents.get(docId).storage_object_path;

  const cleanRemove = await removeRoundDocumentWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      documentId: docId,
    },
    deps,
  );
  assert.equal(cleanRemove.ok, true);
  assert.equal(cleanRemove.warning, undefined);
  const archivedRow = documents.get(docId);
  assert.equal(archivedRow.status, "archived");
  assert.equal(archivedRow.storage_object_path, null);
  assert.ok(archivedRow.archived_at);
  assert.equal(storageObjects.has(objectPath), false);

  const removalAudit = audits[audits.length - 1];
  assert.equal(removalAudit.action, "round_document.removed");
  assert.equal(removalAudit.beforeData.storage_object_path, objectPath);
  assert.equal(removalAudit.afterData.storage_object_path, null);
  assert.equal(removalAudit.metadata.storageObjectDeleted, true);
});

test("Stage 4.3A (7) [Mocked Unit Test]: Separates primary operation success from audit logging failures or exceptions across upload, rename, replace, and remove", async () => {
  const { deps, documents } = createInMemoryHarness();
  const loggedErrors = [];
  const failingAuditDeps = {
    ...deps,
    onError(context, detail) {
      loggedErrors.push({ context, detail });
    },
    async recordAudit() {
      throw new Error("audit table transient error");
    },
  };

  const uploadRes = await uploadRoundDocumentWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "Audit Fail Brief",
      fileName: "brief.pdf",
      mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
      fileBytes: makePdfBytes("One"),
    },
    failingAuditDeps,
  );
  assert.equal(uploadRes.ok, true);
  assert.ok(uploadRes.documentId);
  assert.ok(uploadRes.warning);
  assert.match(uploadRes.warning, /audit log failed/i);
  assert.equal(documents.get(uploadRes.documentId).status, "active");

  const renameRes = await updateRoundDocumentTitleWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      documentId: uploadRes.documentId,
      title: "Renamed Brief",
    },
    failingAuditDeps,
  );
  assert.equal(renameRes.ok, true);
  assert.ok(renameRes.warning);
  assert.match(renameRes.warning, /audit log failed/i);
  assert.equal(documents.get(uploadRes.documentId).title, "Renamed Brief");

  const replaceRes = await replaceRoundDocumentWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      documentId: uploadRes.documentId,
      title: "Replaced Brief",
      fileName: "brief-v2.pdf",
      mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
      fileBytes: makePdfBytes("Two"),
    },
    {
      ...failingAuditDeps,
      async recordAudit() {
        return { ok: false, error: "audit returned error" };
      },
    },
  );
  assert.equal(replaceRes.ok, true);
  assert.ok(replaceRes.warning);
  assert.match(replaceRes.warning, /audit log failed/i);
  assert.equal(documents.get(uploadRes.documentId).title, "Replaced Brief");

  const removeRes = await removeRoundDocumentWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      documentId: uploadRes.documentId,
    },
    failingAuditDeps,
  );
  assert.equal(removeRes.ok, true);
  assert.ok(removeRes.warning);
  assert.match(removeRes.warning, /audit log failed/i);
  assert.equal(documents.get(uploadRes.documentId).status, "archived");
  assert.equal(loggedErrors.length, 4);
});

test("Stage 4.3A (8) [Static Structural Check]: Migration enforces private Storage & Super Admin RLS, actions guard with SUPER_ADMIN_ONLY and safe revalidation, and client code avoids admin/public Storage exposure", () => {
  const migrationSql = fs.readFileSync(
    path.join(
      ROOT_DIR,
      "supabase/migrations/202611260011_stage43a_competition_documents.sql",
    ),
    "utf8",
  );
  const operationsSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/lib/documents/operations.ts"),
    "utf8",
  );
  const storageSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/lib/documents/storage.ts"),
    "utf8",
  );
  const readSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/lib/documents/read.ts"),
    "utf8",
  );
  const actionsSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/actions/documents.ts"),
    "utf8",
  );
  const panelSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/components/competition/RoundDocumentsPanel.tsx"),
    "utf8",
  );

  // Migration security invariants
  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS public\.competition_documents/);
  assert.match(migrationSql, /FOREIGN KEY \(round_id, event_id\)/);
  assert.match(migrationSql, /public\.is_active_super_admin\(\)/);
  assert.match(migrationSql, /VALUES \(\s*'competition-documents',\s*'competition-documents',\s*false,/);
  assert.match(migrationSql, /26214400/);
  assert.match(migrationSql, /ARRAY\['application\/pdf'\]/);
  assert.match(migrationSql, /AS RESTRICTIVE/);

  // Reliability invariants: no unsafe active restoration, safe revalidation wrapper, UI warning display
  assert.equal(operationsSource.includes("restoreDocumentActive"), false);
  assert.equal(actionsSource.includes("restoreDocumentActive"), false);
  assert.match(actionsSource, /function tryRevalidateRoundPath/);
  assert.match(panelSource, /actionFeedback\.warning/);
  assert.match(panelSource, /uploadState\.warning/);

  // Server-only storage & read boundaries; zero getPublicUrl or client-side admin exposure
  assert.match(storageSource, /^import "server-only";/m);
  assert.match(readSource, /^import "server-only";/m);
  assert.equal(storageSource.includes("getPublicUrl"), false);
  assert.equal(actionsSource.includes("getPublicUrl"), false);
  const readSelectMatch = readSource.match(/\.select\(([\s\S]*?)\)/);
  assert.ok(readSelectMatch);
  assert.equal(readSelectMatch[1].includes("storage_object_path"), false);
  assert.equal(readSelectMatch[1].includes("storage_bucket"), false);

  // Every server action enforces SUPER_ADMIN_ONLY
  const actionMatches = actionsSource.match(
    /requireActiveUserForAction\(SUPER_ADMIN_ONLY/g,
  );
  assert.equal(actionMatches?.length, 6);

  // Client panel does not reference admin client or service role or participant viewer controls
  assert.equal(panelSource.includes("createSupabaseAdminClient"), false);
  assert.equal(panelSource.includes("SUPABASE_SERVICE_ROLE_KEY"), false);
  assert.equal(panelSource.includes("getPublicUrl"), false);
});

test("Stage 4.3A (9) [Mocked Unit Test]: Throwing onError callback does not interrupt committed document operations or alter their success result", async () => {
  const { deps, documents } = createInMemoryHarness();
  let onErrorCalls = 0;

  const throwingLoggerDeps = {
    ...deps,
    onError() {
      onErrorCalls += 1;
      throw new Error("logger transport crashed");
    },
  };

  // Committed upload succeeds with warning even when audit fails AND onError throws
  const uploadRes = await uploadRoundDocumentWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "Resilient Logger Brief",
      fileName: "resilient.pdf",
      mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
      fileBytes: makePdfBytes("Resilient"),
    },
    {
      ...throwingLoggerDeps,
      async recordAudit() {
        return { ok: false, error: "audit unavailable" };
      },
    },
  );
  assert.equal(uploadRes.ok, true);
  assert.ok(uploadRes.documentId);
  assert.ok(uploadRes.warning);
  assert.match(uploadRes.warning, /audit log failed/i);
  assert.equal(documents.get(uploadRes.documentId).status, "active");
  assert.equal(onErrorCalls, 1);

  // Committed removal stays archived and succeeds with warning even when both storage delete and audit fail AND onError throws
  const removeRes = await removeRoundDocumentWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      documentId: uploadRes.documentId,
    },
    {
      ...throwingLoggerDeps,
      async removeStorageObject() {
        return { ok: false, error: "storage delete timeout" };
      },
      async recordAudit() {
        throw new Error("audit write timeout");
      },
    },
  );
  assert.equal(removeRes.ok, true);
  assert.equal(removeRes.documentId, uploadRes.documentId);
  assert.ok(removeRes.warning);
  assert.match(removeRes.warning, /storage cleanup/i);
  assert.match(removeRes.warning, /audit log failed/i);
  assert.equal(documents.get(uploadRes.documentId).status, "archived");
  assert.equal(documents.get(uploadRes.documentId).storage_object_path, null);
  assert.equal(onErrorCalls, 3);
});
