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
  calculateCompetitionRankings,
  classifyLeaderboardLoadError,
  countRankOccurrences,
  isLeaderboardEventReadOnly,
  validateLeaderboardCreateInput,
  validateLeaderboardScore,
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

test("Stage 3A/4.4E (2) [Executed]: Score validation enforces numeric values only (with decimals) or blank for unranked", () => {
  assert.deepEqual(validateLeaderboardScore("95"), { ok: true, value: 95 });
  assert.deepEqual(validateLeaderboardScore(" 95.5 "), { ok: true, value: 95.5 });
  assert.deepEqual(validateLeaderboardScore("-12.25"), { ok: true, value: -12.25 });
  assert.deepEqual(validateLeaderboardScore(""), { ok: true, value: null });
  assert.deepEqual(validateLeaderboardScore(null), { ok: true, value: null });

  for (const invalid of ["950 points", "₹12,500", "Winner", "1,000", "NaN", "1.12345"]) {
    const res = validateLeaderboardScore(invalid);
    assert.equal(res.ok, false, `Expected "${invalid}" to be rejected`);
  }
});

test("Stage 3A/4.4E (3) [Executed]: Create and update input validation enforces valid UUIDs, numeric scores, and optional notes", () => {
  const validCreate = validateLeaderboardCreateInput({
    eventId: EVENT_A,
    contingentId: CONTINGENT_1,
    score: "890.5",
    notes: "  Draft score check  ",
  });
  assert.equal(validCreate.ok, true);
  if (validCreate.ok) {
    assert.equal(validCreate.value.score, 890.5);
    assert.equal(validCreate.value.notes, "Draft score check");
  }

  assert.equal(
    validateLeaderboardCreateInput({
      eventId: "not-a-uuid",
      contingentId: CONTINGENT_1,
      score: "950",
    }).ok,
    false,
  );

  assert.equal(
    validateLeaderboardCreateInput({
      eventId: EVENT_A,
      contingentId: CONTINGENT_2,
      score: "950",
      notes: "n".repeat(500),
    }).ok,
    true,
  );

  assert.equal(
    validateLeaderboardCreateInput({
      eventId: EVENT_A,
      contingentId: CONTINGENT_2,
      score: "950",
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

  const validUpdate = validateLeaderboardUpdateInput({
    eventId: EVENT_A,
    entryId: ENTRY_1,
    score: "",
    notes: "",
  });
  assert.equal(validUpdate.ok, true);
  if (validUpdate.ok) {
    assert.equal(validUpdate.value.score, null);
    assert.equal(validUpdate.value.notes, null);
  }
});

test("Stage 3A/4.4E (4) [Executed]: Automatic standard competition ranking ranks higher scores first with 1, 1, 3 ties and unscored last", () => {
  assert.equal(
    "validateLeaderboardReorderInput" in leaderboardValidation,
    false,
    "Separate reorder validation must remain absent",
  );

  const rows = [
    {
      id: ENTRY_3,
      score: 88,
      contingentCode: "CONT-03",
      created_at: "2026-11-22T00:00:00Z",
    },
    {
      id: ENTRY_2,
      score: 95.5,
      contingentCode: "CONT-02",
      created_at: "2026-11-22T02:00:00Z",
    },
    {
      id: ENTRY_1,
      score: 95.5,
      contingentCode: "CONT-01",
      created_at: "2026-11-22T01:00:00Z",
    },
  ];

  const ranked = calculateCompetitionRankings(rows);
  assert.deepEqual(
    ranked.map((r) => ({ id: r.id, rank: r.calculatedRank })),
    [
      { id: ENTRY_1, rank: 1 },
      { id: ENTRY_2, rank: 1 },
      { id: ENTRY_3, rank: 3 },
    ],
  );

  const tieCounts = countRankOccurrences(ranked);
  assert.equal(tieCounts.get(1), 2);
  assert.equal(tieCounts.get(3), 1);
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

  assert.doesNotMatch(sql, /\bdisplay_order\b/i);
  assert.doesNotMatch(sql, /\breorder_leaderboard_entries\b/i);
  assert.doesNotMatch(sql, /leaderboard\.reordered/i);

  assert.match(sql, /event_entries_id_event_contingent_unique/);
  assert.match(
    sql,
    /FOREIGN KEY\s*\(\s*event_entry_id\s*,\s*event_id\s*,\s*contingent_id\s*\)\s*REFERENCES\s+public\.event_entries\s*\(\s*id\s*,\s*event_id\s*,\s*contingent_id\s*\)\s*ON DELETE RESTRICT/i,
  );

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

  assert.match(
    sql,
    /created_by\s+uuid\s+NULL\s+REFERENCES\s+public\.profiles\s*\(\s*id\s*\)\s*ON DELETE RESTRICT/i,
  );
  assert.match(
    sql,
    /updated_by\s+uuid\s+NULL\s+REFERENCES\s+public\.profiles\s*\(\s*id\s*\)\s*ON DELETE RESTRICT/i,
  );

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

  assert.match(
    sql,
    /pg_advisory_xact_lock\s*\(\s*hashtext\s*\(\s*'virtuoso_leaderboard:'\s*\|\|\s*p_event_id::text\s*\)\s*\)/i,
  );
  assert.match(sql, /SET search_path = public/i);
  assert.match(sql, /SECURITY DEFINER/i);
});

test("Stage 3A (8) [Structural]: Leaderboard read helper is server-only and organiser-RLS-bound without admin client or RPC calls", () => {
  const readSrc = fs.readFileSync(
    path.join(ROOT_DIR, "src/lib/leaderboard/read.ts"),
    "utf8",
  );

  assert.match(readSrc, /^import "server-only";/);
  assert.doesNotMatch(readSrc, /^\s*["']use server["'];?\s*$/m);
  assert.match(readSrc, /typeof window !== "undefined"/);

  assert.match(readSrc, /export async function getOrganiserEventLeaderboard\(/);
  assert.match(readSrc, /requireActiveUser\(ALL_ORGANISER_ROLES/);
  assert.match(readSrc, /createSupabaseServerClient\(\)/);

  assert.doesNotMatch(readSrc, /createSupabaseAdminClient/);
  assert.doesNotMatch(readSrc, /getParticipantEventLeaderboard/);
  assert.doesNotMatch(readSrc, /\.from\("participants"\)/);
  assert.doesNotMatch(readSrc, /\.(insert|update|delete|upsert)\(/);
  assert.doesNotMatch(readSrc, /\.rpc\(/);
  assert.doesNotMatch(readSrc, /\bdisplay_order\b/);
});

test("Stage 3A/4.4E (9) [Structural]: Server actions, registry deletion UX, and UI components enforce numeric ranking and scope boundaries", () => {
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
  assert.match(managerSrc, /calculateCompetitionRankings/);
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

  assert.equal(
    fs.existsSync(path.join(ROOT_DIR, "src/app/actions/scoring.ts")),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(ROOT_DIR, "src/app/actions/judges.ts")),
    false,
  );
});
