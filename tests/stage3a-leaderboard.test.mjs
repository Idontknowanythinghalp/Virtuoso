import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  ALL_ORGANISER_ROLES,
  evaluateOrganiserAccess,
} from "../src/lib/auth/policy.ts";
import * as leaderboardValidation from "../src/lib/leaderboard/validation.ts";

const {
  classifyLeaderboardLoadError,
  countPositionOccurrences,
  isLeaderboardEventReadOnly,
  sortLeaderboardEntries,
  validateLeaderboardCreateInput,
  validateLeaderboardDisplayValue,
  validateLeaderboardPosition,
  validateLeaderboardUpdateInput,
  validateOptionalNotes,
} = leaderboardValidation;

const ROOT_DIR = process.cwd();

const EVENT_A = "11111111-1111-4111-8111-111111111111";
const CONTINGENT_1 = "cccc1111-1111-4111-8111-111111111111";
const CONTINGENT_2 = "cccc2222-2222-4222-8222-222222222222";
const ENTRY_1 = "eeee1111-1111-4111-8111-111111111111";
const ENTRY_2 = "eeee2222-2222-4222-8222-222222222222";
const ENTRY_3 = "eeee3333-3333-4333-8333-333333333333";

// ============================================================================
// EXECUTED UNIT TESTS (run directly against compiled/loaded TypeScript modules)
// ============================================================================

test("Stage 3A (1) [Executed]: Organiser permissions allow super_admin and event_coordinator and block pending/inactive profiles", () => {
  assert.deepEqual(ALL_ORGANISER_ROLES, ["super_admin", "event_coordinator"]);

  const baseProfile = {
    id: "00000000-0000-4000-8000-000000000001",
    full_name: "Test Organiser",
    email: "organiser@virtuoso.test",
    scope_mode: "all_events",
    created_at: "2026-11-22T00:00:00Z",
    updated_at: "2026-11-22T00:00:00Z",
  };

  assert.equal(
    evaluateOrganiserAccess({
      authUserId: baseProfile.id,
      profile: { ...baseProfile, role: "super_admin", is_active: true },
      allowedRoles: ALL_ORGANISER_ROLES,
    }).ok,
    true,
  );
  assert.equal(
    evaluateOrganiserAccess({
      authUserId: baseProfile.id,
      profile: { ...baseProfile, role: "event_coordinator", is_active: true },
      allowedRoles: ALL_ORGANISER_ROLES,
    }).ok,
    true,
  );
  assert.equal(
    evaluateOrganiserAccess({
      authUserId: baseProfile.id,
      profile: { ...baseProfile, role: "pending", is_active: true },
      allowedRoles: ALL_ORGANISER_ROLES,
    }).ok,
    false,
  );
  assert.equal(
    evaluateOrganiserAccess({
      authUserId: baseProfile.id,
      profile: { ...baseProfile, role: "event_coordinator", is_active: false },
      allowedRoles: ALL_ORGANISER_ROLES,
    }).ok,
    false,
  );
});

test("Stage 3A (2) [Executed]: Position validation enforces whole integers between 1 and 10,000", () => {
  assert.deepEqual(validateLeaderboardPosition("1"), { ok: true, value: 1 });
  assert.deepEqual(validateLeaderboardPosition(25), { ok: true, value: 25 });
  assert.deepEqual(validateLeaderboardPosition(" 10000 "), {
    ok: true,
    value: 10000,
  });

  for (const invalid of ["", "0", "-1", "1.5", "10001", "first", "1a"]) {
    const res = validateLeaderboardPosition(invalid);
    assert.equal(res.ok, false, `Expected "${invalid}" to be rejected`);
  }
});

test("Stage 3A (3) [Executed]: Flexible displayed value validation accepts formatted points/currency strings and rejects invalid lengths", () => {
  assert.deepEqual(validateLeaderboardDisplayValue("950 points"), {
    ok: true,
    value: "950 points",
  });
  assert.deepEqual(validateLeaderboardDisplayValue("  ₹12,500\t "), {
    ok: true,
    value: "₹12,500",
  });
  assert.deepEqual(
    validateLeaderboardDisplayValue("Winner · 18.4x ROI\nFinalist"),
    {
      ok: true,
      value: "Winner · 18.4x ROI Finalist",
    },
  );

  assert.equal(validateLeaderboardDisplayValue("").ok, false);
  assert.equal(validateLeaderboardDisplayValue("   \t\n  ").ok, false);
  assert.equal(validateLeaderboardDisplayValue("x".repeat(121)).ok, false);
  assert.equal(validateLeaderboardDisplayValue("x".repeat(120)).ok, true);
});

test("Stage 3A (4) [Executed]: Create and update input validation enforces valid UUIDs, positions, values, and optional notes", () => {
  const validCreate = validateLeaderboardCreateInput({
    eventId: EVENT_A,
    contingentId: CONTINGENT_1,
    position: "2",
    displayValue: "890 points",
    notes: "  Manual position check  ",
  });
  assert.equal(validCreate.ok, true);
  if (validCreate.ok) {
    assert.equal(validCreate.value.position, 2);
    assert.equal(validCreate.value.displayValue, "890 points");
    assert.equal(validCreate.value.notes, "Manual position check");
  }

  assert.equal(
    validateLeaderboardCreateInput({
      eventId: "not-a-uuid",
      contingentId: CONTINGENT_1,
      position: "1",
      displayValue: "950 points",
    }).ok,
    false,
  );

  assert.equal(
    validateLeaderboardCreateInput({
      eventId: EVENT_A,
      contingentId: CONTINGENT_2,
      position: "1",
      displayValue: "950 points",
      notes: "n".repeat(500),
    }).ok,
    true,
  );

  assert.equal(
    validateLeaderboardCreateInput({
      eventId: EVENT_A,
      contingentId: CONTINGENT_2,
      position: "1",
      displayValue: "950 points",
      notes: "n".repeat(501),
    }).ok,
    false,
  );

  assert.deepEqual(validateOptionalNotes(null), { ok: true, value: null });
  assert.deepEqual(validateOptionalNotes(undefined), { ok: true, value: null });
  assert.deepEqual(validateOptionalNotes(""), { ok: true, value: null });
  assert.deepEqual(validateOptionalNotes("\t\t\t"), { ok: true, value: null });
  assert.deepEqual(validateOptionalNotes("\n\r\n\r"), { ok: true, value: null });
  assert.deepEqual(validateOptionalNotes(" \t \r\n \t "), {
    ok: true,
    value: null,
  });
  const exactly500 = "a".repeat(500);
  assert.deepEqual(validateOptionalNotes(` \t\r\n${exactly500}\r\n\t `), {
    ok: true,
    value: exactly500,
  });
  const over500 = validateOptionalNotes("a".repeat(501));
  assert.equal(over500.ok, false);
  if (!over500.ok) {
    assert.match(over500.error, /500 characters/);
  }

  for (const wsOnly of ["\t\t", "\n\r\n", " \t \r\n "]) {
    const createWs = validateLeaderboardCreateInput({
      eventId: EVENT_A,
      contingentId: CONTINGENT_2,
      position: "1",
      displayValue: "950 points",
      notes: wsOnly,
    });
    assert.equal(createWs.ok, true);
    if (createWs.ok) assert.equal(createWs.value.notes, null);

    const updateWs = validateLeaderboardUpdateInput({
      eventId: EVENT_A,
      entryId: ENTRY_1,
      position: 1,
      displayValue: "950 points",
      notes: wsOnly,
    });
    assert.equal(updateWs.ok, true);
    if (updateWs.ok) assert.equal(updateWs.value.notes, null);
  }

  const validUpdate = validateLeaderboardUpdateInput({
    eventId: EVENT_A,
    entryId: ENTRY_1,
    position: 1,
    displayValue: "₹15,000",
    notes: "",
  });
  assert.equal(validUpdate.ok, true);
  if (validUpdate.ok) {
    assert.equal(validUpdate.value.notes, null);
    assert.equal(validUpdate.value.displayValue, "₹15,000");
  }

  const validUpdate500 = validateLeaderboardUpdateInput({
    eventId: EVENT_A,
    entryId: ENTRY_1,
    position: 1,
    displayValue: "₹15,000",
    notes: "b".repeat(500),
  });
  assert.equal(validUpdate500.ok, true);
  if (validUpdate500.ok) {
    assert.equal(validUpdate500.value.notes?.length, 500);
  }

  const invalidUpdate501 = validateLeaderboardUpdateInput({
    eventId: EVENT_A,
    entryId: ENTRY_1,
    position: 1,
    displayValue: "₹15,000",
    notes: "b".repeat(501),
  });
  assert.equal(invalidUpdate501.ok, false);
});

test("Stage 3A (5) [Executed]: Position is authoritative ranking; tied positions share rank in deterministic secondary order (created_at, id)", () => {
  assert.equal(
    "validateLeaderboardReorderInput" in leaderboardValidation,
    false,
    "Separate reorder validation must be removed",
  );

  const rows = [
    {
      id: ENTRY_3,
      position: 3,
      created_at: "2026-11-22T00:00:00Z",
    },
    {
      id: ENTRY_2,
      position: 1,
      created_at: "2026-11-22T02:00:00Z",
    },
    {
      id: ENTRY_1,
      position: 1,
      created_at: "2026-11-22T01:00:00Z",
    },
  ];

  // Position 1 entries appear before Position 3; ties sort deterministically by created_at ASC
  const sorted = sortLeaderboardEntries(rows);
  assert.deepEqual(
    sorted.map((r) => r.id),
    [ENTRY_1, ENTRY_2, ENTRY_3],
  );

  // Equal position & equal created_at falls back deterministically to id ASC
  const sameTimestampTie = sortLeaderboardEntries([
    { id: ENTRY_2, position: 2, created_at: "2026-11-22T01:00:00Z" },
    { id: ENTRY_1, position: 2, created_at: "2026-11-22T01:00:00Z" },
  ]);
  assert.deepEqual(
    sameTimestampTie.map((r) => r.id),
    [ENTRY_1, ENTRY_2],
  );

  const tieCounts = countPositionOccurrences(sorted);
  assert.equal(tieCounts.get(1), 2);
  assert.equal(tieCounts.get(3), 1);

  // Changing ENTRY_3's position from 3 to 1 (or ENTRY_1 from 1 to 4) immediately updates displayed rank
  const afterPositionUpdate = sortLeaderboardEntries(
    rows.map((r) => (r.id === ENTRY_3 ? { ...r, position: 1 } : r)),
  );
  assert.deepEqual(
    afterPositionUpdate.map((r) => r.id),
    [ENTRY_3, ENTRY_1, ENTRY_2],
  );
});

test("Stage 3A (6) [Executed]: Error classification and archived event read-only helper behave accurately", () => {
  assert.equal(classifyLeaderboardLoadError(null), "none");
  assert.equal(
    classifyLeaderboardLoadError({ code: "42P01", message: "relation missing" }),
    "migration_missing",
  );
  assert.equal(
    classifyLeaderboardLoadError({ code: "PGRST205", message: "schema cache" }),
    "migration_missing",
  );
  assert.equal(
    classifyLeaderboardLoadError({ code: "42501", message: "rls denied" }),
    "load_error",
  );

  assert.equal(isLeaderboardEventReadOnly("archived"), true);
  assert.equal(isLeaderboardEventReadOnly("active"), false);
  assert.equal(isLeaderboardEventReadOnly("draft"), false);
  assert.equal(isLeaderboardEventReadOnly("inactive"), false);
});

// ============================================================================
// STRUCTURAL / STATIC CONTRACT ASSERTIONS (SQL, RLS, Server Actions, & UI)
// ============================================================================

test("Stage 3A (7) [Structural]: Migration 0008 uses position-only ordering, no display_order/compaction, full audit attribution, and strict RLS", () => {
  const migrationPath = path.join(
    ROOT_DIR,
    "supabase/migrations/202611220008_stage3a_overall_leaderboard.sql",
  );
  const sql = fs.readFileSync(migrationPath, "utf8");

  // display_order and reorder RPC must be completely absent
  assert.doesNotMatch(sql, /\bdisplay_order\b/i);
  assert.doesNotMatch(sql, /\breorder_leaderboard_entries\b/i);
  assert.doesNotMatch(sql, /leaderboard\.reordered/i);

  // Composite FK prevents referencing a contingent not registered in that specific event and preserves ON DELETE RESTRICT
  assert.match(sql, /event_entries_id_event_contingent_unique/);
  assert.match(
    sql,
    /FOREIGN KEY\s*\(\s*event_entry_id\s*,\s*event_id\s*,\s*contingent_id\s*\)\s*REFERENCES\s+public\.event_entries\s*\(\s*id\s*,\s*event_id\s*,\s*contingent_id\s*\)\s*ON DELETE RESTRICT/i,
  );

  // Duplicate contingent per event blocked; ties on position remain allowed; index orders deterministically
  assert.match(
    sql,
    /ADD CONSTRAINT leaderboard_entries_event_contingent_unique\s+UNIQUE\s*\(\s*event_id\s*,\s*contingent_id\s*\)/i,
  );
  assert.doesNotMatch(
    sql,
    /UNIQUE\s*\(\s*event_id\s*,\s*position\s*\)/i,
    "Position must allow ties",
  );
  assert.match(
    sql,
    /CREATE INDEX IF NOT EXISTS leaderboard_entries_event_position_idx\s+ON public\.leaderboard_entries\s*\(\s*event_id\s*,\s*position ASC\s*,\s*created_at ASC\s*,\s*id ASC\s*\)/i,
  );

  // Attribution FKs preserve audit history
  assert.match(
    sql,
    /created_by\s+uuid\s+NULL\s+REFERENCES\s+public\.profiles\s*\(\s*id\s*\)\s*ON DELETE RESTRICT/i,
  );
  assert.match(
    sql,
    /updated_by\s+uuid\s+NULL\s+REFERENCES\s+public\.profiles\s*\(\s*id\s*\)\s*ON DELETE RESTRICT/i,
  );

  // Strict RLS and table privileges (read-only SELECT for active organisers, zero anon access)
  assert.match(sql, /REVOKE ALL ON public\.leaderboard_entries FROM PUBLIC;/i);
  assert.match(sql, /REVOKE ALL ON public\.leaderboard_entries FROM anon;/i);
  assert.match(
    sql,
    /REVOKE ALL ON public\.leaderboard_entries FROM authenticated;/i,
  );
  assert.match(
    sql,
    /GRANT SELECT ON public\.leaderboard_entries TO authenticated;/i,
  );
  assert.match(
    sql,
    /ALTER TABLE public\.leaderboard_entries ENABLE ROW LEVEL SECURITY;/i,
  );
  assert.match(
    sql,
    /CREATE POLICY leaderboard_entries_select_active_organiser[\s\S]*USING\s*\(\s*public\.is_active_organiser\(\)\s*\)/i,
  );

  // Atomic RPCs: add, update, remove
  for (const fnName of [
    "add_leaderboard_entry",
    "update_leaderboard_entry",
    "remove_leaderboard_entry",
  ]) {
    assert.match(
      sql,
      new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fnName}\\(`),
    );
    assert.match(
      sql,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${fnName}\\([^)]*\\) TO authenticated;`,
      ),
    );
  }

  for (const actionName of [
    "'leaderboard.entry_added'",
    "'leaderboard.entry_updated'",
    "'leaderboard.entry_removed'",
  ]) {
    assert.ok(
      sql.includes(actionName),
      `Missing atomic audit action ${actionName}`,
    );
  }

  // Audit integrity: updated_by/updated_at recorded and remove_leaderboard_entry performs single-row DELETE with no UPDATE compaction
  assert.match(sql, /'updated_by',\s*v_inserted\.updated_by/);
  assert.match(sql, /'updated_at',\s*v_inserted\.updated_at/);
  assert.match(sql, /'updated_by',\s*v_existing\.updated_by/);
  assert.match(sql, /'updated_at',\s*v_existing\.updated_at/);
  assert.match(sql, /'updated_by',\s*v_updated\.updated_by/);
  assert.match(sql, /'updated_at',\s*v_updated\.updated_at/);

  const removeFnMatch = sql.match(
    /CREATE OR REPLACE FUNCTION public\.remove_leaderboard_entry[\s\S]*?\$\$;/,
  );
  assert.ok(removeFnMatch, "Expected remove_leaderboard_entry function definition");
  assert.doesNotMatch(
    removeFnMatch[0],
    /\bUPDATE\s+public\.leaderboard_entries\b/i,
    "remove_leaderboard_entry must not mutate/compact other rows",
  );

  // Notes exceeding 500 characters must be rejected rather than silently truncated,
  // and SQL whitespace trimming must match JS .trim() (spaces, tabs, CR, LF)
  assert.doesNotMatch(sql, /\bleft\s*\(\s*v_clean_notes/i);
  assert.match(
    sql,
    /ADD CONSTRAINT leaderboard_entries_notes_check\s+CHECK\s*\(\s*notes IS NULL OR char_length\(btrim\(notes, E' \\t\\r\\n'\)\) BETWEEN 1 AND 500\s*\)/i,
  );
  assert.match(
    sql,
    /NEW\.notes := NULLIF\(btrim\(COALESCE\(NEW\.notes, ''\), E' \\t\\r\\n'\), ''\);/,
  );
  assert.match(
    sql,
    /IF NEW\.notes IS NOT NULL AND char_length\(NEW\.notes\) > 500 THEN\s+RAISE EXCEPTION 'Notes cannot exceed 500 characters'/i,
  );
  const rpcNoteTrims = sql.match(
    /v_clean_notes := NULLIF\(btrim\(COALESCE\(p_notes, ''\), E' \\t\\r\\n'\), ''\);/g,
  );
  assert.equal(
    rpcNoteTrims?.length,
    2,
    "Both add_leaderboard_entry and update_leaderboard_entry must trim spaces, tabs, CR, and LF",
  );
  const rpcNoteChecks = sql.match(
    /IF v_clean_notes IS NOT NULL AND char_length\(v_clean_notes\) > 500 THEN\s+RAISE EXCEPTION 'Notes cannot exceed 500 characters';/g,
  );
  assert.equal(
    rpcNoteChecks?.length,
    2,
    "Both add_leaderboard_entry and update_leaderboard_entry must reject notes > 500 chars",
  );

  assert.match(
    sql,
    /pg_advisory_xact_lock\s*\(\s*hashtext\s*\(\s*'virtuoso_leaderboard:'\s*\|\|\s*p_event_id::text\s*\)\s*\)/i,
  );
  assert.match(sql, /SET search_path = public/i);
  assert.match(sql, /SECURITY DEFINER/i);
});

test("Stage 3A (8) [Structural]: Leaderboard read helper is server-only, organiser-RLS-bound, and defers team read path until shared team auth exists", () => {
  const readSrc = fs.readFileSync(
    path.join(ROOT_DIR, "src/lib/leaderboard/read.ts"),
    "utf8",
  );

  // Strictly server-only and NOT a Next.js Server Action ("use server" directive would expose an HTTP RPC)
  assert.match(readSrc, /^import "server-only";/);
  assert.doesNotMatch(readSrc, /^\s*["']use server["'];?\s*$/m);
  assert.match(readSrc, /typeof window !== "undefined"/);

  // Organiser read path must require active organiser session and use standard RLS-enforced server client
  assert.match(readSrc, /export async function getOrganiserEventLeaderboard\(/);
  assert.match(readSrc, /requireActiveUser\(ALL_ORGANISER_ROLES/);
  assert.match(readSrc, /createSupabaseServerClient\(\)/);

  // No service-role client or speculative participant-email matching should exist before shared team auth is built
  assert.doesNotMatch(readSrc, /createSupabaseAdminClient/);
  assert.doesNotMatch(readSrc, /getParticipantEventLeaderboard/);
  assert.doesNotMatch(readSrc, /\.from\("participants"\)/);
  assert.doesNotMatch(readSrc, /\.(insert|update|delete|upsert)\(/);
  assert.doesNotMatch(readSrc, /\.rpc\(/);
  assert.doesNotMatch(readSrc, /\bdisplay_order\b/);
});

test("Stage 3A (9) [Structural]: Server actions, registry deletion UX, and UI components enforce position-only ranking and scope boundaries", () => {
  const actionsSrc = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/actions/leaderboard.ts"),
    "utf8",
  );
  assert.match(actionsSrc, /"use server"/);
  assert.match(actionsSrc, /requireActiveUserForAction\(ALL_ORGANISER_ROLES/);
  assert.match(actionsSrc, /addLeaderboardEntryAction/);
  assert.match(actionsSrc, /updateLeaderboardEntryAction/);
  assert.match(actionsSrc, /removeLeaderboardEntryAction/);
  assert.doesNotMatch(actionsSrc, /reorderLeaderboardEntriesAction/);
  assert.doesNotMatch(actionsSrc, /createSupabaseAdminClient/);

  // Event-entry deletion UX preserves ON DELETE RESTRICT and surfaces clear message when referenced by leaderboard_entries
  const registrySrc = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/actions/registry.ts"),
    "utf8",
  );
  assert.match(
    registrySrc,
    /err\.code === "23503" && err\.message\?\.includes\("leaderboard_entries"\)/,
  );
  assert.match(
    registrySrc,
    /Remove it from the Overall Leaderboard before deleting this event entry\./,
  );

  // Organiser UI & route checks
  const pageSrc = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/events/[eventId]/leaderboard/page.tsx"),
    "utf8",
  );
  assert.match(pageSrc, /requireActiveUser\(ALL_ORGANISER_ROLES/);
  assert.match(pageSrc, /getOrganiserEventLeaderboard/);

  const managerSrc = fs.readFileSync(
    path.join(ROOT_DIR, "src/components/competition/LeaderboardManager.tsx"),
    "utf8",
  );
  assert.match(managerSrc, /"use client"/);
  assert.match(managerSrc, /sortLeaderboardEntries/);
  assert.doesNotMatch(managerSrc, /\bdisplay_order\b/);
  assert.doesNotMatch(managerSrc, /reorderLeaderboardEntriesAction/);
  assert.doesNotMatch(managerSrc, /handleMoveEntry/);
  assert.doesNotMatch(managerSrc, /window\.(alert|confirm|open)/);
  assert.doesNotMatch(
    managerSrc,
    /SUPABASE_SERVICE_ROLE_KEY|createSupabaseAdminClient/,
  );

  const eventDetailSrc = fs.readFileSync(
    path.join(ROOT_DIR, "src/components/competition/EventDetailManager.tsx"),
    "utf8",
  );
  assert.match(eventDetailSrc, /\/events\/\$\{event\.id\}\/leaderboard/);
  assert.match(eventDetailSrc, /Manage Leaderboard/);

  // Guard against accidental scope creep (no judge/scoring artifacts introduced)
  assert.equal(
    fs.existsSync(path.join(ROOT_DIR, "src/app/actions/scoring.ts")),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(ROOT_DIR, "src/app/actions/judges.ts")),
    false,
  );
});
