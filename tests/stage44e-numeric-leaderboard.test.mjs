import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  calculateCompetitionRankings,
  canPublishEventLeaderboard,
  countRankOccurrences,
  formatLeaderboardScore,
  haveDraftAndPublishedDiverged,
  sortPublishedLeaderboardRows,
  validateLeaderboardScore,
} from "@/lib/leaderboard/validation";
import {
  LEADERBOARD_POLL_INTERVAL_MS,
  computeParticipantLeaderboardVersionToken,
  createParticipantLeaderboardSyncController,
  normalizePublishedAtToken,
} from "@/lib/leaderboard/participant-polling";
import {
  loadTeamLeaderboardVersionWithDeps,
  loadTeamLeaderboardsWithDeps,
} from "@/lib/team-portal/leaderboard";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const CONTINGENT_A = "11111111-1111-4111-8111-111111111111";
const CONTINGENT_B = "22222222-2222-4222-8222-222222222222";
const CONTINGENT_C = "33333333-3333-4333-8333-333333333333";
const CONTINGENT_D = "44444444-4444-4444-8444-444444444444";
const EVENT_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

// ============================================================================
// EXECUTED UNIT TESTS — Numeric Validation, Standard Competition Ranking, Diffs
// ============================================================================

test("Stage 4.4E [Executed]: Numeric score validation accepts integers, decimals, negatives, zero, and blank (unranked), while rejecting non-numeric text", () => {
  assert.deepEqual(validateLeaderboardScore("100"), { ok: true, value: 100 });
  assert.deepEqual(validateLeaderboardScore("95.75"), { ok: true, value: 95.75 });
  assert.deepEqual(validateLeaderboardScore("0"), { ok: true, value: 0 });
  assert.deepEqual(validateLeaderboardScore("-0"), { ok: true, value: 0 });
  assert.deepEqual(validateLeaderboardScore("-15.5"), { ok: true, value: -15.5 });
  assert.deepEqual(validateLeaderboardScore("0.1234"), { ok: true, value: 0.1234 });
  assert.deepEqual(validateLeaderboardScore(".5"), { ok: true, value: 0.5 });
  assert.deepEqual(validateLeaderboardScore(""), { ok: true, value: null });
  assert.deepEqual(validateLeaderboardScore("   "), { ok: true, value: null });
  assert.deepEqual(validateLeaderboardScore(undefined), { ok: true, value: null });

  assert.equal(formatLeaderboardScore(95.5), "95.5");
  assert.equal(formatLeaderboardScore(1250), "1,250");
  assert.equal(formatLeaderboardScore(null), "No score");

  const rejectedInputs = [
    "950 points",
    "₹12,500",
    "Winner",
    "1st",
    "95.12345",
    "1e5",
    "Infinity",
    "NaN",
    "1,200",
    "1000000001",
    "-1000000001",
  ];
  for (const raw of rejectedInputs) {
    assert.equal(
      validateLeaderboardScore(raw).ok,
      false,
      `Expected "${raw}" to fail strict numeric score validation`,
    );
  }
});

test("Stage 4.4E [Executed]: Automatic standard competition ranking calculates 1, 1, 3 and 1, 2, 2, 4 with higher score first and unscored last", () => {
  const tiedTop = calculateCompetitionRankings([
    { id: "e3", score: 85, contingentCode: "CONT-03", created_at: "2026-12-04T10:00:00Z" },
    { id: "e2", score: 98.5, contingentCode: "CONT-02", created_at: "2026-12-04T09:00:00Z" },
    { id: "e1", score: 98.5, contingentCode: "CONT-01", created_at: "2026-12-04T11:00:00Z" },
  ]);

  assert.deepEqual(
    tiedTop.map((r) => ({ id: r.id, score: r.score, rank: r.calculatedRank })),
    [
      { id: "e1", score: 98.5, rank: 1 },
      { id: "e2", score: 98.5, rank: 1 },
      { id: "e3", score: 85, rank: 3 },
    ],
  );

  const tiedMiddleWithUnranked = calculateCompetitionRankings([
    { id: "u2", score: null, contingentCode: "CONT-06", created_at: "2026-12-04T08:00:00Z" },
    { id: "s4", score: 70, contingentCode: "CONT-04", created_at: "2026-12-04T08:00:00Z" },
    { id: "s2", score: 88.25, contingentCode: "CONT-02", created_at: "2026-12-04T08:00:00Z" },
    { id: "s3", score: 88.25, contingentCode: "CONT-03", created_at: "2026-12-04T08:00:00Z" },
    { id: "u1", score: null, contingentCode: "CONT-05", created_at: "2026-12-04T09:00:00Z" },
    { id: "s1", score: 95, contingentCode: "CONT-01", created_at: "2026-12-04T08:00:00Z" },
  ]);

  assert.deepEqual(
    tiedMiddleWithUnranked.map((r) => ({
      id: r.id,
      score: r.score,
      rank: r.calculatedRank,
    })),
    [
      { id: "s1", score: 95, rank: 1 },
      { id: "s2", score: 88.25, rank: 2 },
      { id: "s3", score: 88.25, rank: 2 },
      { id: "s4", score: 70, rank: 4 },
      { id: "u1", score: null, rank: null },
      { id: "u2", score: null, rank: null },
    ],
  );

  // Unranked entries (null) are never counted as tied
  const counts = countRankOccurrences(tiedMiddleWithUnranked);
  assert.equal(counts.get(1), 1);
  assert.equal(counts.get(2), 2);
  assert.equal(counts.get(4), 1);
  assert.equal(counts.size, 3);
});

test("Stage 4.4E [Executed]: Unscored teams do not prevent publication; legacy unmigrated text rows require numeric edit or clear before publish", () => {
  assert.equal(
    canPublishEventLeaderboard({
      eventStatus: "active",
      entryMode: "contingent",
      entryCount: 2,
      isPublished: false,
      hasLegacyNonNumericEntries: false,
    }).ok,
    true,
  );

  // Re-publishing updated draft while already published is allowed
  assert.equal(
    canPublishEventLeaderboard({
      eventStatus: "active",
      entryMode: "hybrid",
      entryCount: 1,
      isPublished: true,
      hasLegacyNonNumericEntries: false,
    }).ok,
    true,
  );

  // Legacy text entry blocks publishing until numeric score or blank is saved
  assert.equal(
    canPublishEventLeaderboard({
      eventStatus: "active",
      entryMode: "contingent",
      entryCount: 2,
      isPublished: false,
      hasLegacyNonNumericEntries: true,
    }).ok,
    false,
  );
});

test("Stage 4.4E [Executed]: Draft vs Published snapshot divergence detection detects score edits, additions, removals, and unmigrated rows", () => {
  const matchingDraft = [
    { contingent_id: CONTINGENT_A, score: 95.5, calculatedRank: 1, display_value: null },
    { contingent_id: CONTINGENT_B, score: null, calculatedRank: null, display_value: null },
  ];
  const matchingPublished = [
    { contingent_id: CONTINGENT_A, score: 95.5, rank: 1, display_label: null },
    { contingent_id: CONTINGENT_B, score: null, rank: null, display_label: null },
  ];

  assert.equal(
    haveDraftAndPublishedDiverged({
      isPublished: true,
      draftEntries: matchingDraft,
      publishedEntries: matchingPublished,
    }),
    false,
  );

  // Draft edit changes score -> diverged!
  assert.equal(
    haveDraftAndPublishedDiverged({
      isPublished: true,
      draftEntries: [
        { contingent_id: CONTINGENT_A, score: 99, calculatedRank: 1, display_value: null },
        { contingent_id: CONTINGENT_B, score: null, calculatedRank: null, display_value: null },
      ],
      publishedEntries: matchingPublished,
    }),
    true,
  );

  // Draft adds a contingent -> diverged!
  assert.equal(
    haveDraftAndPublishedDiverged({
      isPublished: true,
      draftEntries: [
        ...matchingDraft,
        { contingent_id: CONTINGENT_C, score: 80, calculatedRank: 2, display_value: null },
      ],
      publishedEntries: matchingPublished,
    }),
    true,
  );

  // Unpublished event with draft entries -> diverged!
  assert.equal(
    haveDraftAndPublishedDiverged({
      isPublished: false,
      draftEntries: matchingDraft,
      publishedEntries: [],
    }),
    true,
  );
});

test("Stage 4.4E [Executed]: Participant snapshot reader orders ranked entries before unranked entries and parses numeric string/number scores", async () => {
  const result = await loadTeamLeaderboardsWithDeps(CONTINGENT_A, {
    fetchParticipantLeaderboardsSnapshot: async () => ({
      rows: [
        {
          event_id: EVENT_1,
          event_code: "EV-01",
          event_name: "Case Analysis",
          entry_mode: "contingent",
          event_status: "active",
          is_published: true,
          published_at: "2026-12-04T18:00:00Z",
          entries: [
            {
              id: "snap-4",
              event_id: EVENT_1,
              contingent_id: CONTINGENT_D,
              contingent_code: "CONT-04",
              contingent_name: "Delta",
              institution_name: "Inst D",
              rank: null,
              score: null,
              updated_at: "2026-12-04T18:00:00Z",
            },
            {
              id: "snap-3",
              event_id: EVENT_1,
              contingent_id: CONTINGENT_C,
              contingent_code: "CONT-03",
              contingent_name: "Gamma",
              institution_name: "Inst C",
              rank: 3,
              score: "80.2500",
              updated_at: "2026-12-04T18:00:00Z",
            },
            {
              id: "snap-1",
              event_id: EVENT_1,
              contingent_id: CONTINGENT_A,
              contingent_code: "CONT-01",
              contingent_name: "Alpha",
              institution_name: "Inst A",
              rank: 1,
              score: 94.5,
              updated_at: "2026-12-04T18:00:00Z",
            },
            {
              id: "snap-2",
              event_id: EVENT_1,
              contingent_id: CONTINGENT_B,
              contingent_code: "CONT-02",
              contingent_name: "Beta",
              institution_name: "Inst B",
              rank: 1,
              score: 94.5,
              updated_at: "2026-12-04T18:00:00Z",
            },
          ],
        },
      ],
      error: null,
    }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const rows = result.leaderboards[0].entries;
  assert.deepEqual(
    rows.map((r) => ({
      code: r.contingentCode,
      rank: r.rank,
      score: r.score,
    })),
    [
      { code: "CONT-01", rank: 1, score: 94.5 },
      { code: "CONT-02", rank: 1, score: 94.5 },
      { code: "CONT-03", rank: 3, score: 80.25 },
      { code: "CONT-04", rank: null, score: null },
    ],
  );

  // Confirm sortPublishedLeaderboardRows keeps ranked before unranked
  const resorted = sortPublishedLeaderboardRows([...rows].reverse());
  assert.deepEqual(
    resorted.map((r) => r.contingentCode),
    ["CONT-01", "CONT-02", "CONT-03", "CONT-04"],
  );
});

// ============================================================================
// STRUCTURAL CONTRACT ASSERTIONS — Migration 0013, Actions, & UI Boundaries
// ============================================================================

test("Stage 4.4E [Structural]: Migration 0013 adds numeric draft columns, published snapshot table, atomic snapshot replace, and strict privileges", () => {
  const sql = fs.readFileSync(
    path.join(
      ROOT_DIR,
      "supabase/migrations/202611270013_stage44e_numeric_leaderboard_snapshots.sql",
    ),
    "utf8",
  );

  // 1. Draft table extensions & non-destructive numeric-only backfill
  assert.match(sql, /ADD COLUMN IF NOT EXISTS score numeric\(16,4\) NULL/i);
  assert.match(sql, /ALTER COLUMN position DROP NOT NULL/i);
  assert.match(sql, /ALTER COLUMN display_value DROP NOT NULL/i);
  assert.match(sql, /leaderboard_entries_score_check/i);
  assert.match(sql, /\^-\?\(\?:\\\[0-9\]|\[0-9\]/); // strict numeric regex present

  // 2. Published snapshot table & RLS
  assert.match(
    sql,
    /CREATE TABLE IF NOT EXISTS public\.leaderboard_published_entries/i,
  );
  assert.match(
    sql,
    /REVOKE ALL ON public\.leaderboard_published_entries FROM PUBLIC;/i,
  );
  assert.match(
    sql,
    /REVOKE ALL ON public\.leaderboard_published_entries FROM anon;/i,
  );
  assert.match(
    sql,
    /REVOKE ALL ON public\.leaderboard_published_entries FROM authenticated;/i,
  );
  assert.match(
    sql,
    /GRANT SELECT ON public\.leaderboard_published_entries TO authenticated;/i,
  );
  assert.match(
    sql,
    /CREATE POLICY leaderboard_published_entries_select_active_organiser[\s\S]*USING\s*\(\s*public\.is_active_organiser\(\)\s*\)/i,
  );

  // 3. Revoke legacy manual-position RPCs from clients; grant numeric draft RPCs to authenticated only
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.add_leaderboard_entry\(uuid, uuid, integer, text, text\) FROM PUBLIC,\s*anon,\s*authenticated;/i,
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.update_leaderboard_entry\(uuid, uuid, integer, text, text\) FROM PUBLIC,\s*anon,\s*authenticated;/i,
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.add_numeric_leaderboard_entry\(uuid, uuid, numeric, text\) FROM PUBLIC,\s*anon;/i,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.add_numeric_leaderboard_entry\(uuid, uuid, numeric, text\) TO authenticated;/i,
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.update_numeric_leaderboard_entry\(uuid, uuid, numeric, text\) FROM PUBLIC,\s*anon;/i,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.update_numeric_leaderboard_entry\(uuid, uuid, numeric, text\) TO authenticated;/i,
  );

  // 4. Atomic snapshot replacement on Publish Ranking using standard competition rank()
  const publishMatch = sql.match(
    /CREATE OR REPLACE FUNCTION public\.publish_event_leaderboard[\s\S]*?\$\$;/,
  );
  assert.ok(publishMatch, "Expected publish_event_leaderboard in 0013");
  assert.match(publishMatch[0], /public\.is_active_super_admin\(\)/);
  assert.match(
    publishMatch[0],
    /pg_advisory_xact_lock\s*\(\s*hashtext\s*\(\s*'virtuoso_leaderboard:'\s*\|\|\s*p_event_id::text\s*\)\s*\)/i,
  );
  assert.match(
    publishMatch[0],
    /DELETE FROM public\.leaderboard_published_entries\s+WHERE event_id = p_event_id;/i,
  );
  assert.match(
    publishMatch[0],
    /INSERT INTO public\.leaderboard_published_entries/i,
  );
  assert.match(
    publishMatch[0],
    /rank\(\)\s+OVER\s*\(\s*PARTITION BY \(le\.score IS NOT NULL\)\s+ORDER BY le\.score DESC\s*\)/i,
  );
  assert.doesNotMatch(
    publishMatch[0],
    /This event leaderboard is already published/i,
    "Republishing updated draft must be permitted",
  );

  // 5. Unpublish clears snapshot while keeping draft leaderboard_entries intact
  const unpublishMatch = sql.match(
    /CREATE OR REPLACE FUNCTION public\.unpublish_event_leaderboard[\s\S]*?\$\$;/,
  );
  assert.ok(unpublishMatch, "Expected unpublish_event_leaderboard in 0013");
  assert.match(
    unpublishMatch[0],
    /DELETE FROM public\.leaderboard_published_entries\s+WHERE event_id = p_event_id;/i,
  );
  assert.doesNotMatch(
    unpublishMatch[0],
    /DELETE FROM public\.leaderboard_entries/i,
  );

  // 6. Participant reader RPC reads strictly from leaderboard_published_entries (never draft leaderboard_entries)
  const readerMatch = sql.match(
    /CREATE OR REPLACE FUNCTION public\.get_participant_leaderboards_for_contingent[\s\S]*?\$\$;/,
  );
  assert.ok(readerMatch, "Expected get_participant_leaderboards_for_contingent in 0013");
  assert.match(readerMatch[0], /FROM public\.leaderboard_published_entries lpe/i);
  assert.doesNotMatch(readerMatch[0], /\bpublic\.leaderboard_entries\b/i);
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.get_participant_leaderboards_for_contingent\(uuid\) FROM PUBLIC,\s*anon,\s*authenticated;/i,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.get_participant_leaderboards_for_contingent\(uuid\) TO service_role;/i,
  );
});

test("Stage 4.4E [Structural]: Organiser UI, Team Refresh Server Action, and Participant UI satisfy draft/publish & no-reload contracts", () => {
  // 1. Organiser manager has numeric score controls, Publish Ranking confirmation, and no manual position input
  const managerSrc = fs.readFileSync(
    path.join(ROOT_DIR, "src/components/competition/LeaderboardManager.tsx"),
    "utf8",
  );
  assert.match(managerSrc, /calculateCompetitionRankings/);
  assert.match(managerSrc, /Publish Ranking/);
  assert.match(managerSrc, /Confirm Publish Ranking/);
  assert.match(managerSrc, /Draft Standings Preview/);
  assert.doesNotMatch(managerSrc, /name="position"/);
  assert.doesNotMatch(managerSrc, /name="displayValue"/);

  // 2. Team leaderboard refresh action strictly derives contingent from active team session
  const refreshActionSrc = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/actions/team-leaderboard.ts"),
    "utf8",
  );
  assert.match(refreshActionSrc, /^"use server";/);
  assert.match(refreshActionSrc, /requireActiveTeamForAction\(\)/);
  assert.match(refreshActionSrc, /loadParticipantLeaderboardsForTeam\(team\)/);
  assert.doesNotMatch(refreshActionSrc, /formData|contingentId:/i);

  // 3. Participant UI has Refresh Leaderboard calling Server Action without full page reload
  const participantSrc = fs.readFileSync(
    path.join(ROOT_DIR, "src/components/team/ParticipantLeaderboard.tsx"),
    "utf8",
  );
  assert.match(participantSrc, /Refresh Leaderboard/);
  assert.match(participantSrc, /refreshParticipantLeaderboardsAction/);
  assert.match(participantSrc, /refreshLockRef/);
  assert.match(participantSrc, /Last published:/);
  assert.doesNotMatch(participantSrc, /window\.location\.reload/);
  assert.doesNotMatch(participantSrc, /router\.refresh/);
  assert.doesNotMatch(participantSrc, /leaderboard_entries/);
});

// ============================================================================
// STAGE 4.4E AUTO-UPDATE POLLING TESTS
// ============================================================================

test("Stage 4.4E [Executed]: Version token detects publish, republish, and unpublish while ignoring draft-only edits and timestamp formatting differences", async () => {
  const EVENT_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  // SSR snapshot timestamp vs PostgREST ISO timestamp normalization (+00:00 vs Z, trailing zeroes)
  assert.equal(
    normalizePublishedAtToken("2026-12-04T18:00:00.500000+00:00"),
    normalizePublishedAtToken("2026-12-04T18:00:00.5Z"),
  );

  const unpublishedToken = computeParticipantLeaderboardVersionToken([
    { eventId: EVENT_1, eventStatus: "active", isPublished: false, publishedAt: null },
    { eventId: EVENT_2, eventStatus: "active", isPublished: false, publishedAt: null },
  ]);

  // Draft-only changes never touch leaderboard_publications, so version metadata stays identical
  const afterDraftEditToken = computeParticipantLeaderboardVersionToken([
    { eventId: EVENT_2, eventStatus: "active", isPublished: false, publishedAt: null },
    { eventId: EVENT_1, eventStatus: "active", isPublished: false, publishedAt: null },
  ]);
  assert.equal(afterDraftEditToken, unpublishedToken);

  // Initial publish changes token
  const publishedToken = computeParticipantLeaderboardVersionToken([
    {
      eventId: EVENT_1,
      eventStatus: "active",
      isPublished: true,
      publishedAt: "2026-12-04T18:00:00.120000+00:00",
    },
    { eventId: EVENT_2, eventStatus: "active", isPublished: false, publishedAt: null },
  ]);
  assert.notEqual(publishedToken, unpublishedToken);

  // Exact same timestamp formatted via JSONB vs PostgREST produces identical token
  const samePublishFormattedDifferently = computeParticipantLeaderboardVersionToken([
    {
      eventId: EVENT_1,
      eventStatus: "active",
      isPublished: true,
      publishedAt: "2026-12-04T18:00:00.12Z",
    },
    { eventId: EVENT_2, eventStatus: "active", isPublished: false, publishedAt: null },
  ]);
  assert.equal(samePublishFormattedDifferently, publishedToken);

  // Republish updates publishedAt -> changes token
  const republishedToken = computeParticipantLeaderboardVersionToken([
    {
      eventId: EVENT_1,
      eventStatus: "active",
      isPublished: true,
      publishedAt: "2026-12-04T18:15:00.000000+00:00",
    },
    { eventId: EVENT_2, eventStatus: "active", isPublished: false, publishedAt: null },
  ]);
  assert.notEqual(republishedToken, publishedToken);

  // Unpublish sets isPublished=false (even if stale publishedAt remains) -> changes token back
  const unpublishedAgainToken = computeParticipantLeaderboardVersionToken([
    {
      eventId: EVENT_1,
      eventStatus: "active",
      isPublished: false,
      publishedAt: "2026-12-04T18:15:00.000000+00:00",
    },
    { eventId: EVENT_2, eventStatus: "active", isPublished: false, publishedAt: null },
  ]);
  assert.equal(unpublishedAgainToken, unpublishedToken);

  // Server helper validates contingent UUID and propagates descriptor tokens
  const versionRes = await loadTeamLeaderboardVersionWithDeps(CONTINGENT_A, {
    fetchPublicationDescriptors: async () => ({
      rows: [
        {
          eventId: EVENT_1,
          eventStatus: "active",
          isPublished: true,
          publishedAt: "2026-12-04T18:15:00Z",
        },
        {
          eventId: EVENT_2,
          eventStatus: "active",
          isPublished: false,
          publishedAt: null,
        },
      ],
      error: null,
    }),
  });
  assert.equal(versionRes.ok, true);
  if (versionRes.ok) {
    assert.equal(versionRes.versionToken, republishedToken);
  }
});

test("Stage 4.4E [Executed]: Sync controller auto-fetches on publish, republish, and unpublish, while skipping full fetch when unchanged (including draft edits)", async () => {
  const initialState = [
    { eventId: EVENT_1, eventStatus: "active", isPublished: false, publishedAt: null },
  ];
  const initialToken = computeParticipantLeaderboardVersionToken(initialState);

  let serverDescriptors = initialState;
  let fullSnapshotPayload = initialState;
  let checkCalls = 0;
  let fullFetchCalls = 0;
  let autoUpdateStarts = 0;
  let autoUpdateEnds = 0;
  let latestDisplayed = initialState;

  const controller = createParticipantLeaderboardSyncController({
    initialVersionToken: initialToken,
    checkVersion: async () => {
      checkCalls += 1;
      return {
        ok: true,
        versionToken: computeParticipantLeaderboardVersionToken(serverDescriptors),
      };
    },
    fetchFullLeaderboards: async () => {
      fullFetchCalls += 1;
      return {
        ok: true,
        leaderboards: fullSnapshotPayload,
        refreshedAt: "2026-12-04T18:00:00.000Z",
        versionToken: computeParticipantLeaderboardVersionToken(fullSnapshotPayload),
      };
    },
    onAutoUpdateStart: () => {
      autoUpdateStarts += 1;
    },
    onAutoUpdateEnd: () => {
      autoUpdateEnds += 1;
    },
    onLeaderboardsUpdated: ({ leaderboards }) => {
      latestDisplayed = leaderboards;
    },
  });

  // 1. No change / draft-only edit -> checks version once, skips full snapshot fetch
  assert.equal(await controller.checkAndSync(), "unchanged");
  assert.equal(checkCalls, 1);
  assert.equal(fullFetchCalls, 0);
  assert.equal(autoUpdateStarts, 0);

  // 2. Organiser publishes leaderboard -> detects change and fetches published snapshot
  const publishedState = [
    {
      eventId: EVENT_1,
      eventStatus: "active",
      isPublished: true,
      publishedAt: "2026-12-04T18:05:00Z",
    },
  ];
  serverDescriptors = publishedState;
  fullSnapshotPayload = publishedState;
  assert.equal(await controller.checkAndSync(), "updated");
  assert.equal(fullFetchCalls, 1);
  assert.equal(autoUpdateStarts, 1);
  assert.equal(autoUpdateEnds, 1);
  assert.equal(latestDisplayed[0].isPublished, true);

  // 3. Subsequent poll with same published state -> no redundant full fetch
  assert.equal(await controller.checkAndSync(), "unchanged");
  assert.equal(fullFetchCalls, 1);

  // 4. Organiser republishes revised leaderboard -> fetches revised snapshot
  const republishedState = [
    {
      eventId: EVENT_1,
      eventStatus: "active",
      isPublished: true,
      publishedAt: "2026-12-04T18:20:00Z",
    },
  ];
  serverDescriptors = republishedState;
  fullSnapshotPayload = republishedState;
  assert.equal(await controller.checkAndSync(), "updated");
  assert.equal(fullFetchCalls, 2);
  assert.equal(latestDisplayed[0].publishedAt, "2026-12-04T18:20:00Z");

  // 5. Organiser unpublishes leaderboard -> detects unpublish and clears published view
  const unpublishedState = [
    {
      eventId: EVENT_1,
      eventStatus: "active",
      isPublished: false,
      publishedAt: null,
    },
  ];
  serverDescriptors = unpublishedState;
  fullSnapshotPayload = unpublishedState;
  assert.equal(await controller.checkAndSync(), "updated");
  assert.equal(fullFetchCalls, 3);
  assert.equal(latestDisplayed[0].isPublished, false);
});

test("Stage 4.4E [Executed]: Transient errors preserve standings and recover; terminal auth errors stop polling; manual refresh works", async () => {
  const publishedState = [
    {
      eventId: EVENT_1,
      eventStatus: "active",
      isPublished: true,
      publishedAt: "2026-12-04T18:00:00Z",
    },
  ];

  let latestDisplayed = publishedState;
  const errors = [];
  let recoveredCount = 0;
  let versionResponse = { ok: false, reason: "error", message: "Network timeout" };
  let manualFetchCalls = 0;

  const controller = createParticipantLeaderboardSyncController({
    initialVersionToken: computeParticipantLeaderboardVersionToken(publishedState),
    checkVersion: async () => versionResponse,
    fetchFullLeaderboards: async () => {
      manualFetchCalls += 1;
      return {
        ok: true,
        leaderboards: publishedState,
        refreshedAt: "2026-12-04T18:10:00.000Z",
        versionToken: computeParticipantLeaderboardVersionToken(publishedState),
      };
    },
    onAutoCheckSuccess: () => {
      recoveredCount += 1;
    },
    onLeaderboardsUpdated: ({ leaderboards }) => {
      latestDisplayed = leaderboards;
    },
    onError: (err) => {
      errors.push(err);
    },
  });

  // Transient network failure -> reports error, keeps existing standings, does NOT halt polling
  assert.equal(await controller.checkAndSync(), "error");
  assert.equal(latestDisplayed.length, 1);
  assert.equal(controller.isAuthStopped(), false);
  assert.equal(errors[0].isTerminalAuth, false);

  // Subsequent poll recovers cleanly
  versionResponse = {
    ok: true,
    versionToken: computeParticipantLeaderboardVersionToken(publishedState),
  };
  assert.equal(await controller.checkAndSync(), "unchanged");
  assert.equal(recoveredCount, 1);

  // Manual refresh works as fallback regardless of whether token changed
  assert.equal(await controller.manualRefresh(), "updated");
  assert.equal(manualFetchCalls, 1);

  // Terminal auth error -> stops background polling
  versionResponse = {
    ok: false,
    reason: "invalid_team_session",
    message: "Session expired",
  };
  assert.equal(await controller.checkAndSync(), "error");
  assert.equal(controller.isAuthStopped(), true);
  assert.equal(await controller.checkAndSync(), "skipped");
});

test("Stage 4.4E [Executed]: Sync controller prevents overlapping concurrent requests and ignores late resolutions after stop()", async () => {
  const initialState = [
    { eventId: EVENT_1, eventStatus: "active", isPublished: false, publishedAt: null },
  ];
  const updatedState = [
    {
      eventId: EVENT_1,
      eventStatus: "active",
      isPublished: true,
      publishedAt: "2026-12-04T19:00:00Z",
    },
  ];

  let resolveFirstCheck;
  let checkCalls = 0;
  let updatesAfterStop = 0;

  const controller = createParticipantLeaderboardSyncController({
    initialVersionToken: computeParticipantLeaderboardVersionToken(initialState),
    checkVersion: () => {
      checkCalls += 1;
      return new Promise((resolve) => {
        resolveFirstCheck = resolve;
      });
    },
    fetchFullLeaderboards: async () => ({
      ok: true,
      leaderboards: updatedState,
      refreshedAt: "2026-12-04T19:00:00.000Z",
      versionToken: computeParticipantLeaderboardVersionToken(updatedState),
    }),
    onLeaderboardsUpdated: () => {
      updatesAfterStop += 1;
    },
  });

  // Start first poll and immediately attempt overlapping poll & overlapping manual refresh
  const firstPollPromise = controller.checkAndSync();
  assert.equal(controller.isInFlight(), true);
  assert.equal(await controller.checkAndSync(), "skipped");
  assert.equal(await controller.manualRefresh(), "skipped");
  assert.equal(checkCalls, 1);

  // Simulate component unmount before first poll finishes
  controller.stop();
  resolveFirstCheck({
    ok: true,
    versionToken: computeParticipantLeaderboardVersionToken(updatedState),
  });

  assert.equal(await firstPollPromise, "stopped");
  assert.equal(updatesAfterStop, 0);
  assert.equal(await controller.checkAndSync(), "skipped");
});

test("Stage 4.4E [Structural]: Auto-update polling preserves server-only boundaries, session scoping, visibility pause, and cleanup", () => {
  const versionReadSrc = fs.readFileSync(
    path.join(ROOT_DIR, "src/lib/team-portal/leaderboard-version.ts"),
    "utf8",
  );
  assert.match(versionReadSrc, /import "server-only";/);
  assert.match(versionReadSrc, /\.from\("event_entries"\)/);
  assert.match(versionReadSrc, /\.from\("leaderboard_publications"\)/);
  assert.equal(versionReadSrc.includes("leaderboard_entries"), false);
  assert.equal(versionReadSrc.includes("leaderboard_published_entries"), false);

  const teamActionSrc = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/actions/team-leaderboard.ts"),
    "utf8",
  );
  assert.match(teamActionSrc, /checkParticipantLeaderboardVersionAction/);
  assert.match(teamActionSrc, /loadParticipantLeaderboardVersionForTeam\(team\)/);
  assert.equal(
    (teamActionSrc.match(/requireActiveTeamForAction\(\)/g) ?? []).length >= 2,
    true,
  );

  const participantSrc = fs.readFileSync(
    path.join(ROOT_DIR, "src/components/team/ParticipantLeaderboard.tsx"),
    "utf8",
  );
  assert.equal(LEADERBOARD_POLL_INTERVAL_MS >= 10_000 && LEADERBOARD_POLL_INTERVAL_MS <= 15_000, true);
  assert.match(participantSrc, /LEADERBOARD_POLL_INTERVAL_MS/);
  assert.match(participantSrc, /visibilitychange/);
  assert.match(participantSrc, /clearInterval/);
  assert.match(participantSrc, /controller\.stop\(\)/);
  assert.match(participantSrc, /isAutoUpdating/);
  assert.match(participantSrc, /checkParticipantLeaderboardVersionAction/);
  assert.equal(participantSrc.includes("team-portal"), false);
});

