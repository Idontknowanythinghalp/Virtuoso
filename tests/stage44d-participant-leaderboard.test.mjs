import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALL_ORGANISER_ROLES,
  SUPER_ADMIN_ONLY,
  evaluateOrganiserAccess,
} from "@/lib/auth/policy";
import {
  canPublishEventLeaderboard,
  canUnpublishEventLeaderboard,
  toLeaderboardPublicationState,
} from "@/lib/leaderboard/validation";
import { loadTeamLeaderboardsWithDeps } from "@/lib/team-portal/leaderboard";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const CONTINGENT_A = "11111111-1111-4111-8111-111111111111";
const CONTINGENT_B = "22222222-2222-4222-8222-222222222222";
const CONTINGENT_C = "33333333-3333-4333-8333-333333333333";
const CONTINGENT_D = "44444444-4444-4444-8444-444444444444";

const EVENT_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EVENT_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EVENT_3 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const EVENT_DRAFT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const EVENT_INACTIVE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const EVENT_ARCHIVED_PUB = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const EVENT_ARCHIVED_UNPUB = "99999999-9999-4999-8999-999999999999";

test("Stage 4.4D - unpublished events hide standings and strip all organiser-only fields", async () => {
  const result = await loadTeamLeaderboardsWithDeps(CONTINGENT_A, {
    fetchParticipantLeaderboardsSnapshot: async () => ({
      rows: [
        {
          event_id: EVENT_1,
          event_code: "EV-01",
          event_name: "Crisis Management",
          entry_mode: "contingent",
          event_status: "active",
          is_published: true,
          published_at: "2026-12-04T14:00:00Z",
          entries: [
            {
              id: "entry-102",
              event_id: EVENT_1,
              contingent_id: CONTINGENT_A,
              contingent_code: "CONT-01",
              contingent_name: "Alpha Team",
              institution_name: "Institution One",
              rank: 2,
              score: 91,
              updated_at: "2026-12-04T13:00:00Z",
              notes: "INTERNAL NOTE - MUST NOT BE EXPOSED",
              created_by: "org-1",
              updated_by: "org-1",
              event_entry_id: "ee-1",
              published_by: "super-1",
              unpublished_at: null,
              unpublished_by: null,
            },
            {
              id: "entry-101",
              event_id: EVENT_1,
              contingent_id: CONTINGENT_B,
              contingent_code: "CONT-02",
              contingent_name: "Beta Contingent",
              institution_name: "Beta University",
              rank: 1,
              score: 95.5,
              updated_at: "2026-12-04T12:30:00Z",
            },
          ],
        },
        // Defensive check: even if snapshot mock includes entries on unpublished EVENT_2, they must be hidden
        {
          event_id: EVENT_2,
          event_code: "EV-02",
          event_name: "Corporate Strategy",
          entry_mode: "hybrid",
          event_status: "active",
          is_published: false,
          published_at: "2026-12-04T11:00:00Z",
          entries: [
            {
              id: "entry-201",
              event_id: EVENT_2,
              contingent_id: CONTINGENT_A,
              contingent_code: "CONT-01",
              contingent_name: "Alpha Team",
              institution_name: "Institution One",
              rank: 1,
              score: 99,
              updated_at: "2026-12-04T12:30:00Z",
            },
          ],
        },
      ],
      error: null,
    }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.leaderboards.length, 2);

  const lb1 = result.leaderboards.find((l) => l.eventId === EVENT_1);
  assert.ok(lb1);
  assert.equal(lb1.isPublished, true);
  assert.equal(lb1.publishedAt, "2026-12-04T14:00:00Z");
  assert.equal(lb1.entries.length, 2);
  assert.equal(lb1.entries[0].rank, 1);
  assert.equal(lb1.entries[0].contingentCode, "CONT-02");
  assert.equal(lb1.entries[0].score, 95.5);
  assert.equal(lb1.entries[1].rank, 2);
  assert.equal(lb1.entries[1].contingentCode, "CONT-01");
  assert.equal(lb1.entries[1].score, 91);

  // Strict field allowlist: only ReadOnlyLeaderboardRow keys may exist
  const allowedEntryKeys = [
    "contingentCode",
    "contingentId",
    "contingentName",
    "displayLabel",
    "id",
    "institutionName",
    "rank",
    "score",
    "updatedAt",
  ];
  for (const entry of lb1.entries) {
    assert.deepEqual(Object.keys(entry).sort(), allowedEntryKeys);
    assert.equal("notes" in entry, false);
    assert.equal("created_by" in entry, false);
    assert.equal("updated_by" in entry, false);
    assert.equal("event_entry_id" in entry, false);
    assert.equal("published_by" in entry, false);
    assert.equal("unpublished_at" in entry, false);
    assert.equal("unpublished_by" in entry, false);
  }

  const lb2 = result.leaderboards.find((l) => l.eventId === EVENT_2);
  assert.ok(lb2);
  assert.equal(lb2.isPublished, false);
  assert.equal(lb2.publishedAt, null);
  assert.equal(lb2.entries.length, 0);
});

test("Stage 4.4D - preserves tied ranks and unranked entries in deterministic order and supports empty published leaderboards", async () => {
  const result = await loadTeamLeaderboardsWithDeps(CONTINGENT_A, {
    fetchParticipantLeaderboardsSnapshot: async () => ({
      rows: [
        {
          event_id: EVENT_1,
          event_code: "EV-01",
          event_name: "Debate",
          entry_mode: "contingent",
          event_status: "active",
          is_published: true,
          published_at: "2026-12-04T15:00:00Z",
          entries: [
            {
              id: "entry-4",
              event_id: EVENT_1,
              contingent_id: CONTINGENT_D,
              contingent_code: "CONT-04",
              contingent_name: "Delta",
              institution_name: "Inst D",
              rank: 4,
              score: 72,
              updated_at: "2026-12-04T10:00:00Z",
            },
            {
              id: "entry-3",
              event_id: EVENT_1,
              contingent_id: CONTINGENT_C,
              contingent_code: "CONT-03",
              contingent_name: "Gamma",
              institution_name: "Inst C",
              rank: 2,
              score: 88.5,
              updated_at: "2026-12-04T10:02:00Z",
            },
            {
              id: "entry-2",
              event_id: EVENT_1,
              contingent_id: CONTINGENT_A,
              contingent_code: "CONT-01",
              contingent_name: "Alpha",
              institution_name: "Inst A",
              rank: 2,
              score: 88.5,
              updated_at: "2026-12-04T10:01:00Z",
            },
            {
              id: "entry-1",
              event_id: EVENT_1,
              contingent_id: CONTINGENT_B,
              contingent_code: "CONT-02",
              contingent_name: "Beta",
              institution_name: "Inst B",
              rank: 1,
              score: 96,
              updated_at: "2026-12-04T10:00:00Z",
            },
          ],
        },
        {
          event_id: EVENT_2,
          event_code: "EV-02",
          event_name: "Empty Published Event",
          entry_mode: "contingent",
          event_status: "active",
          is_published: true,
          published_at: "2026-12-04T16:00:00Z",
          entries: [],
        },
      ],
      error: null,
    }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const entries = result.leaderboards[0].entries;
  assert.deepEqual(
    entries.map((e) => e.rank),
    [1, 2, 2, 4],
  );
  assert.deepEqual(
    entries.map((e) => e.contingentCode),
    ["CONT-02", "CONT-01", "CONT-03", "CONT-04"],
  );
  assert.deepEqual(
    entries.map((e) => e.score),
    [96, 88.5, 88.5, 72],
  );

  // Safe empty state when a published leaderboard currently has 0 entries
  assert.equal(result.leaderboards[1].isPublished, true);
  assert.deepEqual(result.leaderboards[1].entries, []);
});

test("Stage 4.4D - archived events remain visible only when already published; draft, inactive, and individual events stay hidden/excluded", async () => {
  const result = await loadTeamLeaderboardsWithDeps(CONTINGENT_A, {
    fetchParticipantLeaderboardsSnapshot: async () => ({
      rows: [
        {
          event_id: EVENT_DRAFT,
          event_code: "EV-DR",
          event_name: "Draft Event",
          entry_mode: "contingent",
          event_status: "draft",
          is_published: true,
          published_at: "2026-12-04T10:00:00Z",
          entries: [
            {
              id: "entry-draft",
              event_id: EVENT_DRAFT,
              contingent_id: CONTINGENT_A,
              contingent_code: "CONT-01",
              contingent_name: "Alpha Team",
              institution_name: "Institution One",
              rank: 1,
              score: 100,
              updated_at: "2026-12-04T10:00:00Z",
            },
          ],
        },
        {
          event_id: EVENT_INACTIVE,
          event_code: "EV-IN",
          event_name: "Inactive Event",
          entry_mode: "contingent",
          event_status: "inactive",
          is_published: true,
          published_at: "2026-12-04T10:00:00Z",
          entries: [],
        },
        {
          event_id: EVENT_ARCHIVED_PUB,
          event_code: "EV-AP",
          event_name: "Archived Published",
          entry_mode: "contingent",
          event_status: "archived",
          is_published: true,
          published_at: "2026-12-04T11:00:00Z",
          entries: [
            {
              id: "entry-arch-1",
              event_id: EVENT_ARCHIVED_PUB,
              contingent_id: CONTINGENT_A,
              contingent_code: "CONT-01",
              contingent_name: "Alpha Team",
              institution_name: "Institution One",
              rank: 1,
              score: 98.25,
              updated_at: "2026-12-04T10:30:00Z",
            },
          ],
        },
        {
          event_id: EVENT_ARCHIVED_UNPUB,
          event_code: "EV-AU",
          event_name: "Archived Unpublished",
          entry_mode: "contingent",
          event_status: "archived",
          is_published: false,
          published_at: null,
          entries: [
            {
              id: "entry-arch-unpub",
              event_id: EVENT_ARCHIVED_UNPUB,
              contingent_id: CONTINGENT_A,
              contingent_code: "CONT-01",
              contingent_name: "Alpha Team",
              institution_name: "Institution One",
              rank: 1,
              score: 95,
              updated_at: "2026-12-04T10:30:00Z",
            },
          ],
        },
        // Individual-only events must be excluded completely
        {
          event_id: EVENT_3,
          event_code: "EV-IND",
          event_name: "Individual Only Event",
          entry_mode: "individual",
          event_status: "active",
          is_published: true,
          published_at: "2026-12-04T11:00:00Z",
          entries: [],
        },
      ],
      error: null,
    }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const byId = new Map(result.leaderboards.map((l) => [l.eventId, l]));
  assert.equal(byId.has(EVENT_3), false);

  assert.equal(byId.get(EVENT_DRAFT)?.isPublished, false);
  assert.equal(byId.get(EVENT_DRAFT)?.entries.length, 0);

  assert.equal(byId.get(EVENT_INACTIVE)?.isPublished, false);
  assert.equal(byId.get(EVENT_INACTIVE)?.entries.length, 0);

  assert.equal(byId.get(EVENT_ARCHIVED_UNPUB)?.isPublished, false);
  assert.equal(byId.get(EVENT_ARCHIVED_UNPUB)?.publishedAt, null);
  assert.equal(byId.get(EVENT_ARCHIVED_UNPUB)?.entries.length, 0);

  assert.equal(byId.get(EVENT_ARCHIVED_PUB)?.isPublished, true);
  assert.equal(byId.get(EVENT_ARCHIVED_PUB)?.publishedAt, "2026-12-04T11:00:00Z");
  assert.equal(byId.get(EVENT_ARCHIVED_PUB)?.entries.length, 1);
  assert.equal(byId.get(EVENT_ARCHIVED_PUB)?.entries[0].score, 98.25);
});

test("Stage 4.4D - passes normalized contingent UUID to atomic snapshot RPC and discards mismatched event entries", async () => {
  let receivedContingentId = "";

  const result = await loadTeamLeaderboardsWithDeps(CONTINGENT_A.toUpperCase(), {
    fetchParticipantLeaderboardsSnapshot: async (contingentId) => {
      receivedContingentId = contingentId;
      return {
        rows: [
          {
            event_id: EVENT_1,
            event_code: "EV-01",
            event_name: "Event 1",
            entry_mode: "contingent",
            event_status: "active",
            is_published: true,
            published_at: "2026-12-04T12:00:00Z",
            entries: [
              {
                id: "entry-valid",
                event_id: EVENT_1,
                contingent_id: CONTINGENT_A,
                contingent_code: "CONT-01",
                contingent_name: "Alpha Team",
                institution_name: "Inst A",
                rank: 1,
                score: 100,
                updated_at: "2026-12-04T12:00:00Z",
              },
              {
                id: "entry-cross-event",
                event_id: EVENT_2,
                contingent_id: CONTINGENT_B,
                contingent_code: "CONT-02",
                contingent_name: "Beta",
                institution_name: "Inst B",
                rank: 1,
                score: 99,
                updated_at: "2026-12-04T12:00:00Z",
              },
            ],
          },
        ],
        error: null,
      };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(receivedContingentId, CONTINGENT_A);
  assert.equal(result.leaderboards.length, 1);
  assert.equal(result.leaderboards[0].entries.length, 1);
  assert.equal(result.leaderboards[0].entries[0].id, "entry-valid");
});

test("Stage 4.4D - fails closed on invalid session UUID, missing migration, or database errors", async () => {
  let rpcCalled = false;
  const invalidId = await loadTeamLeaderboardsWithDeps("not-a-uuid", {
    fetchParticipantLeaderboardsSnapshot: async () => {
      rpcCalled = true;
      return { rows: [], error: null };
    },
  });
  assert.equal(invalidId.ok, false);
  assert.equal(rpcCalled, false);

  const migrationMissing = await loadTeamLeaderboardsWithDeps(CONTINGENT_A, {
    fetchParticipantLeaderboardsSnapshot: async () => ({
      rows: [],
      error: {
        code: "42883",
        message:
          "function public.get_participant_leaderboards_for_contingent(uuid) does not exist",
      },
    }),
  });
  assert.equal(migrationMissing.ok, false);

  const snapshotError = await loadTeamLeaderboardsWithDeps(CONTINGENT_A, {
    fetchParticipantLeaderboardsSnapshot: async () => ({
      rows: [],
      error: {
        code: "42501",
        message: "permission denied",
      },
    }),
  });
  assert.equal(snapshotError.ok, false);
});

test("Stage 4.4D - publication permission and lifecycle validation rules", () => {
  assert.deepEqual(SUPER_ADMIN_ONLY, ["super_admin"]);
  assert.deepEqual(ALL_ORGANISER_ROLES, ["super_admin", "event_coordinator"]);

  const baseProfile = {
    id: "00000000-0000-4000-8000-000000000001",
    full_name: "Organiser",
    email: "org@virtuoso.test",
    scope_mode: "all_events",
    created_at: "2026-11-27T00:00:00Z",
    updated_at: "2026-11-27T00:00:00Z",
  };

  assert.equal(
    evaluateOrganiserAccess({
      authUserId: baseProfile.id,
      profile: { ...baseProfile, role: "super_admin", is_active: true },
      allowedRoles: SUPER_ADMIN_ONLY,
    }).ok,
    true,
  );
  assert.equal(
    evaluateOrganiserAccess({
      authUserId: baseProfile.id,
      profile: { ...baseProfile, role: "event_coordinator", is_active: true },
      allowedRoles: SUPER_ADMIN_ONLY,
    }).ok,
    false,
  );

  // Publish eligibility (allows initial publish and republishing snapshot)
  assert.equal(
    canPublishEventLeaderboard({
      eventStatus: "active",
      entryMode: "contingent",
      entryCount: 3,
      isPublished: false,
    }).ok,
    true,
  );
  assert.equal(
    canPublishEventLeaderboard({
      eventStatus: "active",
      entryMode: "contingent",
      entryCount: 3,
      isPublished: true,
    }).ok,
    true,
  );
  assert.equal(
    canPublishEventLeaderboard({
      eventStatus: "active",
      entryMode: "contingent",
      entryCount: 0,
      isPublished: false,
    }).ok,
    false,
  );
  assert.equal(
    canPublishEventLeaderboard({
      eventStatus: "archived",
      entryMode: "contingent",
      entryCount: 3,
      isPublished: false,
    }).ok,
    false,
  );
  assert.equal(
    canPublishEventLeaderboard({
      eventStatus: "draft",
      entryMode: "contingent",
      entryCount: 3,
      isPublished: false,
    }).ok,
    false,
  );
  assert.equal(
    canPublishEventLeaderboard({
      eventStatus: "inactive",
      entryMode: "contingent",
      entryCount: 3,
      isPublished: false,
    }).ok,
    false,
  );
  assert.equal(
    canPublishEventLeaderboard({
      eventStatus: "active",
      entryMode: "individual",
      entryCount: 3,
      isPublished: false,
    }).ok,
    false,
  );

  // Unpublish eligibility
  assert.equal(
    canUnpublishEventLeaderboard({
      eventStatus: "active",
      isPublished: true,
    }).ok,
    true,
  );
  assert.equal(
    canUnpublishEventLeaderboard({
      eventStatus: "archived",
      isPublished: true,
    }).ok,
    false,
  );
  assert.equal(
    canUnpublishEventLeaderboard({
      eventStatus: "active",
      isPublished: false,
    }).ok,
    false,
  );

  // Safe default state
  assert.deepEqual(toLeaderboardPublicationState(null), {
    isPublished: false,
    publishedAt: null,
    publishedBy: null,
    unpublishedAt: null,
    unpublishedBy: null,
  });
});

test("Stage 4.4D - server actions, SQL migration 0012 hardening, republish reset, atomic participant RPC, and portal boundaries", () => {
  const actionsSrc = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/actions/leaderboard.ts"),
    "utf8",
  );
  assert.match(actionsSrc, /"use server"/);
  assert.match(actionsSrc, /requireActiveUserForAction\(ALL_ORGANISER_ROLES/);
  assert.match(actionsSrc, /requireActiveUserForAction\(SUPER_ADMIN_ONLY/);
  assert.match(actionsSrc, /export async function publishLeaderboardAction/);
  assert.match(actionsSrc, /export async function unpublishLeaderboardAction/);
  assert.match(actionsSrc, /revalidatePath\("\/team\/leaderboard"\)/);
  assert.equal(actionsSrc.includes("createSupabaseAdminClient"), false);

  const sql = fs.readFileSync(
    path.join(
      ROOT_DIR,
      "supabase/migrations/202611270012_stage44d_leaderboard_publication.sql",
    ),
    "utf8",
  );
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.leaderboard_publications/);
  assert.match(sql, /REVOKE ALL ON public\.leaderboard_publications FROM PUBLIC;/i);
  assert.match(sql, /REVOKE ALL ON public\.leaderboard_publications FROM anon;/i);
  assert.match(sql, /USING\s*\(\s*public\.is_active_organiser\(\)\s*\)/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.publish_event_leaderboard/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.unpublish_event_leaderboard/);
  assert.match(sql, /public\.is_active_super_admin\(\)/);
  assert.match(sql, /'leaderboard\.published'/);
  assert.match(sql, /'leaderboard\.unpublished'/);

  const publishFnMatch = sql.match(
    /CREATE OR REPLACE FUNCTION public\.publish_event_leaderboard[\s\S]*?\$\$;/,
  );
  assert.ok(publishFnMatch, "Expected publish_event_leaderboard SQL definition");
  assert.match(
    publishFnMatch[0],
    /ON CONFLICT\s*\(\s*event_id\s*\)\s*DO UPDATE[\s\S]*unpublished_at\s*=\s*NULL[\s\S]*unpublished_by\s*=\s*NULL/i,
  );
  assert.doesNotMatch(sql, /\b(DELETE FROM|UPDATE)\s+public\.audit_logs\b/i);

  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.publish_event_leaderboard\(uuid\) FROM PUBLIC,\s*anon;/i,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.publish_event_leaderboard\(uuid\) TO authenticated;/i,
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.unpublish_event_leaderboard\(uuid\) FROM PUBLIC,\s*anon;/i,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.unpublish_event_leaderboard\(uuid\) TO authenticated;/i,
  );

  const readerRpcMatch = sql.match(
    /CREATE OR REPLACE FUNCTION public\.get_participant_leaderboards_for_contingent[\s\S]*?\$\$;/,
  );
  assert.ok(
    readerRpcMatch,
    "Expected get_participant_leaderboards_for_contingent SQL definition",
  );
  assert.match(readerRpcMatch[0], /LANGUAGE sql\s+STABLE\s+SECURITY DEFINER\s+SET search_path = public/i);
  assert.match(readerRpcMatch[0], /e\.status IN \('active', 'archived'\)/i);
  assert.match(readerRpcMatch[0], /e\.entry_mode IN \('contingent', 'hybrid'\)/i);
  assert.match(readerRpcMatch[0], /ee\.entry_type = 'contingent'/i);
  assert.match(readerRpcMatch[0], /ee\.status IN \('registered', 'checked_in'\)/i);
  assert.match(readerRpcMatch[0], /lp\.is_published IS TRUE/i);
  assert.doesNotMatch(readerRpcMatch[0], /\b(notes|created_by|updated_by|event_entry_id|published_by|unpublished_at|unpublished_by)\b/i);
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.get_participant_leaderboards_for_contingent\(uuid\) FROM PUBLIC,\s*anon,\s*authenticated;/i,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.get_participant_leaderboards_for_contingent\(uuid\) TO service_role;/i,
  );

  const readSrc = fs.readFileSync(
    path.join(ROOT_DIR, "src/lib/team-portal/leaderboard-read.ts"),
    "utf8",
  );
  assert.match(readSrc, /import "server-only";/);
  assert.equal(readSrc.includes('"use server"'), false);
  assert.match(readSrc, /\.rpc\(\s*"get_participant_leaderboards_for_contingent"/);
  assert.equal(readSrc.includes('.from("leaderboard_publications")'), false);
  assert.equal(readSrc.includes('.from("leaderboard_entries")'), false);

  const orgReadSrc = fs.readFileSync(
    path.join(ROOT_DIR, "src/lib/leaderboard/read.ts"),
    "utf8",
  );
  assert.equal(orgReadSrc.includes("createSupabaseAdminClient"), false);
  assert.match(orgReadSrc, /canManagePublication:\s*sessionUser\.role === "super_admin"/);

  const pageSrc = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/team/leaderboard/page.tsx"),
    "utf8",
  );
  assert.match(pageSrc, /requireActiveTeam\(\{ nextPath: "\/team\/leaderboard" \}\)/);
  assert.match(pageSrc, /loadParticipantLeaderboardsForTeam/);
  assert.match(pageSrc, /TeamStandingsNavLink/);

  const clientSrc = fs.readFileSync(
    path.join(ROOT_DIR, "src/components/team/ParticipantLeaderboard.tsx"),
    "utf8",
  );
  assert.match(clientSrc, /^"use client";/);
  assert.equal(clientSrc.includes("team-portal"), false);
  assert.equal(clientSrc.includes("supabase/admin"), false);
  assert.equal(clientSrc.includes("<form"), false);
});
