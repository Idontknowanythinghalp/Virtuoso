import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  ALLOWED_COMPETITION_DOCUMENT_MIME,
  COMPETITION_DOCUMENTS_BUCKET,
  MAX_COMPETITION_DOCUMENT_BYTES,
} from "../src/lib/documents/validation.ts";
import {
  createRoundDocumentReplaceIntentWithDeps,
  createRoundDocumentUploadIntentWithDeps,
  finalizeRoundDocumentReplacementWithDeps,
  finalizeRoundDocumentUploadWithDeps,
} from "../src/lib/documents/operations.ts";
import { runDirectPdfUploadFlowWithDeps } from "../src/lib/documents/client-upload.ts";

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

function makePdfBytes(content = "Direct upload PDF body") {
  return new TextEncoder().encode(`%PDF-1.7\n${content}\n%%EOF`);
}

function createDirectUploadHarness() {
  let seq = 1;
  const storageObjects = new Map();
  const signedTokens = new Map();
  const documents = new Map();
  const audits = [];
  const loggedErrors = [];
  const rounds = new Map([
    [
      `${EVENT_ID}:${ROUND_ID}`,
      { id: ROUND_ID, event_id: EVENT_ID, round_number: 1, name: "Round 1" },
    ],
  ]);

  const deps = {
    generateUuid() {
      const hex = String(seq++).padStart(12, "0");
      return `88888888-8888-4888-8888-${hex}`;
    },
    nowIso() {
      return "2026-11-26T14:00:00.000Z";
    },
    onError(context, detail) {
      loggedErrors.push({ context, detail });
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
    async isStoragePathRegistered(storageObjectPath) {
      for (const row of documents.values()) {
        if (row.storage_object_path === storageObjectPath) {
          return { exists: true, error: null };
        }
      }
      return { exists: false, error: null };
    },
    async createSignedUpload({ objectPath }) {
      const token = `signed-token-${seq}`;
      signedTokens.set(objectPath, token);
      return { ok: true, path: objectPath, token };
    },
    async inspectUploadedObject({ objectPath }) {
      const entry = storageObjects.get(objectPath);
      if (!entry) {
        return {
          exists: false,
          sizeBytes: null,
          contentType: null,
          headerBytes: null,
          error: null,
        };
      }
      return {
        exists: true,
        sizeBytes: entry.sizeBytes,
        contentType: entry.contentType,
        headerBytes: entry.bytes ? entry.bytes.slice(0, 16) : null,
        error: null,
      };
    },
    async uploadStorageObject() {
      return {
        ok: false,
        error: "Server-proxied file upload disabled.",
      };
    },
    async removeStorageObject({ objectPath }) {
      storageObjects.delete(objectPath);
      return { ok: true };
    },
    async insertDocumentMetadata(params) {
      for (const existing of documents.values()) {
        if (existing.storage_object_path === params.storageObjectPath) {
          return {
            document: null,
            error: "duplicate key value violates unique constraint",
            isConflict: true,
          };
        }
      }
      const now = "2026-11-26T14:00:00.000Z";
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
      if (!existing || existing.status !== "active") {
        return { document: null, error: "Not found" };
      }
      const updated = {
        ...existing,
        title: params.title,
        updated_by: params.actorUserId,
      };
      documents.set(params.documentId, updated);
      return { document: { ...updated }, error: null };
    },
    async replaceDocumentMetadata(params) {
      const existing = documents.get(params.documentId);
      if (
        !existing ||
        existing.event_id !== params.eventId ||
        existing.round_id !== params.roundId ||
        existing.status !== "active" ||
        existing.storage_object_path !== params.expectedOldStoragePath
      ) {
        return { document: null, error: "Concurrent modification" };
      }
      for (const row of documents.values()) {
        if (
          row.id !== params.documentId &&
          row.storage_object_path === params.newStorageObjectPath
        ) {
          return {
            document: null,
            error: "duplicate key value violates unique constraint",
            isConflict: true,
          };
        }
      }
      const updated = {
        ...existing,
        title: params.title,
        original_filename: params.originalFilename,
        storage_object_path: params.newStorageObjectPath,
        mime_type: params.mimeType,
        file_size_bytes: params.fileSizeBytes,
        updated_by: params.actorUserId,
      };
      documents.set(params.documentId, updated);
      return { document: { ...updated }, error: null };
    },
    async archiveDocumentMetadata(params) {
      const existing = documents.get(params.documentId);
      if (!existing || existing.status !== "active") {
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
      documents.set(params.documentId, archived);
      return { document: { ...archived }, error: null };
    },
    async recordAudit(entry) {
      audits.push(entry);
      return { ok: true };
    },
  };

  return {
    deps,
    storageObjects,
    signedTokens,
    documents,
    audits,
    loggedErrors,
  };
}

test("Stage 4.3B (1) [Mocked Unit Test]: Upload & replace intents enforce Super Admin, round relationship, and metadata limits before issuing a signed upload token", async () => {
  const { deps } = createDirectUploadHarness();
  let signedUploadCalls = 0;

  const countingDeps = {
    ...deps,
    async createSignedUpload(params) {
      signedUploadCalls += 1;
      return deps.createSignedUpload(params);
    },
  };

  // Non-super-admin and inactive super-admin rejected
  const coordRes = await createRoundDocumentUploadIntentWithDeps(
    {
      actor: COORDINATOR_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "Case Brief",
      fileName: "brief.pdf",
      mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
      fileSizeBytes: 1024,
    },
    countingDeps,
  );
  assert.equal(coordRes.ok, false);
  assert.match(coordRes.message, /Super Admin/i);

  const inactiveRes = await createRoundDocumentUploadIntentWithDeps(
    {
      actor: INACTIVE_SUPER_ADMIN,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "Case Brief",
      fileName: "brief.pdf",
      mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
      fileSizeBytes: 1024,
    },
    countingDeps,
  );
  assert.equal(inactiveRes.ok, false);
  assert.match(inactiveRes.message, /active Super Admin/i);

  // Invalid event/round UUID and mismatched round rejected
  const badRoundRes = await createRoundDocumentUploadIntentWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: OTHER_ROUND_ID,
      title: "Case Brief",
      fileName: "brief.pdf",
      mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
      fileSizeBytes: 1024,
    },
    countingDeps,
  );
  assert.equal(badRoundRes.ok, false);
  assert.match(badRoundRes.message, /not found/i);

  // Oversized, zero-byte, unsafe filename, and non-PDF MIME rejected
  const oversizedRes = await createRoundDocumentUploadIntentWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "Too Large",
      fileName: "big.pdf",
      mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
      fileSizeBytes: MAX_COMPETITION_DOCUMENT_BYTES + 1,
    },
    countingDeps,
  );
  assert.equal(oversizedRes.ok, false);
  assert.match(oversizedRes.message, /25 MB/i);

  const badMimeRes = await createRoundDocumentUploadIntentWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "Wrong Type",
      fileName: "notes.txt",
      mimeType: "text/plain",
      fileSizeBytes: 512,
    },
    countingDeps,
  );
  assert.equal(badMimeRes.ok, false);

  const badPathNameRes = await createRoundDocumentUploadIntentWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "Traversal",
      fileName: "../secret.pdf",
      mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
      fileSizeBytes: 512,
    },
    countingDeps,
  );
  assert.equal(badPathNameRes.ok, false);
  assert.equal(signedUploadCalls, 0);

  // Valid upload intent generates server-side UUID path and returns path + token
  const okIntent = await createRoundDocumentUploadIntentWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "Round 1 Brief",
      fileName: "round1-brief.pdf",
      mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
      fileSizeBytes: 5_000_000,
    },
    countingDeps,
  );
  assert.equal(okIntent.ok, true);
  assert.ok(okIntent.storageObjectPath);
  assert.ok(okIntent.token);
  assert.ok(okIntent.storageObjectPath.startsWith(`${EVENT_ID}/${ROUND_ID}/`));
  assert.ok(okIntent.storageObjectPath.endsWith(".pdf"));
  assert.equal(signedUploadCalls, 1);

  // Replace intent also enforces Super Admin and active document ownership
  const missingDocReplace = await createRoundDocumentReplaceIntentWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      documentId: "11111111-1111-4111-8111-111111111111",
      title: "Updated",
      fileName: "updated.pdf",
      mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
      fileSizeBytes: 1024,
    },
    countingDeps,
  );
  assert.equal(missingDocReplace.ok, false);
  assert.match(missingDocReplace.message, /not found/i);
  assert.equal(signedUploadCalls, 1);
});

test("Stage 4.3B (2) [Mocked Unit Test]: Signed upload creation failure is handled cleanly for both new uploads and replacements", async () => {
  const { deps, documents, storageObjects, loggedErrors } =
    createDirectUploadHarness();

  const failingSignedUploadDeps = {
    ...deps,
    async createSignedUpload() {
      return { ok: false, error: "storage signer unavailable" };
    },
  };

  const uploadIntent = await createRoundDocumentUploadIntentWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "Brief",
      fileName: "brief.pdf",
      mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
      fileSizeBytes: 2048,
    },
    failingSignedUploadDeps,
  );
  assert.equal(uploadIntent.ok, false);
  assert.match(uploadIntent.message, /signed upload token/i);

  // Seed existing active document, then fail replace intent creation
  const existingPath = `${EVENT_ID}/${ROUND_ID}/77777777-7777-4777-8777-777777777777.pdf`;
  storageObjects.set(existingPath, {
    bytes: makePdfBytes("Existing"),
    sizeBytes: 120,
    contentType: ALLOWED_COMPETITION_DOCUMENT_MIME,
  });
  const seed = await finalizeRoundDocumentUploadWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "Original Brief",
      originalFilename: "original.pdf",
      storageObjectPath: existingPath,
    },
    deps,
  );
  assert.equal(seed.ok, true);

  const replaceIntent = await createRoundDocumentReplaceIntentWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      documentId: seed.documentId,
      title: "Replacement",
      fileName: "replacement.pdf",
      mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
      fileSizeBytes: 2048,
    },
    failingSignedUploadDeps,
  );
  assert.equal(replaceIntent.ok, false);
  assert.match(replaceIntent.message, /existing PDF remains unchanged/i);
  assert.equal(documents.get(seed.documentId).title, "Original Brief");
  assert.equal(loggedErrors.length, 2);
});

test("Stage 4.3B (3) [Mocked Unit Test]: Finalise upload inspects object size/MIME/PDF signature, uses server size, and cleans up invalid objects", async () => {
  const { deps, storageObjects, documents, audits } =
    createDirectUploadHarness();

  // Reject missing object without DB write
  const missingPath = `${EVENT_ID}/${ROUND_ID}/11111111-1111-4111-8111-111111111111.pdf`;
  const missingRes = await finalizeRoundDocumentUploadWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "Missing Object",
      originalFilename: "missing.pdf",
      storageObjectPath: missingPath,
    },
    deps,
  );
  assert.equal(missingRes.ok, false);
  assert.match(missingRes.message, /not found in private storage/i);
  assert.equal(documents.size, 0);

  // Reject path belonging to another round
  const foreignPath = `${EVENT_ID}/${OTHER_ROUND_ID}/11111111-1111-4111-8111-111111111111.pdf`;
  const foreignRes = await finalizeRoundDocumentUploadWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "Wrong Round",
      originalFilename: "wrong.pdf",
      storageObjectPath: foreignPath,
    },
    deps,
  );
  assert.equal(foreignRes.ok, false);
  assert.match(foreignRes.message, /invalid for the selected event and round/i);

  // Reject non-PDF signature and verify uploaded object is deleted
  const fakePdfPath = `${EVENT_ID}/${ROUND_ID}/22222222-2222-4222-8222-222222222222.pdf`;
  storageObjects.set(fakePdfPath, {
    bytes: new TextEncoder().encode("<html>not a pdf</html>"),
    sizeBytes: 22,
    contentType: ALLOWED_COMPETITION_DOCUMENT_MIME,
  });
  const fakePdfRes = await finalizeRoundDocumentUploadWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "Fake PDF",
      originalFilename: "fake.pdf",
      storageObjectPath: fakePdfPath,
    },
    deps,
  );
  assert.equal(fakePdfRes.ok, false);
  assert.match(fakePdfRes.message, /valid PDF document signature/i);
  assert.equal(storageObjects.has(fakePdfPath), false);
  assert.equal(documents.size, 0);

  // Reject oversized object (> 25 MiB) and delete from storage
  const oversizedPath = `${EVENT_ID}/${ROUND_ID}/33333333-3333-4333-8333-333333333333.pdf`;
  storageObjects.set(oversizedPath, {
    bytes: makePdfBytes("Large"),
    sizeBytes: MAX_COMPETITION_DOCUMENT_BYTES + 50,
    contentType: ALLOWED_COMPETITION_DOCUMENT_MIME,
  });
  const oversizedRes = await finalizeRoundDocumentUploadWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "Oversized",
      originalFilename: "oversized.pdf",
      storageObjectPath: oversizedPath,
    },
    deps,
  );
  assert.equal(oversizedRes.ok, false);
  assert.match(oversizedRes.message, /25 MB/i);
  assert.equal(storageObjects.has(oversizedPath), false);

  // Reject wrong content-type and report orphan path if cleanup also fails
  const wrongMimePath = `${EVENT_ID}/${ROUND_ID}/44444444-4444-4444-8444-444444444444.pdf`;
  storageObjects.set(wrongMimePath, {
    bytes: makePdfBytes("Bad Mime"),
    sizeBytes: 64,
    contentType: "text/plain",
  });
  const wrongMimeRes = await finalizeRoundDocumentUploadWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "Wrong Mime",
      originalFilename: "mime.pdf",
      storageObjectPath: wrongMimePath,
    },
    {
      ...deps,
      async removeStorageObject() {
        return { ok: false, error: "delete timeout" };
      },
    },
  );
  assert.equal(wrongMimeRes.ok, false);
  assert.ok(wrongMimeRes.message.includes(wrongMimePath));
  assert.match(wrongMimeRes.message, /orphaned/i);

  // Valid object commits using server-verified size & records direct_signed_url audit
  const validPath = `${EVENT_ID}/${ROUND_ID}/55555555-5555-4555-8555-555555555555.pdf`;
  storageObjects.set(validPath, {
    bytes: makePdfBytes("Authoritative"),
    sizeBytes: 12_345_678,
    contentType: ALLOWED_COMPETITION_DOCUMENT_MIME,
  });
  const okRes = await finalizeRoundDocumentUploadWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "Verified Direct Brief",
      originalFilename: "verified-brief.pdf",
      storageObjectPath: validPath,
    },
    deps,
  );
  assert.equal(okRes.ok, true);
  assert.ok(okRes.documentId);
  const saved = documents.get(okRes.documentId);
  assert.equal(saved.file_size_bytes, 12_345_678);
  assert.equal(saved.storage_bucket, COMPETITION_DOCUMENTS_BUCKET);
  assert.equal(saved.storage_object_path, validPath);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].metadata.uploadMode, "direct_signed_url");
});

test("Stage 4.3B (4) [Mocked Unit Test]: Finalise DB failure cleans up orphan upload (or reports orphan path) while replay conflicts never delete an active object", async () => {
  const { deps, storageObjects, documents } = createDirectUploadHarness();

  // Case A: DB insert error deletes newly uploaded object
  const pathA = `${EVENT_ID}/${ROUND_ID}/aaaa1111-1111-4111-8111-111111111111.pdf`;
  storageObjects.set(pathA, {
    bytes: makePdfBytes("A"),
    sizeBytes: 512,
    contentType: ALLOWED_COMPETITION_DOCUMENT_MIME,
  });
  const dbFailCleanupOk = await finalizeRoundDocumentUploadWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "DB Failure",
      originalFilename: "fail.pdf",
      storageObjectPath: pathA,
    },
    {
      ...deps,
      async insertDocumentMetadata() {
        return { document: null, error: "database insert failed" };
      },
    },
  );
  assert.equal(dbFailCleanupOk.ok, false);
  assert.equal(storageObjects.has(pathA), false);

  // Case B: DB insert error AND cleanup failure reports exact orphaned path
  const pathB = `${EVENT_ID}/${ROUND_ID}/bbbb2222-2222-4222-8222-222222222222.pdf`;
  storageObjects.set(pathB, {
    bytes: makePdfBytes("B"),
    sizeBytes: 512,
    contentType: ALLOWED_COMPETITION_DOCUMENT_MIME,
  });
  const dbFailCleanupFail = await finalizeRoundDocumentUploadWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "DB Failure Orphan",
      originalFilename: "orphan.pdf",
      storageObjectPath: pathB,
    },
    {
      ...deps,
      async insertDocumentMetadata() {
        return { document: null, error: "database insert failed" };
      },
      async removeStorageObject() {
        return { ok: false, error: "cleanup failed" };
      },
    },
  );
  assert.equal(dbFailCleanupFail.ok, false);
  assert.ok(dbFailCleanupFail.message.includes(pathB));
  assert.match(dbFailCleanupFail.message, /orphaned/i);
  assert.equal(storageObjects.has(pathB), true);

  // Case C: Duplicate/replayed finalisation on already-registered path NEVER deletes the active file
  const activePath = `${EVENT_ID}/${ROUND_ID}/cccc3333-3333-4333-8333-333333333333.pdf`;
  storageObjects.set(activePath, {
    bytes: makePdfBytes("Active"),
    sizeBytes: 1024,
    contentType: ALLOWED_COMPETITION_DOCUMENT_MIME,
  });
  const firstCommit = await finalizeRoundDocumentUploadWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "First Commit",
      originalFilename: "first.pdf",
      storageObjectPath: activePath,
    },
    deps,
  );
  assert.equal(firstCommit.ok, true);

  const replayRes = await finalizeRoundDocumentUploadWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "Replay Attempt",
      originalFilename: "first.pdf",
      storageObjectPath: activePath,
    },
    deps,
  );
  assert.equal(replayRes.ok, false);
  assert.match(replayRes.message, /already been registered/i);
  assert.equal(storageObjects.has(activePath), true);
  assert.equal(documents.size, 1);

  // Even if pre-check is bypassed concurrently and DB returns 23505 isConflict, active file stays safe
  const raceConflictRes = await finalizeRoundDocumentUploadWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "Concurrent Conflict",
      originalFilename: "first.pdf",
      storageObjectPath: activePath,
    },
    {
      ...deps,
      async isStoragePathRegistered() {
        return { exists: false, error: null };
      },
    },
  );
  assert.equal(raceConflictRes.ok, false);
  assert.match(raceConflictRes.message, /already been registered/i);
  assert.equal(storageObjects.has(activePath), true);
});

test("Stage 4.3B (5) [Mocked Unit Test]: Direct replacement preserves old PDF on failure, reports orphan cleanup failures, and warns when old file cleanup or audit fails after commit", async () => {
  const { deps, storageObjects, documents } = createDirectUploadHarness();

  const oldPath = `${EVENT_ID}/${ROUND_ID}/10101010-1010-4010-8010-101010101010.pdf`;
  storageObjects.set(oldPath, {
    bytes: makePdfBytes("Old PDF"),
    sizeBytes: 1000,
    contentType: ALLOWED_COMPETITION_DOCUMENT_MIME,
  });
  const seed = await finalizeRoundDocumentUploadWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      title: "Active Brief",
      originalFilename: "v1.pdf",
      storageObjectPath: oldPath,
    },
    deps,
  );
  assert.equal(seed.ok, true);

  // Replacement DB metadata failure preserves old PDF and reports orphaned new path when cleanup fails
  const failedNewPath = `${EVENT_ID}/${ROUND_ID}/20202020-2020-4020-8020-202020202020.pdf`;
  storageObjects.set(failedNewPath, {
    bytes: makePdfBytes("New Failed PDF"),
    sizeBytes: 2000,
    contentType: ALLOWED_COMPETITION_DOCUMENT_MIME,
  });

  const failedReplaceRes = await finalizeRoundDocumentReplacementWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      documentId: seed.documentId,
      title: "Updated Brief",
      originalFilename: "v2.pdf",
      newStorageObjectPath: failedNewPath,
    },
    {
      ...deps,
      async replaceDocumentMetadata() {
        return { document: null, error: "update failed" };
      },
      async removeStorageObject() {
        return { ok: false, error: "orphan cleanup timeout" };
      },
    },
  );
  assert.equal(failedReplaceRes.ok, false);
  assert.ok(failedReplaceRes.message.includes(failedNewPath));
  assert.match(failedReplaceRes.message, /previous PDF remains active/i);
  assert.equal(documents.get(seed.documentId).storage_object_path, oldPath);
  assert.equal(storageObjects.has(oldPath), true);

  // Successful replacement where deleting oldPath + audit fail returns ok: true with combined warnings
  const goodNewPath = `${EVENT_ID}/${ROUND_ID}/30303030-3030-4030-8030-303030303030.pdf`;
  storageObjects.set(goodNewPath, {
    bytes: makePdfBytes("Good New PDF"),
    sizeBytes: 3456,
    contentType: ALLOWED_COMPETITION_DOCUMENT_MIME,
  });

  const warnReplaceRes = await finalizeRoundDocumentReplacementWithDeps(
    {
      actor: SUPER_ADMIN_ACTOR,
      eventId: EVENT_ID,
      roundId: ROUND_ID,
      documentId: seed.documentId,
      title: "Brief V2",
      originalFilename: "v2.pdf",
      newStorageObjectPath: goodNewPath,
    },
    {
      ...deps,
      async removeStorageObject() {
        return { ok: false, error: "old object delete unconfirmed" };
      },
      async recordAudit() {
        throw new Error("audit table unavailable");
      },
    },
  );
  assert.equal(warnReplaceRes.ok, true);
  assert.ok(warnReplaceRes.warning);
  assert.ok(warnReplaceRes.warning.includes(oldPath));
  assert.match(warnReplaceRes.warning, /audit log failed/i);
  assert.equal(documents.get(seed.documentId).storage_object_path, goodNewPath);
  assert.equal(documents.get(seed.documentId).file_size_bytes, 3456);
});

test("Stage 4.3B (6) [Mocked Unit Test]: Browser direct upload orchestration passes metadata only to server steps, calls uploadToSignedUrl directly, and handles expiry/network failures before finalising", async () => {
  const sampleFile = new File([makePdfBytes("Browser PDF")], "case-brief.pdf", {
    type: ALLOWED_COMPETITION_DOCUMENT_MIME,
  });
  const stages = [];
  let receivedIntentArgs = null;
  let receivedUploadArgs = null;
  let receivedFinalizeArgs = null;

  const successResult = await runDirectPdfUploadFlowWithDeps(
    { title: "Case Brief", file: sampleFile },
    {
      onStageChange(stage) {
        stages.push(stage);
      },
      async requestIntent(params) {
        receivedIntentArgs = params;
        return {
          ok: true,
          message: "Upload permission granted.",
          storageObjectPath: `${EVENT_ID}/${ROUND_ID}/40404040-4040-4040-8040-404040404040.pdf`,
          token: "signed-upload-token-xyz",
        };
      },
      async uploadToSignedUrl(objectPath, token, file, options) {
        receivedUploadArgs = { objectPath, token, file, options };
        return { error: null };
      },
      async finalizeUpload(params) {
        receivedFinalizeArgs = params;
        return {
          ok: true,
          documentId: "50505050-5050-4050-8050-505050505050",
          message: 'Uploaded PDF "Case Brief".',
        };
      },
    },
  );

  assert.equal(successResult.ok, true);
  assert.deepEqual(stages, [
    "requesting_permission",
    "uploading_storage",
    "finalising",
  ]);
  assert.equal("file" in receivedIntentArgs, false);
  assert.equal(receivedIntentArgs.fileName, "case-brief.pdf");
  assert.equal(receivedIntentArgs.mimeType, ALLOWED_COMPETITION_DOCUMENT_MIME);
  assert.equal(receivedIntentArgs.fileSizeBytes, sampleFile.size);

  assert.equal(
    receivedUploadArgs.objectPath,
    `${EVENT_ID}/${ROUND_ID}/40404040-4040-4040-8040-404040404040.pdf`,
  );
  assert.equal(receivedUploadArgs.token, "signed-upload-token-xyz");
  assert.equal(receivedUploadArgs.file, sampleFile);
  assert.deepEqual(receivedUploadArgs.options, {
    contentType: ALLOWED_COMPETITION_DOCUMENT_MIME,
    cacheControl: "no-store",
    upsert: false,
  });

  assert.equal("file" in receivedFinalizeArgs, false);
  assert.equal(
    receivedFinalizeArgs.storageObjectPath,
    `${EVENT_ID}/${ROUND_ID}/40404040-4040-4040-8040-404040404040.pdf`,
  );

  // Token expiry during Storage upload aborts cleanly without calling finalizeUpload
  let finalizeCalledOnFailure = false;
  const expiredRes = await runDirectPdfUploadFlowWithDeps(
    { title: "Expired Upload", file: sampleFile },
    {
      async requestIntent() {
        return {
          ok: true,
          message: "ok",
          storageObjectPath: `${EVENT_ID}/${ROUND_ID}/60606060-6060-4060-8060-606060606060.pdf`,
          token: "expired-token",
        };
      },
      async uploadToSignedUrl() {
        return { error: { message: "JWT expired" } };
      },
      async finalizeUpload() {
        finalizeCalledOnFailure = true;
        return { ok: true, message: "should not run" };
      },
    },
  );
  assert.equal(expiredRes.ok, false);
  assert.match(expiredRes.message, /expired/i);
  assert.equal(finalizeCalledOnFailure, false);
});

test("Stage 4.3B (7) [Static Structural Check]: Body limit removed, actions/storage/panel match direct upload architecture, and private bucket policies remain intact", () => {
  const nextConfigSource = fs.readFileSync(
    path.join(ROOT_DIR, "next.config.ts"),
    "utf8",
  );
  const actionsSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/actions/documents.ts"),
    "utf8",
  );
  const storageSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/lib/documents/storage.ts"),
    "utf8",
  );
  const clientUploadSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/lib/documents/client-upload.ts"),
    "utf8",
  );
  const panelSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/components/competition/RoundDocumentsPanel.tsx"),
    "utf8",
  );
  const migrationSql = fs.readFileSync(
    path.join(
      ROOT_DIR,
      "supabase/migrations/202611260011_stage43a_competition_documents.sql",
    ),
    "utf8",
  );

  // Next.js config does not depend on serverActions.bodySizeLimit
  assert.equal(nextConfigSource.includes("bodySizeLimit"), false);

  // Server actions have no server-proxied file upload or FormData file reading
  assert.equal(actionsSource.includes("uploadCompetitionDocumentObject"), false);
  assert.equal(actionsSource.includes('formData.get("file")'), false);
  assert.match(actionsSource, /requestRoundDocumentUploadIntentAction/);
  assert.match(actionsSource, /finalizeRoundDocumentUploadAction/);
  assert.match(actionsSource, /requestRoundDocumentReplaceIntentAction/);
  assert.match(actionsSource, /finalizeRoundDocumentReplacementAction/);
  assert.match(actionsSource, /function tryRevalidateRoundPath/);
  const guardMatches = actionsSource.match(
    /requireActiveUserForAction\(SUPER_ADMIN_ONLY/g,
  );
  assert.equal(guardMatches?.length, 6);

  // Storage module enforces server-only, non-overwriting signed upload, bounded inspection, no getPublicUrl
  assert.match(storageSource, /^import "server-only";/m);
  assert.equal(storageSource.includes("uploadCompetitionDocumentObject"), false);
  assert.equal(storageSource.includes("getPublicUrl"), false);
  assert.match(storageSource, /createSignedUploadUrl\(params\.objectPath,\s*\{\s*upsert:\s*false\s*\}/);
  assert.match(storageSource, /Range:\s*`bytes=0-/);

  // Browser upload uses createSupabaseBrowserClient + uploadToSignedUrl
  assert.match(clientUploadSource, /createSupabaseBrowserClient/);
  assert.match(clientUploadSource, /uploadToSignedUrl/);

  // UI panel uses direct browser upload and beforeunload guard, with no admin or preview exposure
  assert.match(panelSource, /uploadPdfDirectToStorage/);
  assert.match(panelSource, /beforeunload/);
  assert.equal(panelSource.includes("uploadRoundDocumentAction"), false);
  assert.equal(panelSource.includes("replaceRoundDocumentAction"), false);
  assert.equal(panelSource.includes("createSupabaseAdminClient"), false);
  assert.equal(panelSource.includes("getPublicUrl"), false);

  // Private bucket & restrictive RLS remain unchanged in migration 0011
  assert.match(
    migrationSql,
    /VALUES \(\s*'competition-documents',\s*'competition-documents',\s*false,/,
  );
  assert.match(migrationSql, /AS RESTRICTIVE/);
});
