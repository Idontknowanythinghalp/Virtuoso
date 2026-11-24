import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  ALL_ORGANISER_ROLES,
  evaluateOrganiserAccess,
} from "../src/lib/auth/policy.ts";
import { suggestColumnMappings } from "../src/lib/imports/fields.ts";
import { parseRegistrationFileBuffer } from "../src/lib/imports/parser.ts";
import { validateImportBatch } from "../src/lib/imports/validator.ts";
import {
  buildImportExecutionPlan,
  buildResolutionContext,
} from "../src/lib/imports/execution-planner.ts";
import {
  sanitizeFileFormat,
  sanitizeIdempotencyKey,
  sanitizeImportRpcError,
  sanitizeResolutionSelection,
  sanitizeSourceFilename,
} from "../src/lib/imports/request-helpers.ts";
import { sanitizeAuditPayload } from "../src/lib/audit/sanitize.ts";

const ROOT_DIR = process.cwd();

const CONTINGENT_EVENT = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "FIN-2026",
  name: "Corporate Finance Track",
  entry_mode: "contingent",
  codename_mode: "event_wide",
  status: "active",
  min_team_size: 2,
  max_team_size: 4,
};

const INDIVIDUAL_EVENT = {
  id: "22222222-2222-4222-8222-222222222222",
  code: "BST-2026",
  name: "Best Manager Track",
  entry_mode: "individual",
  codename_mode: "per_round",
  status: "active",
  min_team_size: null,
  max_team_size: null,
};

const ARCHIVED_EVENT = {
  ...CONTINGENT_EVENT,
  id: "33333333-3333-4333-8333-333333333333",
  status: "archived",
};

const EMPTY_CMS = {
  contingents: [],
  participants: [],
  eventEntries: [],
};

async function parseCsvToReport(csvText, event, existingCms = EMPTY_CMS) {
  const parsed = await parseRegistrationFileBuffer({
    buffer: Buffer.from(csvText, "utf8"),
    fileName: "registrations.csv",
    mimeType: "text/csv",
  });
  assert.equal(parsed.ok, true);
  const sheet = parsed.workbook.sheet;
  const mapping = suggestColumnMappings(sheet.columns);

  const enteredContingentIds = new Set(
    existingCms.eventEntries
      .map((e) => e.contingent_id)
      .filter((id) => Boolean(id)),
  );
  const enteredParticipantIds = new Set(
    existingCms.eventEntries
      .map((e) => e.participant_id)
      .filter((id) => Boolean(id)),
  );

  return validateImportBatch({
    event,
    columns: sheet.columns,
    rows: sheet.rows,
    mapping,
    existingContext: {
      contingents: existingCms.contingents,
      participants: existingCms.participants,
      enteredContingentIdsForEvent: enteredContingentIds,
      enteredParticipantIdsForEvent: enteredParticipantIds,
    },
  });
}

test("Stage 2B.2: plans creation of new contingents, participants, and deduplicated event entries", async () => {
  const csv = [
    "Contingent Code,Contingent Name,Institution,Participant Code,Participant Name,Email,Contingent Lead",
    "CTG-01,Alpha Capital,Christ University,P-001,Aarav Nair,aarav@example.edu,Yes",
    "CTG-01,Alpha Capital,Christ University,P-002,Diya Rao,diya@example.edu,No",
  ].join("\n");

  const report = await parseCsvToReport(csv, CONTINGENT_EVENT);
  const res = buildImportExecutionPlan({
    report,
    cmsContext: EMPTY_CMS,
    selection: { entityResolutions: {}, skippedRowNumbers: [] },
  });

  assert.equal(res.ok, true);
  assert.equal(res.plan.contingentOps.length, 1);
  assert.equal(res.plan.contingentOps[0].op, "create");
  assert.equal(res.plan.contingentOps[0].contingent_code, "CTG-01");

  assert.equal(res.plan.participantOps.length, 2);
  assert.equal(res.plan.participantOps[0].op, "create");
  assert.equal(res.plan.participantOps[0].is_contingent_lead, true);
  assert.equal(res.plan.participantOps[1].op, "create");
  assert.equal(res.plan.participantOps[1].is_contingent_lead, false);

  assert.equal(res.plan.entryOps.length, 1);
  assert.equal(res.plan.entryOps[0].entry_type, "contingent");
  assert.equal(res.plan.entryOps[0].contingent_code, "CTG-01");

  assert.equal(res.plan.preExecutionSummary.contingentsToCreateCount, 1);
  assert.equal(res.plan.preExecutionSummary.participantsToCreateCount, 2);
  assert.equal(res.plan.preExecutionSummary.entriesToCreateCount, 1);
  assert.match(res.plan.payloadHash, /^[0-9a-f]{64}$/);
});

test("Stage 2B.2: plans creation of individual participants and entries for individual-mode events", async () => {
  const csv = [
    "Participant Code,Participant Name,Institution,Email",
    "IND-101,Meera Menon,SJCC Bengaluru,meera@sjcc.edu",
    "IND-102,Kabir Shah,Jain University,kabir@jain.edu",
  ].join("\n");

  const report = await parseCsvToReport(csv, INDIVIDUAL_EVENT);
  const res = buildImportExecutionPlan({
    report,
    cmsContext: EMPTY_CMS,
    selection: { entityResolutions: {}, skippedRowNumbers: [] },
  });

  assert.equal(res.ok, true);
  assert.equal(res.plan.contingentOps.length, 0);
  assert.equal(res.plan.participantOps.length, 2);
  assert.equal(res.plan.entryOps.length, 2);
  assert.equal(res.plan.entryOps[0].entry_type, "individual");
  assert.equal(res.plan.entryOps[0].participant_code, "IND-101");
});

test("Stage 2B.2: matches existing CMS records and computes field diffs without overwriting by default", async () => {
  const existingCms = {
    contingents: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        contingent_code: "CTG-10",
        name: "Original Team Name",
        institution_name: "St. Joseph's College of Commerce",
        institution_city: "Bengaluru",
        external_registration_ref: "REG-C-10",
        contact_email: "old@sjcc.edu",
        contact_phone: "+91 9800000001",
        is_active: true,
        notes: null,
      },
    ],
    participants: [
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        contingent_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        participant_code: "P-101",
        full_name: "Rohan Verma",
        email: "rohan@sjcc.edu",
        phone: "+91 9800000010",
        institution_name: "St. Joseph's College of Commerce",
        external_registration_ref: "REG-P-101",
        is_contingent_lead: true,
        is_active: true,
      },
    ],
    eventEntries: [
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        event_id: CONTINGENT_EVENT.id,
        entry_type: "contingent",
        contingent_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        participant_id: null,
        status: "checked_in",
      },
    ],
  };

  const csv = [
    "Contingent Code,Contingent Name,Institution,Contact Email,Participant Code,Participant Name,Email,Contingent Lead",
    "CTG-10,Updated Team Name,St. Joseph's College of Commerce,new@sjcc.edu,P-101,Rohan V. Verma,rohan@sjcc.edu,Yes",
  ].join("\n");

  const report = await parseCsvToReport(csv, CONTINGENT_EVENT, existingCms);
  const context = buildResolutionContext({ report, cmsContext: existingCms });

  assert.equal(context.matchedRecords.length, 2);
  const contMatch = context.matchedRecords.find((m) => m.entity === "contingent");
  assert.ok(contMatch);
  assert.equal(contMatch.alreadyEnteredInSelectedEvent, true);
  assert.equal(
    contMatch.fieldDiffs.some(
      (d) =>
        d.field === "name" &&
        d.currentValue === "Original Team Name" &&
        d.incomingValue === "Updated Team Name",
    ),
    true,
  );
  assert.equal(
    contMatch.fieldDiffs.some((d) => d.field === "contact_email"),
    true,
  );

  // Missing resolution decision must fail safely
  const missingDecision = buildImportExecutionPlan({
    report,
    cmsContext: existingCms,
    selection: { entityResolutions: {}, skippedRowNumbers: [] },
  });
  assert.equal(missingDecision.ok, false);
  assert.match(missingDecision.error, /explicit decision/i);

  // Explicit reuse keeps existing CMS values intact and reuses existing event_entry
  const reusePlan = buildImportExecutionPlan({
    report,
    cmsContext: existingCms,
    selection: {
      entityResolutions: {
        [contMatch.matchKey]: { action: "reuse", approvedFields: [] },
        "participant:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb": {
          action: "reuse",
          approvedFields: [],
        },
      },
      skippedRowNumbers: [],
    },
  });
  assert.equal(reusePlan.ok, true);
  assert.equal(reusePlan.plan.contingentOps[0].op, "reuse");
  assert.equal(reusePlan.plan.contingentOps[0].name, "Original Team Name");
  assert.equal(reusePlan.plan.participantOps[0].op, "reuse");
  assert.equal(reusePlan.plan.participantOps[0].full_name, "Rohan Verma");
  assert.equal(reusePlan.plan.preExecutionSummary.entriesToReuseCount, 1);
  assert.equal(reusePlan.plan.preExecutionSummary.entriesToCreateCount, 0);
});

test("Stage 2B.2: enforces server-side allowlist and explicit field approval for existing record updates", async () => {
  const existingCms = {
    contingents: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        contingent_code: "CTG-20",
        name: "Old Name",
        institution_name: "Loyola College",
        institution_city: "Chennai",
        external_registration_ref: null,
        contact_email: "old@loyola.edu",
        contact_phone: null,
        is_active: true,
        notes: null,
      },
    ],
    participants: [],
    eventEntries: [],
  };

  const csv = [
    "Contingent Code,Contingent Name,Institution,Contact Email,Participant Code,Participant Name,Email",
    "CTG-20,New Name,Loyola College,new@loyola.edu,P-201,Ananya S,ananya@loyola.edu",
  ].join("\n");

  const report = await parseCsvToReport(csv, CONTINGENT_EVENT, existingCms);
  const contKey = "contingent:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  // 1. Update with zero approved fields must be rejected
  const emptyFields = buildImportExecutionPlan({
    report,
    cmsContext: existingCms,
    selection: {
      entityResolutions: {
        [contKey]: { action: "update", approvedFields: [] },
      },
      skippedRowNumbers: [],
    },
  });
  assert.equal(emptyFields.ok, false);
  assert.match(emptyFields.error, /at least one field/i);

  // 2. Non-allowlisted fields (e.g., is_active, contingent_code, status) must be rejected
  const disallowedField = buildImportExecutionPlan({
    report,
    cmsContext: existingCms,
    selection: {
      entityResolutions: {
        [contKey]: {
          action: "update",
          approvedFields: ["is_active", "contingent_code"],
        },
      },
      skippedRowNumbers: [],
    },
  });
  assert.equal(disallowedField.ok, false);
  assert.match(disallowedField.error, /not on the server allowlist/i);

  // 3. Approving only 'name' updates 'name' while preserving existing 'contact_email'
  const partialApproved = buildImportExecutionPlan({
    report,
    cmsContext: existingCms,
    selection: {
      entityResolutions: {
        [contKey]: {
          action: "update",
          approvedFields: ["name"],
        },
      },
      skippedRowNumbers: [],
    },
  });
  assert.equal(partialApproved.ok, true);
  assert.equal(partialApproved.plan.contingentOps[0].op, "update");
  assert.equal(partialApproved.plan.contingentOps[0].name, "New Name");
  assert.equal(
    partialApproved.plan.contingentOps[0].contact_email,
    "old@loyola.edu",
  );
  assert.deepEqual(partialApproved.plan.contingentOps[0].approved_fields, [
    "name",
  ]);
  assert.equal(partialApproved.plan.approvedUpdates.length, 1);
  assert.deepEqual(partialApproved.plan.approvedUpdates[0].updatedFields, [
    "name",
  ]);
});

test("Stage 2B.2: supports skipping invalid/duplicate rows or matched entities while blocking unskipped invalid rows", async () => {
  const csv = [
    "Participant Code,Participant Name,Institution,Email",
    "IND-01,Valid Student,SJCC Bengaluru,valid@sjcc.edu",
    "IND-02,Bad Email Student,SJCC Bengaluru,not-an-email",
  ].join("\n");

  const report = await parseCsvToReport(csv, INDIVIDUAL_EVENT);
  assert.equal(report.summary.invalidRows, 1);

  // Unskipped invalid row must block execution
  const blocked = buildImportExecutionPlan({
    report,
    cmsContext: EMPTY_CMS,
    selection: { entityResolutions: {}, skippedRowNumbers: [] },
  });
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /Row #3/i);

  // Skipping invalid row #3 allows row #2 to execute cleanly
  const allowed = buildImportExecutionPlan({
    report,
    cmsContext: EMPTY_CMS,
    selection: { entityResolutions: {}, skippedRowNumbers: [3] },
  });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.plan.preExecutionSummary.activeRowsCount, 1);
  assert.equal(allowed.plan.preExecutionSummary.skippedRowsCount, 1);
  assert.equal(allowed.plan.preExecutionSummary.rejectedRowsCount, 1);
  assert.equal(allowed.plan.participantOps.length, 1);
  assert.equal(allowed.plan.participantOps[0].participant_code, "IND-01");
});

test("Stage 2B.2: flags missing-from-file CMS entries and preserves them non-destructively", async () => {
  const existingCms = {
    contingents: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        contingent_code: "CTG-MISSING",
        name: "Existing Registered Team",
        institution_name: "Mount Carmel College",
        institution_city: "Bengaluru",
        external_registration_ref: null,
        contact_email: null,
        contact_phone: null,
        is_active: true,
        notes: null,
      },
    ],
    participants: [],
    eventEntries: [
      {
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        event_id: CONTINGENT_EVENT.id,
        entry_type: "contingent",
        contingent_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        participant_id: null,
        status: "checked_in",
      },
    ],
  };

  const csv = [
    "Contingent Code,Contingent Name,Institution,Participant Code,Participant Name,Email",
    "CTG-NEW,New Incoming Team,Presidency College,P-901,Sara Ali,sara@presidency.edu",
  ].join("\n");

  const report = await parseCsvToReport(csv, CONTINGENT_EVENT, existingCms);
  const res = buildImportExecutionPlan({
    report,
    cmsContext: existingCms,
    selection: { entityResolutions: {}, skippedRowNumbers: [] },
  });

  assert.equal(res.ok, true);
  assert.equal(res.resolutionContext.missingFromFileEntries.length, 1);
  assert.equal(
    res.resolutionContext.missingFromFileEntries[0].subjectCode,
    "CTG-MISSING",
  );
  assert.equal(
    res.resolutionContext.missingFromFileEntries[0].entryStatus,
    "checked_in",
  );
  assert.equal(res.plan.preExecutionSummary.missingFromFileCount, 1);
  // Missing entry must never appear as a destructive op in entryOps
  assert.equal(res.plan.entryOps.length, 1);
  assert.equal(res.plan.entryOps[0].contingent_code, "CTG-NEW");
});

test("Stage 2B.2: blocks archived events and inactive CMS subjects unless skipped", async () => {
  const csv = [
    "Contingent Code,Contingent Name,Institution,Participant Code,Participant Name,Email",
    "CTG-INACT,Inactive Team,Some College,P-500,Dev Patel,dev@college.edu",
  ].join("\n");

  const archivedReport = await parseCsvToReport(csv, ARCHIVED_EVENT);
  const archivedPlan = buildImportExecutionPlan({
    report: archivedReport,
    cmsContext: EMPTY_CMS,
    selection: { entityResolutions: {}, skippedRowNumbers: [] },
  });
  assert.equal(archivedPlan.ok, false);
  assert.match(archivedPlan.error, /archived/i);

  const inactiveCms = {
    contingents: [
      {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        contingent_code: "CTG-INACT",
        name: "Inactive Team",
        institution_name: "Some College",
        institution_city: null,
        external_registration_ref: null,
        contact_email: null,
        contact_phone: null,
        is_active: false,
        notes: null,
      },
    ],
    participants: [],
    eventEntries: [],
  };

  const activeEventReport = await parseCsvToReport(csv, CONTINGENT_EVENT, inactiveCms);
  const blockedInactive = buildImportExecutionPlan({
    report: activeEventReport,
    cmsContext: inactiveCms,
    selection: {
      entityResolutions: {
        "contingent:dddddddd-dddd-4ddd-8ddd-dddddddddddd": {
          action: "reuse",
          approvedFields: [],
        },
      },
      skippedRowNumbers: [],
    },
  });
  assert.equal(blockedInactive.ok, false);
  assert.match(blockedInactive.error, /inactive/i);
});

test("Stage 2B.2: request helpers sanitize inputs, idempotency keys, and RPC errors safely", () => {
  assert.equal(sanitizeIdempotencyKey("short"), null);
  assert.equal(sanitizeIdempotencyKey("imp-1234-valid-key"), "imp-1234-valid-key");
  assert.equal(sanitizeIdempotencyKey("bad key with spaces!"), null);

  assert.equal(sanitizeFileFormat("CSV"), "csv");
  assert.equal(sanitizeFileFormat("xlsx"), "xlsx");
  assert.equal(sanitizeFileFormat("xlsm"), null);

  assert.equal(
    sanitizeSourceFilename("../../exports/registrations.csv"),
    ".._.._exports_registrations.csv",
  );

  const sanitizedSelection = sanitizeResolutionSelection({
    entityResolutions: {
      "contingent:1": {
        action: "update",
        approvedFields: ["name", "name", "", 123],
      },
    },
    skippedRowNumbers: [2, 2, -1, "3", 5],
  });
  assert.deepEqual(
    sanitizedSelection.entityResolutions["contingent:1"].approvedFields,
    ["name"],
  );
  assert.deepEqual(sanitizedSelection.skippedRowNumbers, [2, 5]);

  const missingMigErr = sanitizeImportRpcError(
    "Could not find the function public.execute_registration_import",
    "PGRST202",
  );
  assert.equal(missingMigErr.status, 503);
  assert.equal(missingMigErr.missingMigration, true);

  const conflictErr = sanitizeImportRpcError(
    "Conflict: idempotency key was already used for a different import payload",
  );
  assert.equal(conflictErr.status, 409);

  const genericErr = sanitizeImportRpcError(
    'duplicate key value violates unique constraint on row email="secret@x.com"',
  );
  assert.equal(genericErr.message.includes("secret@x.com"), false);
});

test("Stage 2B.2: audit payload sanitization redacts secrets and execute route logs only non-PII summaries", () => {
  const sanitized = sanitizeAuditPayload({
    eventId: CONTINGENT_EVENT.id,
    service_role: "secret-key",
    api_key: "top-secret",
    approvedUpdatesCount: 1,
    updates: [
      {
        entity: "contingent",
        existingId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        entityCode: "CTG-10",
        updatedFields: ["name", "institution_city"],
      },
    ],
  });

  assert.equal(sanitized.service_role, "[redacted]");
  assert.equal(sanitized.api_key, "[redacted]");
  assert.equal(sanitized.approvedUpdatesCount, 1);
  assert.equal(sanitized.updates[0].entityCode, "CTG-10");

  // Verify execute route never passes incoming participant PII or raw spreadsheet rows into audit metadata
  const executeRoute = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/api/imports/execute/route.ts"),
    "utf8",
  );
  assert.equal(/recordAuditLog\([\s\S]{0,600}\brows\s*:/.test(executeRoute), false);
  assert.equal(
    /recordAuditLog\([\s\S]{0,600}\bcontact_phone\b/.test(executeRoute),
    false,
  );
});

test("Stage 2B.2: Migration 0004 enforces idempotency, concurrency locks, atomic rollback, protected data preservation, and immutable history", () => {
  const sql = fs.readFileSync(
    path.join(
      ROOT_DIR,
      "supabase/migrations/202611170004_stage2b2_registration_imports.sql",
    ),
    "utf8",
  );

  // Table & immutability
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.registration_imports/i);
  assert.match(sql, /registration_imports_completed_idempotency_uidx/i);
  assert.match(sql, /WHERE status = 'completed'/i);
  assert.match(sql, /enforce_registration_imports_immutable/i);
  assert.match(sql, /REVOKE ALL ON public\.registration_imports FROM anon/i);
  assert.match(
    sql,
    /REVOKE INSERT, UPDATE, DELETE ON public\.registration_imports FROM authenticated/i,
  );
  assert.match(sql, /public\.is_active_organiser\(\)/i);

  // Concurrency locking & active organiser guard inside RPC
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.execute_registration_import/i);
  assert.match(sql, /pg_advisory_xact_lock\(/i);
  assert.match(sql, /FOR SHARE/i);
  assert.match(sql, /FOR UPDATE/i);
  assert.match(sql, /idempotent_replay/i);

  // Strict non-destructive guarantee: never updates or deletes event_entries or touches operational tables
  assert.equal(/DELETE\s+FROM\s+public\./i.test(sql), false);
  assert.equal(/UPDATE\s+public\.event_entries/i.test(sql), false);
  assert.equal(/public\.scores/i.test(sql), false);
  assert.equal(/codename/i.test(sql), false);
});

test("Stage 2B.2: API routes, page, and client enforce organiser authorization, event isolation, non-fatal audit logging, and safe browser patterns", () => {
  const executeRoute = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/api/imports/execute/route.ts"),
    "utf8",
  );
  const historyRoute = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/api/imports/history/route.ts"),
    "utf8",
  );
  const previewRoute = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/api/imports/preview/route.ts"),
    "utf8",
  );
  const importsPage = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/imports/page.tsx"),
    "utf8",
  );
  const clientFile = fs.readFileSync(
    path.join(ROOT_DIR, "src/components/imports/ImportPreparationClient.tsx"),
    "utf8",
  );

  // Authoritative server-side auth guards
  assert.match(executeRoute, /requireActiveUserForAction\(\s*ALL_ORGANISER_ROLES/s);
  assert.match(historyRoute, /requireActiveUserForAction\(\s*ALL_ORGANISER_ROLES/s);
  assert.match(previewRoute, /requireActiveUserForAction\(\s*ALL_ORGANISER_ROLES/s);
  assert.match(importsPage, /requireActiveUser\(\s*ALL_ORGANISER_ROLES/s);

  // Event isolation on history
  assert.match(historyRoute, /\.eq\("event_id",\s*eventRow\.id\)/);

  // Server revalidation before RPC and non-fatal post-commit audit handling
  assert.match(executeRoute, /validateImportBatch\(/);
  assert.match(executeRoute, /buildImportExecutionPlan\(/);
  assert.match(executeRoute, /registration_import\.initiated/);
  assert.match(executeRoute, /registration_import\.completed/);
  assert.match(executeRoute, /registration_import\.failed/);
  assert.match(executeRoute, /registration_import\.approved_updates_applied/);
  assert.match(executeRoute, /auditWarning/);

  // Auth policy denies inactive users
  const inactiveEval = evaluateOrganiserAccess({
    authUserId: "user-1",
    profile: {
      id: "user-1",
      full_name: "Inactive User",
      email: "inactive@sjcc.edu",
      role: "event_coordinator",
      scope_mode: "global",
      is_active: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    allowedRoles: ALL_ORGANISER_ROLES,
  });
  assert.equal(inactiveEval.ok, false);

  // Client bundle safety checks
  assert.equal(/server-only/.test(clientFile), false);
  assert.equal(/SUPABASE_SERVICE_ROLE_KEY/.test(clientFile), false);
  assert.equal(/window\.(alert|confirm|open)/.test(clientFile), false);
});

const CONTINGENT_A = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  contingent_code: "CTG-101",
  name: "Alpha Capital",
  institution_name: "Christ University",
  institution_city: "Bengaluru",
  external_registration_ref: "EXT-C-101",
  contact_email: "alpha@example.edu",
  contact_phone: null,
  is_active: true,
  notes: null,
};

const CONTINGENT_B = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
  contingent_code: "CTG-202",
  name: "Beta Ventures",
  institution_name: "St. Joseph's University",
  institution_city: "Bengaluru",
  external_registration_ref: "EXT-C-202",
  contact_email: "beta@example.edu",
  contact_phone: null,
  is_active: true,
  notes: null,
};

const PARTICIPANT_A = {
  id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
  contingent_id: CONTINGENT_A.id,
  participant_code: "P-101",
  full_name: "Aarav Nair",
  email: "aarav@example.edu",
  phone: null,
  institution_name: "Christ University",
  external_registration_ref: "EXT-P-101",
  is_contingent_lead: true,
  is_active: true,
};

const PARTICIPANT_B = {
  id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd2",
  contingent_id: CONTINGENT_A.id,
  participant_code: "P-202",
  full_name: "Diya Rao",
  email: "diya@example.edu",
  phone: null,
  institution_name: "Christ University",
  external_registration_ref: "EXT-P-202",
  is_contingent_lead: false,
  is_active: true,
};

test("Stage 2B.2 identity fix: contingent code and external ref resolving to different records triggers conflict and blocks execution", async () => {
  const cmsContext = {
    contingents: [CONTINGENT_A, CONTINGENT_B],
    participants: [],
    eventEntries: [],
  };

  // Row uses CTG-101 (CONTINGENT_A) paired with EXT-C-202 (CONTINGENT_B)
  const csv = [
    "Contingent Code,Contingent External Ref,Contingent Name,Institution,Participant Code,Participant Name,Email,Contingent Lead",
    "CTG-101,EXT-C-202,Alpha Capital,Christ University,P-901,Rohan Mehta,rohan@example.edu,Yes",
    "CTG-101,EXT-C-202,Alpha Capital,Christ University,P-902,Sana Khan,sana@example.edu,No",
  ].join("\n");

  const report = await parseCsvToReport(csv, CONTINGENT_EVENT, cmsContext);
  const resolutionContext = buildResolutionContext({ report, cmsContext });

  assert.equal(resolutionContext.identityConflicts.length, 2);
  assert.equal(resolutionContext.identityConflicts[0].entity, "contingent");
  assert.equal(resolutionContext.identityConflicts[0].rowNumber, 2);
  assert.match(resolutionContext.identityConflicts[0].message, /contingent_code/i);
  assert.match(resolutionContext.identityConflicts[0].message, /external_registration_ref/i);
  assert.match(resolutionContext.identityConflicts[0].message, /CTG-101/);
  assert.match(resolutionContext.identityConflicts[0].message, /CTG-202/);

  // Must NOT enter normal Reuse or Update workflow
  assert.equal(
    resolutionContext.matchedRecords.some((m) => m.entity === "contingent"),
    false,
  );

  // Authoritative server-side planner must reject execution even if client attempts to inject a resolution
  const planRes = buildImportExecutionPlan({
    report,
    cmsContext,
    selection: {
      entityResolutions: {
        [`contingent:${CONTINGENT_A.id}`]: { action: "reuse" },
        [`contingent:${CONTINGENT_B.id}`]: { action: "reuse" },
      },
      skippedRowNumbers: [],
    },
  });
  assert.equal(planRes.ok, false);
  assert.match(planRes.error, /contingent identity conflict/i);
  assert.match(planRes.error, /contingent_code/i);
  assert.match(planRes.error, /external_registration_ref/i);
});

test("Stage 2B.2 identity fix: participant code and email resolving to different records triggers conflict and blocks execution", async () => {
  const cmsContext = {
    contingents: [CONTINGENT_A],
    participants: [PARTICIPANT_A, PARTICIPANT_B],
    eventEntries: [],
  };

  // Row uses P-101 (PARTICIPANT_A) with diya@example.edu (PARTICIPANT_B)
  const csv = [
    "Participant Code,Participant Name,Email,Institution",
    "P-101,Aarav Nair,diya@example.edu,Christ University",
  ].join("\n");

  const report = await parseCsvToReport(csv, INDIVIDUAL_EVENT, cmsContext);
  const resolutionContext = buildResolutionContext({ report, cmsContext });

  assert.equal(resolutionContext.identityConflicts.length, 1);
  assert.equal(resolutionContext.identityConflicts[0].entity, "participant");
  assert.match(resolutionContext.identityConflicts[0].message, /participant_code/i);
  assert.match(resolutionContext.identityConflicts[0].message, /email/i);
  assert.match(resolutionContext.identityConflicts[0].message, /P-101/);
  assert.match(resolutionContext.identityConflicts[0].message, /P-202/);
  assert.equal(resolutionContext.matchedRecords.length, 0);

  const planRes = buildImportExecutionPlan({
    report,
    cmsContext,
    selection: { entityResolutions: {}, skippedRowNumbers: [] },
  });
  assert.equal(planRes.ok, false);
  assert.match(planRes.error, /participant identity conflict/i);
});

test("Stage 2B.2 identity fix: participant code and external ref resolving to different records triggers conflict and blocks execution", async () => {
  const cmsContext = {
    contingents: [CONTINGENT_A],
    participants: [PARTICIPANT_A, PARTICIPANT_B],
    eventEntries: [],
  };

  // Row uses P-101 (PARTICIPANT_A) with EXT-P-202 (PARTICIPANT_B)
  const csv = [
    "Participant Code,Participant External Ref,Participant Name,Institution",
    "P-101,EXT-P-202,Aarav Nair,Christ University",
  ].join("\n");

  const report = await parseCsvToReport(csv, INDIVIDUAL_EVENT, cmsContext);
  const resolutionContext = buildResolutionContext({ report, cmsContext });

  assert.equal(resolutionContext.identityConflicts.length, 1);
  assert.equal(resolutionContext.identityConflicts[0].entity, "participant");
  assert.match(resolutionContext.identityConflicts[0].message, /participant_code/i);
  assert.match(resolutionContext.identityConflicts[0].message, /external_registration_ref/i);
  assert.equal(resolutionContext.matchedRecords.length, 0);

  const planRes = buildImportExecutionPlan({
    report,
    cmsContext,
    selection: { entityResolutions: {}, skippedRowNumbers: [] },
  });
  assert.equal(planRes.ok, false);
  assert.match(planRes.error, /participant identity conflict/i);
});

test("Stage 2B.2 identity fix: email and external ref resolving to different participant records triggers conflict and blocks execution", async () => {
  const cmsContext = {
    contingents: [CONTINGENT_A],
    participants: [PARTICIPANT_A, PARTICIPANT_B],
    eventEntries: [],
  };

  // Row has brand new code P-999, but email matches PARTICIPANT_A and ext ref matches PARTICIPANT_B
  const csv = [
    "Participant Code,Participant External Ref,Participant Name,Email,Institution",
    "P-999,EXT-P-202,Mismatch Person,aarav@example.edu,Christ University",
  ].join("\n");

  const report = await parseCsvToReport(csv, INDIVIDUAL_EVENT, cmsContext);
  const resolutionContext = buildResolutionContext({ report, cmsContext });

  assert.equal(resolutionContext.identityConflicts.length, 1);
  assert.equal(resolutionContext.identityConflicts[0].entity, "participant");
  assert.match(resolutionContext.identityConflicts[0].message, /external_registration_ref/i);
  assert.match(resolutionContext.identityConflicts[0].message, /email/i);
  assert.equal(resolutionContext.matchedRecords.length, 0);

  const planRes = buildImportExecutionPlan({
    report,
    cmsContext,
    selection: { entityResolutions: {}, skippedRowNumbers: [] },
  });
  assert.equal(planRes.ok, false);
  assert.match(planRes.error, /participant identity conflict/i);
});

test("Stage 2B.2 identity fix: duplicate non-unique email matches across two CMS participants trigger conflict", async () => {
  const PARTICIPANT_SHARED_EMAIL = {
    ...PARTICIPANT_B,
    email: "aarav@example.edu",
  };
  const cmsContext = {
    contingents: [CONTINGENT_A],
    participants: [PARTICIPANT_A, PARTICIPANT_SHARED_EMAIL],
    eventEntries: [],
  };

  const csv = [
    "Participant Code,Participant Name,Email,Institution",
    "P-999,Shared Email Student,aarav@example.edu,Christ University",
  ].join("\n");

  const report = await parseCsvToReport(csv, INDIVIDUAL_EVENT, cmsContext);
  const resolutionContext = buildResolutionContext({ report, cmsContext });

  assert.equal(resolutionContext.identityConflicts.length, 1);
  assert.equal(resolutionContext.matchedRecords.length, 0);

  const planRes = buildImportExecutionPlan({
    report,
    cmsContext,
    selection: { entityResolutions: {}, skippedRowNumbers: [] },
  });
  assert.equal(planRes.ok, false);
  assert.match(planRes.error, /participant identity conflict/i);
});

test("Stage 2B.2 identity fix: all identifiers resolving consistently to the same record match normally", async () => {
  const cmsContext = {
    contingents: [CONTINGENT_A],
    participants: [PARTICIPANT_A, PARTICIPANT_B],
    eventEntries: [],
  };

  const csv = [
    "Contingent Code,Contingent External Ref,Contingent Name,Institution,Participant Code,Participant External Ref,Participant Name,Email,Contingent Lead",
    "ctg-101,ext-c-101,Alpha Capital,Christ University,p-101,ext-p-101,Aarav Nair,AARAV@example.edu,Yes",
    "CTG-101,EXT-C-101,Alpha Capital,Christ University,P-202,EXT-P-202,Diya Rao,diya@example.edu,No",
  ].join("\n");

  const report = await parseCsvToReport(csv, CONTINGENT_EVENT, cmsContext);
  const resolutionContext = buildResolutionContext({ report, cmsContext });

  assert.equal(resolutionContext.identityConflicts.length, 0);
  assert.equal(resolutionContext.matchedRecords.length, 3);

  const planRes = buildImportExecutionPlan({
    report,
    cmsContext,
    selection: {
      entityResolutions: {
        [`contingent:${CONTINGENT_A.id}`]: { action: "reuse" },
        [`participant:${PARTICIPANT_A.id}`]: { action: "reuse" },
        [`participant:${PARTICIPANT_B.id}`]: { action: "reuse" },
      },
      skippedRowNumbers: [],
    },
  });
  assert.equal(planRes.ok, true);
  assert.equal(planRes.plan.contingentOps[0].op, "reuse");
  assert.equal(planRes.plan.entryOps.length, 1);
  assert.equal(planRes.plan.entryOps[0].entry_type, "contingent");
  assert.equal(planRes.plan.preExecutionSummary.entriesToCreateCount, 1);
});

test("Stage 2B.2 identity fix: only one identifier matching (with missing or non-matching optional identifiers) matches cleanly without conflict", async () => {
  const cmsContext = {
    contingents: [CONTINGENT_A],
    participants: [PARTICIPANT_A],
    eventEntries: [],
  };

  // Row 1: contingent matches only by code (ext ref omitted/empty); participant matches only by email (new code + new ext ref)
  const csv = [
    "Contingent Code,Contingent External Ref,Contingent Name,Institution,Participant Code,Participant External Ref,Participant Name,Email,Contingent Lead",
    "CTG-101,,Alpha Capital,Christ University,P-NEW-1,EXT-NEW-1,Aarav Nair,aarav@example.edu,Yes",
    "CTG-101,,Alpha Capital,Christ University,P-NEW-2,,Vikram Joshi,vikram@example.edu,No",
  ].join("\n");

  const report = await parseCsvToReport(csv, CONTINGENT_EVENT, cmsContext);
  const resolutionContext = buildResolutionContext({ report, cmsContext });

  assert.equal(resolutionContext.identityConflicts.length, 0);
  assert.equal(resolutionContext.matchedRecords.length, 2);

  const contMatch = resolutionContext.matchedRecords.find(
    (m) => m.existingId === CONTINGENT_A.id,
  );
  const partMatch = resolutionContext.matchedRecords.find(
    (m) => m.existingId === PARTICIPANT_A.id,
  );
  assert.deepEqual(contMatch.matchedBy, ["contingent_code"]);
  assert.deepEqual(partMatch.matchedBy, ["email"]);

  const planRes = buildImportExecutionPlan({
    report,
    cmsContext,
    selection: {
      entityResolutions: {
        [`contingent:${CONTINGENT_A.id}`]: { action: "reuse" },
        [`participant:${PARTICIPANT_A.id}`]: { action: "reuse" },
      },
      skippedRowNumbers: [],
    },
  });
  assert.equal(planRes.ok, true);
});

test("Stage 2B.2 identity fix: no identifiers matching produces no conflicts and creates new records cleanly", async () => {
  const cmsContext = {
    contingents: [CONTINGENT_A],
    participants: [PARTICIPANT_A],
    eventEntries: [],
  };

  const csv = [
    "Contingent Code,Contingent External Ref,Contingent Name,Institution,Participant Code,Participant External Ref,Participant Name,Email,Contingent Lead",
    "CTG-999,EXT-C-999,Gamma Guild,Jain University,P-991,EXT-P-991,Kavya Iyer,kavya@example.edu,Yes",
    "CTG-999,EXT-C-999,Gamma Guild,Jain University,P-992,EXT-P-992,Nikhil Verma,nikhil@example.edu,No",
  ].join("\n");

  const report = await parseCsvToReport(csv, CONTINGENT_EVENT, cmsContext);
  const resolutionContext = buildResolutionContext({ report, cmsContext });

  assert.equal(resolutionContext.identityConflicts.length, 0);
  assert.equal(resolutionContext.matchedRecords.length, 0);

  const planRes = buildImportExecutionPlan({
    report,
    cmsContext,
    selection: { entityResolutions: {}, skippedRowNumbers: [] },
  });
  assert.equal(planRes.ok, true);
  assert.equal(planRes.plan.contingentOps.length, 1);
  assert.equal(planRes.plan.contingentOps[0].op, "create");
  assert.equal(planRes.plan.participantOps.length, 2);
});

test("Stage 2B.2 identity fix: skipping conflicted rows unblocks clean rows without modifying conflicted records, and UI enforces conflict blocking", async () => {
  const cmsContext = {
    contingents: [],
    participants: [PARTICIPANT_A, PARTICIPANT_B],
    eventEntries: [],
  };

  const csv = [
    "Participant Code,Participant Name,Email,Institution",
    "P-101,Aarav Nair,diya@example.edu,Christ University",
    "P-950,Clean Newcomer,clean@example.edu,Christ University",
  ].join("\n");

  const report = await parseCsvToReport(csv, INDIVIDUAL_EVENT, cmsContext);

  // Blocked while row 1 is active
  const blockedRes = buildImportExecutionPlan({
    report,
    cmsContext,
    selection: { entityResolutions: {}, skippedRowNumbers: [] },
  });
  assert.equal(blockedRes.ok, false);

  // Explicitly skipping conflicted row 2 (first CSV data row) allows clean row 3 without touching PARTICIPANT_A or PARTICIPANT_B
  const unblockedRes = buildImportExecutionPlan({
    report,
    cmsContext,
    selection: { entityResolutions: {}, skippedRowNumbers: [2] },
  });
  assert.equal(unblockedRes.ok, true);
  assert.equal(unblockedRes.plan.participantOps.length, 1);
  assert.equal(unblockedRes.plan.participantOps[0].participant_code, "P-950");
  assert.equal(unblockedRes.plan.entryOps.length, 1);

  // Verify client component guards against identityConflicts
  const clientFile = fs.readFileSync(
    path.join(ROOT_DIR, "src/components/imports/ImportPreparationClient.tsx"),
    "utf8",
  );
  assert.match(clientFile, /identityConflicts/);
  assert.match(clientFile, /remainingConflictCount/);
});

