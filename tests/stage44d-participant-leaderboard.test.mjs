import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTeamLeaderboardsWithDeps } from "@/lib/team-portal/leaderboard";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const CONTINGENT_A = "11111111-1111-4111-8111-111111111111";
const CONTINGENT_B = "22222222-2222-4222-8222-222222222222";
const CONTINGENT_C = "33333333-3333-4333-8333-333333333333";

const EVENT_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EVENT_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EVENT_3 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"; // Contingent not registered
const EVENT_DRAFT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"; // Draft event

test("Stage 4.4D - loads published leaderboard standings for registered events", async () => {
  const result = await loadTeamLeaderboardsWithDeps(
    {
      contingentId: CONTINGENT_A,
      contingentCode: "CONT-01",
      contingentName: "Alpha Team",
      institutionName: "Institution One",
      deviceId: "dev-1",
    },
    {
      findContingentById: async (id) => ({
        id,
        code: "CONT-01",
        name: "Alpha Team",
        institution_name: "Institution One",
      }),
      loadRegisteredEvents: async (contingentId) => [
        {
          event_id: EVENT_1,
          entry_status: "registered",
          event: {
            id: EVENT_1,
            code: "EV-01",
            title: "Crisis Management",
            status: "in_progress",
          },
        },
        {
          event_id: EVENT_2,
          entry_status: "checked_in",
          event: {
            id: EVENT_2,
            code: "EV-02",
            title: "Corporate Strategy",
            status: "completed",
          },
        },
      ],
      loadLeaderboardEntriesForEvents: async (eventIds) => [
        // Event 1 entries
        {
          id: "entry-101",
          event_id: EVENT_1,
          position: 1,
          display_value: "95.5 pts",
          notes: "INTERNAL ORGANISER NOTE - DO NOT LEAK",
          created_by: "org-1",
          updated_by: "org-2",
          event_entry_id: "ee-101",
          created_at: "2026-12-04T10:00:00Z",
          updated_at: "2026-12-04T12:30:00Z",
          contingent: {
            id: CONTINGENT_B,
            code: "CONT-02",
            name: "Beta Contingent",
            institution_name: "Beta University",
          },
        },
        {
          id: "entry-102",
          event_id: EVENT_1,
          position: 2,
          display_value: "91.0 pts",
          notes: "Internal score breakdown",
          created_by: "org-1",
          updated_by: "org-1",
          event_entry_id: "ee-102",
          created_at: "2026-12-04T10:00:00Z",
          updated_at: "2026-12-04T13:00:00Z",
          contingent: {
            id: CONTINGENT_A,
            code: "CONT-01",
            name: "Alpha Team",
            institution_name: "Institution One",
          },
        },
      ],
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.leaderboards.length, 2);

  // Event 1: published with 2 entries
  const lb1 = result.leaderboards.find((l) => l.eventId === EVENT_1);
  assert.ok(lb1);
  assert.equal(lb1.eventCode, "EV-01");
  assert.equal(lb1.eventName, "Crisis Management");
  assert.equal(lb1.isPublished, true);
  assert.equal(lb1.lastUpdatedAt, "2026-12-04T13:00:00Z");
  assert.equal(lb1.entries.length, 2);

  // Assert manual positions and values preserved verbatim
  assert.equal(lb1.entries[0].position, 1);
  assert.equal(lb1.entries[0].displayValue, "95.5 pts");
  assert.equal(lb1.entries[0].contingentCode, "CONT-02");

  assert.equal(lb1.entries[1].position, 2);
  assert.equal(lb1.entries[1].displayValue, "91.0 pts");
  assert.equal(lb1.entries[1].contingentCode, "CONT-01");

  // Verify sensitive internal fields are completely stripped
  for (const entry of lb1.entries) {
    assert.equal("notes" in entry, false);
    assert.equal("created_by" in entry, false);
    assert.equal("updated_by" in entry, false);
    assert.equal("event_entry_id" in entry, false);
  }

  // Event 2: no leaderboard entries -> unpublished empty state
  const lb2 = result.leaderboards.find((l) => l.eventId === EVENT_2);
  assert.ok(lb2);
  assert.equal(lb2.eventCode, "EV-02");
  assert.equal(lb2.isPublished, false);
  assert.equal(lb2.entries.length, 0);
  assert.equal(lb2.lastUpdatedAt, null);
});

test("Stage 4.4D - preserves tied positions verbatim without auto-resolving", async () => {
  const result = await loadTeamLeaderboardsWithDeps(
    {
      contingentId: CONTINGENT_A,
      contingentCode: "CONT-01",
      contingentName: "Alpha Team",
      institutionName: "Institution One",
      deviceId: "dev-1",
    },
    {
      findContingentById: async (id) => ({
        id,
        code: "CONT-01",
        name: "Alpha Team",
        institution_name: "Institution One",
      }),
      loadRegisteredEvents: async () => [
        {
          event_id: EVENT_1,
          entry_status: "registered",
          event: {
            id: EVENT_1,
            code: "EV-01",
            title: "Debate",
            status: "completed",
          },
        },
      ],
      loadLeaderboardEntriesForEvents: async () => [
        {
          id: "entry-1",
          event_id: EVENT_1,
          position: 1,
          display_value: "Winner",
          contingent: { id: CONTINGENT_B, code: "CONT-02", name: "Beta", institution_name: "Inst B" },
          created_at: "2026-12-04T10:00:00Z",
          updated_at: "2026-12-04T10:00:00Z",
        },
        {
          id: "entry-2",
          event_id: EVENT_1,
          position: 2,
          display_value: "Tied 2nd",
          contingent: { id: CONTINGENT_A, code: "CONT-01", name: "Alpha", institution_name: "Inst A" },
          created_at: "2026-12-04T10:00:00Z",
          updated_at: "2026-12-04T10:00:00Z",
        },
        {
          id: "entry-3",
          event_id: EVENT_1,
          position: 2,
          display_value: "Tied 2nd",
          contingent: { id: CONTINGENT_C, code: "CONT-03", name: "Gamma", institution_name: "Inst C" },
          created_at: "2026-12-04T10:00:00Z",
          updated_at: "2026-12-04T10:00:00Z",
        },
        {
          id: "entry-4",
          event_id: EVENT_1,
          position: 4,
          display_value: "Finalist",
          contingent: { id: "44444444-4444-4444-8444-444444444444", code: "CONT-04", name: "Delta", institution_name: "Inst D" },
          created_at: "2026-12-04T10:00:00Z",
          updated_at: "2026-12-04T10:00:00Z",
        },
      ],
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const entries = result.leaderboards[0].entries;
  assert.equal(entries.length, 4);
  assert.deepEqual(
    entries.map((e) => e.position),
    [1, 2, 2, 4],
  );
  assert.deepEqual(
    entries.map((e) => e.displayValue),
    ["Winner", "Tied 2nd", "Tied 2nd", "Finalist"],
  );
});

test("Stage 4.4D - draft events are treated as unpublished even if entries exist", async () => {
  const result = await loadTeamLeaderboardsWithDeps(
    {
      contingentId: CONTINGENT_A,
      contingentCode: "CONT-01",
      contingentName: "Alpha Team",
      institutionName: "Institution One",
      deviceId: "dev-1",
    },
    {
      findContingentById: async (id) => ({
        id,
        code: "CONT-01",
        name: "Alpha Team",
        institution_name: "Institution One",
      }),
      loadRegisteredEvents: async () => [
        {
          event_id: EVENT_DRAFT,
          entry_status: "registered",
          event: {
            id: EVENT_DRAFT,
            code: "EV-DRAFT",
            title: "Draft Event",
            status: "draft",
          },
        },
      ],
      loadLeaderboardEntriesForEvents: async () => [
        {
          id: "entry-draft-1",
          event_id: EVENT_DRAFT,
          position: 1,
          display_value: "Draft Standings",
          contingent: { id: CONTINGENT_A, code: "CONT-01", name: "Alpha", institution_name: "Inst A" },
          created_at: "2026-12-04T10:00:00Z",
          updated_at: "2026-12-04T10:00:00Z",
        },
      ],
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.leaderboards.length, 1);
  assert.equal(result.leaderboards[0].isPublished, false);
  assert.equal(result.leaderboards[0].entries.length, 0);
  assert.equal(result.leaderboards[0].lastUpdatedAt, null);
});

test("Stage 4.4D - strictly excludes unregistered events and withdrawn/disqualified entries", async () => {
  let queriedEventIds = [];
  const result = await loadTeamLeaderboardsWithDeps(
    {
      contingentId: CONTINGENT_A,
      contingentCode: "CONT-01",
      contingentName: "Alpha Team",
      institutionName: "Institution One",
      deviceId: "dev-1",
    },
    {
      findContingentById: async (id) => ({
        id,
        code: "CONT-01",
        name: "Alpha Team",
        institution_name: "Institution One",
      }),
      loadRegisteredEvents: async () => [
        {
          event_id: EVENT_1,
          entry_status: "registered",
          event: { id: EVENT_1, code: "EV-01", title: "Event 1", status: "completed" },
        },
        {
          event_id: EVENT_2,
          entry_status: "withdrawn",
          event: { id: EVENT_2, code: "EV-02", title: "Event 2", status: "completed" },
        },
        {
          event_id: EVENT_3,
          entry_status: "disqualified",
          event: { id: EVENT_3, code: "EV-03", title: "Event 3", status: "completed" },
        },
      ],
      loadLeaderboardEntriesForEvents: async (eventIds) => {
        queriedEventIds = eventIds;
        return [];
      },
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  // Only EVENT_1 is active/registered
  assert.deepEqual(queriedEventIds, [EVENT_1]);
  assert.equal(result.leaderboards.length, 1);
  assert.equal(result.leaderboards[0].eventId, EVENT_1);
});

test("Stage 4.4D - fails gracefully when contingent is invalid or database errors occur", async () => {
  const invalidIdResult = await loadTeamLeaderboardsWithDeps(
    {
      contingentId: "not-a-valid-uuid",
      contingentCode: "CONT-01",
      contingentName: "Alpha Team",
      institutionName: "Institution One",
      deviceId: "dev-1",
    },
    {
      findContingentById: async () => null,
      loadRegisteredEvents: async () => [],
      loadLeaderboardEntriesForEvents: async () => [],
    },
  );
  assert.equal(invalidIdResult.ok, false);
  assert.match(invalidIdResult.error, /Invalid team session identifier/);

  const missingResult = await loadTeamLeaderboardsWithDeps(
    {
      contingentId: CONTINGENT_A,
      contingentCode: "CONT-01",
      contingentName: "Alpha Team",
      institutionName: "Institution One",
      deviceId: "dev-1",
    },
    {
      findContingentById: async () => null,
      loadRegisteredEvents: async () => [],
      loadLeaderboardEntriesForEvents: async () => [],
    },
  );
  assert.equal(missingResult.ok, false);
  assert.match(missingResult.error, /Contingent record not found/);

  const dbErrorResult = await loadTeamLeaderboardsWithDeps(
    {
      contingentId: CONTINGENT_A,
      contingentCode: "CONT-01",
      contingentName: "Alpha Team",
      institutionName: "Institution One",
      deviceId: "dev-1",
    },
    {
      findContingentById: async () => {
        throw new Error("DB connection timeout");
      },
      loadRegisteredEvents: async () => [],
      loadLeaderboardEntriesForEvents: async () => [],
    },
  );
  assert.equal(dbErrorResult.ok, false);
  assert.match(dbErrorResult.error, /DB connection timeout/);
});

test("Stage 4.4D - mutations remain restricted to organisers and reject participant sessions", () => {
  const actionsSrc = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/actions/leaderboard.ts"),
    "utf8",
  );
  // Enforces server action environment and organiser authorization
  assert.match(actionsSrc, /"use server"/);
  assert.match(actionsSrc, /requireActiveUserForAction\(ALL_ORGANISER_ROLES/);
  assert.match(actionsSrc, /export async function addLeaderboardEntryAction/);
  assert.match(actionsSrc, /export async function updateLeaderboardEntryAction/);
  assert.match(actionsSrc, /export async function removeLeaderboardEntryAction/);
  assert.equal(actionsSrc.includes("createSupabaseAdminClient"), false);
});

test("Stage 4.4D - architecture and boundary constraints", () => {
  // 1. Participant read module is server-only
  const readPath = path.join(ROOT_DIR, "src/lib/team-portal/leaderboard-read.ts");
  const readSrc = fs.readFileSync(readPath, "utf8");
  assert.match(readSrc, /import "server-only";/);
  assert.equal(readSrc.includes('"use server"'), false);
  assert.equal(readSrc.includes("'use server'"), false);

  // 2. Existing src/lib/leaderboard/read.ts must not be modified to include participant admin reads
  const orgReadPath = path.join(ROOT_DIR, "src/lib/leaderboard/read.ts");
  const orgReadSrc = fs.readFileSync(orgReadPath, "utf8");
  assert.equal(orgReadSrc.includes("createSupabaseAdminClient"), false);
  assert.equal(orgReadSrc.includes("getParticipantEventLeaderboard"), false);

  // 3. Page files must not expose forbidden substrings or direct admin calls
  const dashPath = path.join(ROOT_DIR, "src/app/team/page.tsx");
  const dashSrc = fs.readFileSync(dashPath, "utf8");
  assert.equal(dashSrc.includes("leaderboard"), false);
  assert.equal(dashSrc.includes("createSupabaseAdminClient"), false);

  const roundsPath = path.join(ROOT_DIR, "src/app/team/rounds/page.tsx");
  const roundsSrc = fs.readFileSync(roundsPath, "utf8");
  assert.equal(roundsSrc.includes("leaderboard"), false);
  assert.equal(roundsSrc.includes("createSupabaseAdminClient"), false);

  // 4. Participant leaderboard page has proper server guards and error alerts
  const pagePath = path.join(ROOT_DIR, "src/app/team/leaderboard/page.tsx");
  assert.ok(fs.existsSync(pagePath));
  const pageSrc = fs.readFileSync(pagePath, "utf8");
  assert.match(pageSrc, /requireActiveTeam\(\{ nextPath: "\/team\/leaderboard" \}\)/);
  assert.match(pageSrc, /loadParticipantLeaderboardsForTeam/);
  assert.match(pageSrc, /role="alert"/);
  assert.match(pageSrc, /BrandMark/);
  assert.match(pageSrc, /logoutTeamAction/);

  // 5. Client components must not import server modules
  const clientComponentPath = path.join(ROOT_DIR, "src/components/team/ParticipantLeaderboard.tsx");
  const clientSrc = fs.readFileSync(clientComponentPath, "utf8");
  assert.match(clientSrc, /^"use client";/);
  assert.equal(clientSrc.includes("team-portal"), false);
  assert.equal(clientSrc.includes("supabase/admin"), false);
  assert.equal(clientSrc.includes("<form"), false);
  assert.equal(clientSrc.includes("action="), false);
  assert.equal(clientSrc.includes("delete"), false);
  assert.equal(clientSrc.includes("remove"), false);
});
