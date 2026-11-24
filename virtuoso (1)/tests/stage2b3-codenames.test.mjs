import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  ALL_ORGANISER_ROLES,
  evaluateOrganiserAccess,
} from "../src/lib/auth/policy.ts";
import {
  CODENAME_ADJECTIVES,
  CODENAME_NOUNS,
  generateCandidateCodename,
  generateFallbackCodename,
  generateUniqueCodename,
} from "../src/lib/codenames/generator.ts";
import {
  classifyCodenameLoadError,
  isEntryEligibleForCodenameGeneration,
  normalizeCodename,
  planMissingCodenameAssignments,
  validateCodenameScope,
  validateManualCodename,
} from "../src/lib/codenames/validation.ts";

const ROOT_DIR = process.cwd();

const EVENT_WIDE_EVENT = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "FIN-2026",
  codename_mode: "event_wide",
  status: "active",
};

const PER_ROUND_EVENT = {
  id: "22222222-2222-4222-8222-222222222222",
  code: "BST-2026",
  codename_mode: "per_round",
  status: "active",
};

const ARCHIVED_EVENT = {
  id: "33333333-3333-4333-8333-333333333333",
  code: "ARC-2025",
  codename_mode: "event_wide",
  status: "archived",
};

const ROUND_1 = {
  id: "aaaa1111-1111-4111-8111-111111111111",
  event_id: PER_ROUND_EVENT.id,
  status: "ready",
};

const ROUND_2 = {
  id: "aaaa2222-2222-4222-8222-222222222222",
  event_id: PER_ROUND_EVENT.id,
  status: "draft",
};

const ARCHIVED_ROUND = {
  id: "aaaa3333-3333-4333-8333-333333333333",
  event_id: PER_ROUND_EVENT.id,
  status: "archived",
};

const OTHER_EVENT_ROUND = {
  id: "aaaa4444-4444-4444-8444-444444444444",
  event_id: EVENT_WIDE_EVENT.id,
  status: "draft",
};

const ENTRY_1 = {
  id: "eeee1111-1111-4111-8111-111111111111",
  event_id: EVENT_WIDE_EVENT.id,
  status: "registered",
};

const ENTRY_2 = {
  id: "eeee2222-2222-4222-8222-222222222222",
  event_id: EVENT_WIDE_EVENT.id,
  status: "checked_in",
};

const ENTRY_WITHDRAWN = {
  id: "eeee3333-3333-4333-8333-333333333333",
  event_id: EVENT_WIDE_EVENT.id,
  status: "withdrawn",
};

const ENTRY_DISQUALIFIED = {
  id: "eeee4444-4444-4444-8444-444444444444",
  event_id: EVENT_WIDE_EVENT.id,
  status: "disqualified",
};

test("Stage 2B.3 (1): event_wide mode assigns with null round_id and rejects round-specific scope", () => {
  const validScope = validateCodenameScope({
    eventId: EVENT_WIDE_EVENT.id,
    codenameMode: "event_wide",
    eventStatus: "active",
    roundId: null,
    round: null,
  });
  assert.equal(validScope.ok, true);
  if (validScope.ok) {
    assert.equal(validScope.value.codenameMode, "event_wide");
    assert.equal(validScope.value.roundId, null);
  }

  const badScope = validateCodenameScope({
    eventId: EVENT_WIDE_EVENT.id,
    codenameMode: "event_wide",
    eventStatus: "active",
    roundId: OTHER_EVENT_ROUND.id,
    round: OTHER_EVENT_ROUND,
  });
  assert.equal(badScope.ok, false);
  if (!badScope.ok) {
    assert.match(badScope.error, /Event-Wide/i);
  }

  const plan = planMissingCodenameAssignments({
    event: EVENT_WIDE_EVENT,
    round: null,
    entries: [ENTRY_1, ENTRY_2],
    existingAssignments: [],
  });
  assert.equal(plan.ok, true);
  if (plan.ok) {
    assert.equal(plan.scope.roundId, null);
    assert.equal(plan.assignmentsToInsert.length, 2);
    assert.notEqual(
      plan.assignmentsToInsert[0].codename,
      plan.assignmentsToInsert[1].codename,
    );
  }
});

test("Stage 2B.3 (2): per_round mode requires an event-owned round and isolates assignments per round", () => {
  const missingRound = validateCodenameScope({
    eventId: PER_ROUND_EVENT.id,
    codenameMode: "per_round",
    eventStatus: "active",
    roundId: null,
    round: null,
  });
  assert.equal(missingRound.ok, false);

  const foreignRound = validateCodenameScope({
    eventId: PER_ROUND_EVENT.id,
    codenameMode: "per_round",
    eventStatus: "active",
    roundId: OTHER_EVENT_ROUND.id,
    round: OTHER_EVENT_ROUND,
  });
  assert.equal(foreignRound.ok, false);
  if (!foreignRound.ok) {
    assert.match(foreignRound.error, /does not belong/i);
  }

  const prEntry1 = { ...ENTRY_1, event_id: PER_ROUND_EVENT.id };
  const prEntry2 = { ...ENTRY_2, event_id: PER_ROUND_EVENT.id };

  const existingRound1 = [
    {
      event_id: PER_ROUND_EVENT.id,
      event_entry_id: prEntry1.id,
      round_id: ROUND_1.id,
      codename: "AMBER-FALCON-24",
    },
  ];

  // Round 1 skips prEntry1 and assigns prEntry2 without reusing Round 1's existing codename
  const r1Plan = planMissingCodenameAssignments({
    event: PER_ROUND_EVENT,
    round: ROUND_1,
    entries: [prEntry1, prEntry2],
    existingAssignments: existingRound1,
  });
  assert.equal(r1Plan.ok, true);
  if (r1Plan.ok) {
    assert.equal(r1Plan.scope.roundId, ROUND_1.id);
    assert.equal(r1Plan.skippedAlreadyAssignedCount, 1);
    assert.equal(r1Plan.assignmentsToInsert.length, 1);
    assert.equal(r1Plan.assignmentsToInsert[0].event_entry_id, prEntry2.id);
    assert.notEqual(
      r1Plan.assignmentsToInsert[0].codename,
      "AMBER-FALCON-24",
    );
  }

  // Round 2 is an independent scope, so both prEntry1 and prEntry2 are unassigned in Round 2
  const r2Plan = planMissingCodenameAssignments({
    event: PER_ROUND_EVENT,
    round: ROUND_2,
    entries: [prEntry1, prEntry2],
    existingAssignments: existingRound1,
  });
  assert.equal(r2Plan.ok, true);
  if (r2Plan.ok) {
    assert.equal(r2Plan.scope.roundId, ROUND_2.id);
    assert.equal(r2Plan.skippedAlreadyAssignedCount, 0);
    assert.equal(r2Plan.assignmentsToInsert.length, 2);
  }
});

test("Stage 2B.3 (3): supports contingent and individual entries while skipping withdrawn/disqualified entries", () => {
  assert.equal(isEntryEligibleForCodenameGeneration("registered"), true);
  assert.equal(isEntryEligibleForCodenameGeneration("checked_in"), true);
  assert.equal(isEntryEligibleForCodenameGeneration("withdrawn"), false);
  assert.equal(isEntryEligibleForCodenameGeneration("disqualified"), false);

  const contingentEntry = { ...ENTRY_1, status: "registered" };
  const individualEntry = { ...ENTRY_2, status: "checked_in" };

  const plan = planMissingCodenameAssignments({
    event: EVENT_WIDE_EVENT,
    round: null,
    entries: [
      contingentEntry,
      individualEntry,
      ENTRY_WITHDRAWN,
      ENTRY_DISQUALIFIED,
    ],
    existingAssignments: [],
  });

  assert.equal(plan.ok, true);
  if (plan.ok) {
    assert.equal(plan.assignmentsToInsert.length, 2);
    assert.equal(plan.skippedIneligibleCount, 2);
    assert.deepEqual(
      plan.assignmentsToInsert.map((a) => a.event_entry_id),
      [contingentEntry.id, individualEntry.id],
    );
  }
});

test("Stage 2B.3 (4): generates neutral, format-valid, collision-free codenames", () => {
  assert.ok(CODENAME_ADJECTIVES.length >= 40);
  assert.ok(CODENAME_NOUNS.length >= 40);

  for (let i = 0; i < 40; i += 1) {
    const primary = generateCandidateCodename();
    const valid = validateManualCodename(primary);
    assert.equal(valid.ok, true, `Generated invalid primary codename: ${primary}`);
    assert.match(primary, /^[A-Z]+-[A-Z]+-[2-9]{2}$/);

    const fallback = generateFallbackCodename();
    const fallbackValid = validateManualCodename(fallback);
    assert.equal(
      fallbackValid.ok,
      true,
      `Generated invalid fallback codename: ${fallback}`,
    );
  }

  // Simulate deterministic candidate collision before producing unique output
  const sequence = ["AMBER-FALCON-24", "AMBER-FALCON-24", "COBALT-BEACON-37"];
  let idx = 0;
  const plan = planMissingCodenameAssignments({
    event: EVENT_WIDE_EVENT,
    round: null,
    entries: [ENTRY_2],
    existingAssignments: [
      {
        event_id: EVENT_WIDE_EVENT.id,
        event_entry_id: ENTRY_1.id,
        round_id: null,
        codename: "amber-falcon-24", // lowercase in input tests normalization
      },
    ],
    generateCandidate: () => {
      const value = sequence[idx] ?? "SILVER-OTTER-58";
      idx += 1;
      return value;
    },
  });

  assert.equal(plan.ok, true);
  if (plan.ok) {
    assert.equal(plan.assignmentsToInsert.length, 1);
    assert.equal(plan.assignmentsToInsert[0].codename, "COBALT-BEACON-37");
  }

  // Uniqueness helper avoids already-used values across a large batch
  const used = new Set();
  for (let i = 0; i < 250; i += 1) {
    const next = generateUniqueCodename(used);
    assert.equal(used.has(next), false);
    used.add(next);
  }
  assert.equal(used.size, 250);
});

test("Stage 2B.3 (5): enforces database-level concurrency locking, unique indexes, and 23505 retry safety", () => {
  const migrationSql = fs.readFileSync(
    path.join(ROOT_DIR, "supabase/migrations/202611200005_stage2b3_codenames.sql"),
    "utf8",
  );
  const actionsSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/actions/codenames.ts"),
    "utf8",
  );

  // Advisory locks & row-level locks in DB RPCs
  assert.match(migrationSql, /pg_advisory_xact_lock\(/);
  assert.match(migrationSql, /CREATE UNIQUE INDEX IF NOT EXISTS entry_codenames_event_wide_entry_uidx/);
  assert.match(migrationSql, /CREATE UNIQUE INDEX IF NOT EXISTS entry_codenames_per_round_entry_uidx/);
  assert.match(migrationSql, /CREATE UNIQUE INDEX IF NOT EXISTS entry_codenames_event_wide_code_uidx/);
  assert.match(migrationSql, /CREATE UNIQUE INDEX IF NOT EXISTS entry_codenames_per_round_code_uidx/);
  assert.match(migrationSql, /CREATE OR REPLACE FUNCTION public\.assign_event_codenames/);
  assert.match(migrationSql, /CREATE OR REPLACE FUNCTION public\.upsert_entry_codename/);

  // Server action retries cleanly on unique constraint race (23505)
  assert.match(actionsSource, /rpcErr\.code === "23505" && attempt < maxRetries/);
  assert.match(actionsSource, /supabase\.rpc\(\s*"assign_event_codenames"/);
  assert.match(actionsSource, /supabase\.rpc\(\s*"upsert_entry_codename"/);
});

test("Stage 2B.3 (6): preserves existing assignments and requires explicit overwrite confirmation", () => {
  const existing = [
    {
      event_id: EVENT_WIDE_EVENT.id,
      event_entry_id: ENTRY_1.id,
      round_id: null,
      codename: "GOLD-HERON-42",
    },
  ];

  // Batch planner preserves existing assignments and only schedules ENTRY_2
  const plan = planMissingCodenameAssignments({
    event: EVENT_WIDE_EVENT,
    round: null,
    entries: [ENTRY_1, ENTRY_2],
    existingAssignments: existing,
  });
  assert.equal(plan.ok, true);
  if (plan.ok) {
    assert.equal(plan.skippedAlreadyAssignedCount, 1);
    assert.equal(plan.assignmentsToInsert.length, 1);
    assert.equal(plan.assignmentsToInsert[0].event_entry_id, ENTRY_2.id);
    assert.notEqual(plan.assignmentsToInsert[0].codename, "GOLD-HERON-42");
  }

  const migrationSql = fs.readFileSync(
    path.join(ROOT_DIR, "supabase/migrations/202611200005_stage2b3_codenames.sql"),
    "utf8",
  );
  const actionsSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/actions/codenames.ts"),
    "utf8",
  );
  const uiSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/components/competition/CodenamesManager.tsx"),
    "utf8",
  );

  // DB preserves existing assignments in batch RPC & rejects unconfirmed overwrite in upsert RPC
  assert.match(migrationSql, /v_skipped_existing_count := v_skipped_existing_count \+ 1/);
  assert.match(
    migrationSql,
    /IF NOT COALESCE\(p_allow_overwrite, false\) THEN\s+RAISE EXCEPTION/,
  );
  // Changing codename_mode is blocked while codename assignments exist
  assert.match(
    migrationSql,
    /CREATE TRIGGER protect_event_codename_mode/,
  );

  // Server action strictly enforces confirmOverwrite for corrections
  assert.match(actionsSource, /formData\.get\("confirmOverwrite"\)/);
  assert.match(
    actionsSource,
    /Explicit confirmation is required before overwriting an existing codename/,
  );

  // UI includes explicit confirmOverwrite checkbox and never offers bulk regenerate/overwrite
  assert.match(uiSource, /name="confirmOverwrite"/);
  assert.doesNotMatch(uiSource, /Regenerate All|Overwrite All|Reset Codenames/i);
});

test("Stage 2B.3 (7): validates manual codenames and records atomic transactional audit logs inside RPCs", () => {
  assert.equal(normalizeCodename("  amber-falcon-24 "), "AMBER-FALCON-24");

  const valid = validateManualCodename("  cobalt-beacon-88 ");
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.value, "COBALT-BEACON-88");
  }

  assert.equal(validateManualCodename("ABC").ok, false); // too short
  assert.equal(validateManualCodename("AMBER--FALCON").ok, false); // double hyphen
  assert.equal(validateManualCodename("-AMBER-24").ok, false); // leading hyphen
  assert.equal(validateManualCodename("AMBER 24").ok, false); // space
  assert.equal(validateManualCodename("A".repeat(41)).ok, false); // >40 chars

  const migrationSql = fs.readFileSync(
    path.join(ROOT_DIR, "supabase/migrations/202611200005_stage2b3_codenames.sql"),
    "utf8",
  );
  const actionsSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/actions/codenames.ts"),
    "utf8",
  );

  // Audit logs are inserted atomically inside the PostgreSQL SECURITY DEFINER RPCs
  assert.match(migrationSql, /INSERT INTO public\.audit_logs/);
  assert.match(migrationSql, /'codename\.batch_assigned'/);
  assert.match(migrationSql, /'codename\.manual_assigned'/);
  assert.match(migrationSql, /'codename\.corrected'/);
  assert.match(migrationSql, /'confirmed_overwrite', true/);
  assert.match(migrationSql, /'confirmed_overwrite', false/);
  assert.match(migrationSql, /auth\.uid\(\)/);

  // Redundant post-commit JS recordAuditLog call removed so failures roll back atomically in Postgres
  assert.doesNotMatch(actionsSource, /recordAuditLog\(/);
});

test("Stage 2B.3 (8): blocks unauthenticated, pending, inactive, and unauthorised access", () => {
  const makeProfile = (overrides = {}) => ({
    id: "user-1",
    email: "organiser@example.edu",
    full_name: "Organiser User",
    role: "event_coordinator",
    scope_mode: "all",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  });

  const unauth = evaluateOrganiserAccess({
    authUserId: null,
    profile: null,
    allowedRoles: ALL_ORGANISER_ROLES,
  });
  assert.equal(unauth.ok, false);
  if (!unauth.ok) assert.equal(unauth.reason, "unauthenticated");

  const pending = evaluateOrganiserAccess({
    authUserId: "user-1",
    profile: makeProfile({ role: "pending_approval" }),
    allowedRoles: ALL_ORGANISER_ROLES,
  });
  assert.equal(pending.ok, false);
  if (!pending.ok) assert.equal(pending.reason, "forbidden");

  const inactive = evaluateOrganiserAccess({
    authUserId: "user-1",
    profile: makeProfile({ is_active: false }),
    allowedRoles: ALL_ORGANISER_ROLES,
  });
  assert.equal(inactive.ok, false);
  if (!inactive.ok) assert.equal(inactive.reason, "inactive");

  const coordinator = evaluateOrganiserAccess({
    authUserId: "user-1",
    profile: makeProfile({ role: "event_coordinator", is_active: true }),
    allowedRoles: ALL_ORGANISER_ROLES,
  });
  assert.equal(coordinator.ok, true);

  const superAdmin = evaluateOrganiserAccess({
    authUserId: "user-1",
    profile: makeProfile({ role: "super_admin", is_active: true }),
    allowedRoles: ALL_ORGANISER_ROLES,
  });
  assert.equal(superAdmin.ok, true);

  const pageSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/events/[eventId]/codenames/page.tsx"),
    "utf8",
  );
  const actionsSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/actions/codenames.ts"),
    "utf8",
  );

  assert.match(pageSource, /requireActiveUser\(ALL_ORGANISER_ROLES/);
  assert.match(actionsSource, /requireActiveUserForAction\(ALL_ORGANISER_ROLES/);
});

test("Stage 2B.3 (9): enforces RLS, zero anon exposure, and cross-event isolation", () => {
  // Planner rejects entries from another event
  const crossEventPlan = planMissingCodenameAssignments({
    event: EVENT_WIDE_EVENT,
    round: null,
    entries: [
      ENTRY_1,
      { ...ENTRY_2, event_id: PER_ROUND_EVENT.id },
    ],
    existingAssignments: [],
  });
  assert.equal(crossEventPlan.ok, false);
  if (!crossEventPlan.ok) {
    assert.match(crossEventPlan.error, /Cross-event entry/i);
  }

  const migrationSql = fs.readFileSync(
    path.join(ROOT_DIR, "supabase/migrations/202611200005_stage2b3_codenames.sql"),
    "utf8",
  );
  assert.match(migrationSql, /REVOKE ALL ON public\.entry_codenames FROM anon/);
  assert.match(
    migrationSql,
    /REVOKE INSERT, UPDATE, DELETE ON public\.entry_codenames FROM authenticated/,
  );
  assert.match(
    migrationSql,
    /DROP POLICY IF EXISTS entry_codenames_insert_active_organiser ON public\.entry_codenames/,
  );
  assert.match(
    migrationSql,
    /DROP POLICY IF EXISTS entry_codenames_update_active_organiser ON public\.entry_codenames/,
  );
  assert.match(migrationSql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migrationSql, /public\.is_active_organiser\(\)/);
  assert.match(
    migrationSql,
    /GRANT EXECUTE ON FUNCTION public\.assign_event_codenames\(uuid, uuid, jsonb\) TO authenticated/,
  );
  assert.match(
    migrationSql,
    /GRANT EXECUTE ON FUNCTION public\.upsert_entry_codename\(uuid, uuid, uuid, text, boolean, text\) TO authenticated/,
  );
  assert.match(
    migrationSql,
    /FOREIGN KEY \(event_entry_id, event_id\)\s+REFERENCES public\.event_entries \(id, event_id\)/,
  );
  assert.match(
    migrationSql,
    /FOREIGN KEY \(round_id, event_id\)\s+REFERENCES public\.rounds \(id, event_id\)/,
  );

  // Client component never leaks server secrets or queries audit_logs directly
  const clientUi = fs.readFileSync(
    path.join(ROOT_DIR, "src/components/competition/CodenamesManager.tsx"),
    "utf8",
  );
  const pageSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/events/[eventId]/codenames/page.tsx"),
    "utf8",
  );
  assert.doesNotMatch(clientUi, /SUPABASE_SERVICE_ROLE_KEY|server-only|createSupabaseAdminClient/);
  assert.doesNotMatch(pageSource, /\.from\(["']audit_logs["']\)/);
});

test("Stage 2B.3 (10): rejects invalid/archived scopes and preserves strict Stage 2B.3 boundaries", () => {
  const archivedEventScope = validateCodenameScope({
    eventId: ARCHIVED_EVENT.id,
    codenameMode: "event_wide",
    eventStatus: "archived",
    roundId: null,
    round: null,
  });
  assert.equal(archivedEventScope.ok, false);
  if (!archivedEventScope.ok) {
    assert.match(archivedEventScope.error, /archived event/i);
  }

  const archivedRoundScope = validateCodenameScope({
    eventId: PER_ROUND_EVENT.id,
    codenameMode: "per_round",
    eventStatus: "active",
    roundId: ARCHIVED_ROUND.id,
    round: ARCHIVED_ROUND,
  });
  assert.equal(archivedRoundScope.ok, false);
  if (!archivedRoundScope.ok) {
    assert.match(archivedRoundScope.error, /archived round/i);
  }

  const invalidModeScope = validateCodenameScope({
    eventId: EVENT_WIDE_EVENT.id,
    codenameMode: "invalid_mode",
    eventStatus: "active",
    roundId: null,
    round: null,
  });
  assert.equal(invalidModeScope.ok, false);

  // Verify migration 0005 stays strictly within Stage 2B.3 boundaries
  const migrationSql = fs.readFileSync(
    path.join(ROOT_DIR, "supabase/migrations/202611200005_stage2b3_codenames.sql"),
    "utf8",
  );
  assert.doesNotMatch(
    migrationSql,
    /CREATE TABLE[^;]*(scores|advancement|results|tie_break|registration_imports)/i,
  );
  assert.doesNotMatch(
    migrationSql,
    /ALTER TABLE\s+public\.registration_imports/i,
  );
});

test("Stage 2B.3 (11): enforces archived checks on both INSERT and UPDATE and rejects consecutive hyphens in SQL & TS", () => {
  const migrationSql = fs.readFileSync(
    path.join(ROOT_DIR, "supabase/migrations/202611200005_stage2b3_codenames.sql"),
    "utf8",
  );

  // Trigger rejects archived events and archived rounds for both INSERT and UPDATE
  assert.doesNotMatch(migrationSql, /TG_OP = 'INSERT' AND v_event_status = 'archived'/);
  assert.doesNotMatch(migrationSql, /TG_OP = 'INSERT' AND v_round_status = 'archived'/);
  assert.match(migrationSql, /IF v_event_status = 'archived' THEN/);
  assert.match(migrationSql, /IF v_round_status = 'archived' THEN/);

  // SQL constraint and both RPCs reject consecutive hyphens '--'
  assert.match(migrationSql, /AND trim\(codename\) !~ '--'/);
  assert.match(migrationSql, /OR v_codename ~ '--'/);
  assert.match(migrationSql, /OR v_clean_codename ~ '--'/);

  // TS validator rejects consecutive hyphens
  assert.equal(validateManualCodename("AMBER--FALCON-24").ok, false);
  assert.equal(validateManualCodename("AMBER-FALCON-24").ok, true);
});

test("Stage 2B.3 (12): distinguishes missing-migration errors (42P01/PGRST205) from other DB errors", () => {
  assert.equal(classifyCodenameLoadError(null), "none");
  assert.equal(classifyCodenameLoadError({ code: "42P01", message: "relation does not exist" }), "migration_missing");
  assert.equal(classifyCodenameLoadError({ code: "PGRST205", message: "schema cache" }), "migration_missing");
  assert.equal(classifyCodenameLoadError({ code: "42501", message: "permission denied" }), "load_error");
  assert.equal(classifyCodenameLoadError({ code: "57014", message: "statement timeout" }), "load_error");
  assert.equal(classifyCodenameLoadError({ message: "fetch failed" }), "load_error");

  const pageSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/events/[eventId]/codenames/page.tsx"),
    "utf8",
  );
  assert.match(pageSource, /classifyCodenameLoadError/);
  assert.match(pageSource, /errorKind === "migration_missing"/);
});

test("Stage 2B.3 (13): codename adjective and noun vocabularies are disjoint so identical words never pair", () => {
  const adjectiveSet = new Set(CODENAME_ADJECTIVES);
  const nounSet = new Set(CODENAME_NOUNS);

  assert.equal(adjectiveSet.size, CODENAME_ADJECTIVES.length);
  assert.equal(nounSet.size, CODENAME_NOUNS.length);

  for (const adj of adjectiveSet) {
    assert.equal(
      nounSet.has(adj),
      false,
      `Vocabulary overlap detected for "${adj}"`,
    );
  }

  for (let i = 0; i < 100; i += 1) {
    const primary = generateCandidateCodename();
    const [pAdj, pNoun] = primary.split("-");
    assert.notEqual(pAdj, pNoun);

    const fallback = generateFallbackCodename();
    const [fAdj, fNoun] = fallback.split("-");
    assert.notEqual(fAdj, fNoun);
  }
});

test("Stage 2B.3 (14): handles generator exhaustion cleanly without throwing or modifying existing assignments", () => {
  const existing = [
    {
      event_id: EVENT_WIDE_EVENT.id,
      event_entry_id: ENTRY_1.id,
      round_id: null,
      codename: "GOLD-HERON-42",
    },
  ];

  // Exhausted generator throws Error inside candidateFn -> structured failure returned cleanly
  const exhaustedPlan = planMissingCodenameAssignments({
    event: EVENT_WIDE_EVENT,
    round: null,
    entries: [ENTRY_1, ENTRY_2],
    existingAssignments: existing,
    generateCandidate: () => {
      throw new Error("Unable to generate a unique codename after maximum collision retries.");
    },
  });

  assert.equal(exhaustedPlan.ok, false);
  if (!exhaustedPlan.ok) {
    assert.match(exhaustedPlan.error, /Unable to generate a unique codename/i);
  }

  // Repeated collisions across all 25 attempts also return structured error
  const collidingPlan = planMissingCodenameAssignments({
    event: EVENT_WIDE_EVENT,
    round: null,
    entries: [ENTRY_1, ENTRY_2],
    existingAssignments: existing,
    generateCandidate: () => "GOLD-HERON-42",
  });

  assert.equal(collidingPlan.ok, false);
  if (!collidingPlan.ok) {
    assert.match(collidingPlan.error, /without collision/i);
  }
});

test("Stage 2B.3 (15): migration 0006 eliminates unassigned v_round access in audit logging while preserving security and grants", () => {
  const migration0006Path = path.join(
    ROOT_DIR,
    "supabase/migrations/202611210006_fix_event_wide_codename_functions.sql",
  );
  const migration0006Sql = fs.readFileSync(migration0006Path, "utf8");

  // Isolate both function bodies cleanly
  const fnSplitToken = "CREATE OR REPLACE FUNCTION public.upsert_entry_codename(";
  const splitIdx = migration0006Sql.indexOf(fnSplitToken);
  assert.ok(splitIdx > 0, "Expected both functions in migration 0006");

  const assignFnSql = migration0006Sql.slice(0, splitIdx);
  const upsertFnSql = migration0006Sql.slice(splitIdx);

  // Exact signatures & security attributes preserved
  assert.match(
    assignFnSql,
    /CREATE OR REPLACE FUNCTION public\.assign_event_codenames\(\s*p_event_id uuid,\s*p_round_id uuid DEFAULT NULL,\s*p_assignments jsonb DEFAULT '\[\]'::jsonb\s*\)\s*RETURNS jsonb\s*LANGUAGE plpgsql\s*SECURITY DEFINER\s*SET search_path = public/i,
  );
  assert.match(
    upsertFnSql,
    /CREATE OR REPLACE FUNCTION public\.upsert_entry_codename\(\s*p_event_id uuid,\s*p_round_id uuid,\s*p_event_entry_id uuid,\s*p_codename text,\s*p_allow_overwrite boolean DEFAULT false,\s*p_notes text DEFAULT NULL\s*\)\s*RETURNS jsonb\s*LANGUAGE plpgsql\s*SECURITY DEFINER\s*SET search_path = public/i,
  );

  for (const [label, fnSql] of [
    ["assign_event_codenames", assignFnSql],
    ["upsert_entry_codename", upsertFnSql],
  ]) {
    // Declares v_round_number initialized to NULL
    assert.match(
      fnSql,
      /v_round_number integer := NULL;/,
      `${label} must declare v_round_number integer := NULL`,
    );

    // Populates v_round_number inside per_round branch and preserves archived round check
    assert.match(
      fnSql,
      /ELSIF v_event\.codename_mode = 'per_round' THEN[\s\S]*INTO v_round[\s\S]*IF NOT FOUND THEN[\s\S]*v_round_number := v_round\.round_number;[\s\S]*IF v_round\.status = 'archived' THEN/,
      `${label} must populate v_round_number after SELECT INTO v_round and preserve archived check`,
    );

    // Never uses the broken CASE WHEN p_round_id IS NOT NULL THEN v_round.round_number pattern
    assert.doesNotMatch(
      fnSql,
      /CASE\s+WHEN\s+p_round_id\s+IS\s+NOT\s+NULL\s+THEN\s+v_round\.round_number/i,
      `${label} must not reference v_round.round_number inside CASE`,
    );

    // Never references v_round.* anywhere after the per_round IF/ELSIF/END IF block
    const perRoundEndIdx = fnSql.indexOf("RAISE EXCEPTION 'Unsupported codename mode';");
    assert.ok(perRoundEndIdx > 0, `${label} must keep unsupported codename mode guard`);
    const postScopeSql = fnSql.slice(perRoundEndIdx);
    assert.doesNotMatch(
      postScopeSql,
      /\bv_round\./,
      `${label} must not reference unassigned v_round record after scope resolution`,
    );
  }

  // All three audit_logs inserts use v_round_number
  const auditRoundMatches = migration0006Sql.match(/'round_number',\s*v_round_number/g) ?? [];
  assert.equal(auditRoundMatches.length, 3);
  assert.match(migration0006Sql, /'codename\.batch_assigned'/);
  assert.match(migration0006Sql, /'codename\.corrected'/);
  assert.match(migration0006Sql, /'codename\.manual_assigned'/);

  // Migration 0006 does not alter grants, RLS, or tables
  assert.doesNotMatch(migration0006Sql, /\b(GRANT|REVOKE|CREATE POLICY|DROP POLICY|ALTER TABLE|CREATE TABLE)\b/i);
});

test("Stage 2B.3 (16): regression — event_wide batch, manual assignment, and correction contracts pass with null round_id", () => {
  const scope = validateCodenameScope({
    eventId: EVENT_WIDE_EVENT.id,
    codenameMode: "event_wide",
    eventStatus: "active",
    roundId: null,
    round: null,
  });
  assert.equal(scope.ok, true);
  if (scope.ok) {
    assert.equal(scope.value.roundId, null);
  }

  const batchPlan = planMissingCodenameAssignments({
    event: EVENT_WIDE_EVENT,
    round: null,
    entries: [ENTRY_1, ENTRY_2, ENTRY_WITHDRAWN],
    existingAssignments: [
      {
        event_id: EVENT_WIDE_EVENT.id,
        event_entry_id: ENTRY_1.id,
        round_id: null,
        codename: "SILVER-LUTE-12",
      },
    ],
  });
  assert.equal(batchPlan.ok, true);
  if (batchPlan.ok) {
    assert.equal(batchPlan.assignmentsToInsert.length, 1);
    assert.equal(batchPlan.assignmentsToInsert[0].event_entry_id, ENTRY_2.id);
    assert.equal(batchPlan.skippedAlreadyAssignedCount, 1);
    assert.notEqual(batchPlan.assignmentsToInsert[0].codename, "SILVER-LUTE-12");
  }

  const manualCheck = validateManualCodename("  cobalt-harp-88  ");
  assert.equal(manualCheck.ok, true);
  if (manualCheck.ok) {
    assert.equal(manualCheck.value, "COBALT-HARP-88");
  }

  const actionsSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/actions/codenames.ts"),
    "utf8",
  );
  assert.match(actionsSource, /supabase\.rpc\(\s*"assign_event_codenames"/);
  assert.match(actionsSource, /p_round_id:\s*scopeCheck\.value\.roundId/);
  assert.match(actionsSource, /supabase\.rpc\(\s*"upsert_entry_codename"/);
  assert.match(actionsSource, /p_allow_overwrite:\s*isCorrection/);
});

test("Stage 2B.3 (17): regression — per_round batch, manual assignment, and correction remain round-scoped", () => {
  const validRoundScope = validateCodenameScope({
    eventId: PER_ROUND_EVENT.id,
    codenameMode: "per_round",
    eventStatus: "active",
    roundId: ROUND_1.id,
    round: ROUND_1,
  });
  assert.equal(validRoundScope.ok, true);
  if (validRoundScope.ok) {
    assert.equal(validRoundScope.value.roundId, ROUND_1.id);
  }

  const archivedRoundScope = validateCodenameScope({
    eventId: PER_ROUND_EVENT.id,
    codenameMode: "per_round",
    eventStatus: "active",
    roundId: ARCHIVED_ROUND.id,
    round: ARCHIVED_ROUND,
  });
  assert.equal(archivedRoundScope.ok, false);

  const crossEventRoundScope = validateCodenameScope({
    eventId: PER_ROUND_EVENT.id,
    codenameMode: "per_round",
    eventStatus: "active",
    roundId: OTHER_EVENT_ROUND.id,
    round: OTHER_EVENT_ROUND,
  });
  assert.equal(crossEventRoundScope.ok, false);

  const roundEntry1 = {
    id: ENTRY_1.id,
    event_id: PER_ROUND_EVENT.id,
    status: "registered",
  };
  const roundEntry2 = {
    id: ENTRY_2.id,
    event_id: PER_ROUND_EVENT.id,
    status: "checked_in",
  };

  const perRoundPlan = planMissingCodenameAssignments({
    event: PER_ROUND_EVENT,
    round: ROUND_1,
    entries: [roundEntry1, roundEntry2],
    existingAssignments: [
      {
        event_id: PER_ROUND_EVENT.id,
        event_entry_id: roundEntry1.id,
        round_id: ROUND_1.id,
        codename: "AMBER-REED-19",
      },
      {
        event_id: PER_ROUND_EVENT.id,
        event_entry_id: roundEntry2.id,
        round_id: ROUND_2.id,
        codename: "IVORY-BELL-44",
      },
    ],
  });
  assert.equal(perRoundPlan.ok, true);
  if (perRoundPlan.ok) {
    // ENTRY_2 only has an assignment in ROUND_2, so it still gets assigned in ROUND_1
    assert.equal(perRoundPlan.assignmentsToInsert.length, 1);
    assert.equal(perRoundPlan.assignmentsToInsert[0].event_entry_id, roundEntry2.id);
    assert.equal(perRoundPlan.skippedAlreadyAssignedCount, 1);
  }
});

