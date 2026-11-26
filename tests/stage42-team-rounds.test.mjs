import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { loadTeamCurrentRoundsWithDeps } from "../src/lib/team-portal/rounds.ts";

const ROOT_DIR = process.cwd();

const CONTINGENT_ALPHA = "cccc1111-1111-4111-8111-111111111111";
const CONTINGENT_BETA = "cccc2222-2222-4222-8222-222222222222";

const EVENT_ACTIVE_1 = "eeee1111-1111-4111-8111-111111111111";
const EVENT_ACTIVE_2 = "eeee2222-2222-4222-8222-222222222222";
const EVENT_DRAFT = "eeee3333-3333-4333-8333-333333333333";

const ROUND_OPEN_1 = "11111111-1111-4111-8111-111111111111";
const ROUND_OPEN_REOPENED = "22222222-2222-4222-8222-222222222222";
const ROUND_DRAFT = "33333333-3333-4333-8333-333333333333";
const ROUND_READY = "44444444-4444-4444-8444-444444444444";
const ROUND_CLOSED = "55555555-5555-4555-8555-555555555555";
const ROUND_EXPIRED = "66666666-6666-4666-8666-666666666666";
const ROUND_COMPLETED = "77777777-7777-4777-8777-777777777777";
const ROUND_ARCHIVED = "88888888-8888-4888-8888-888888888888";
const ROUND_IN_DRAFT_EVENT = "99999999-9999-4999-8999-999999999999";

const DB_NOW_ISO = "2026-12-04T10:30:00.000Z";
const STARTED_AT = "2026-12-04T10:00:00.000Z";
const EXPIRES_FUTURE = "2026-12-04T11:30:00.000Z";
const EXPIRES_EXACT = DB_NOW_ISO;
const EXPIRES_PAST = "2026-12-04T10:15:00.000Z";
const STARTED_FUTURE = "2026-12-04T11:00:00.000Z";

function makeSession(overrides = {}) {
  return {
    id: overrides.id ?? "aaaa0000-0000-4000-8000-000000000001",
    event_id: overrides.event_id ?? EVENT_ACTIVE_1,
    round_id: overrides.round_id ?? ROUND_OPEN_1,
    session_number: overrides.session_number ?? 1,
    duration_minutes: overrides.duration_minutes ?? 90,
    started_at: overrides.started_at ?? STARTED_AT,
    expires_at: overrides.expires_at ?? EXPIRES_FUTURE,
    closed_at: overrides.closed_at === undefined ? null : overrides.closed_at,
    close_reason: overrides.close_reason ?? null,
    released_by: "bbbb0000-0000-4000-8000-000000000001",
    closed_by: null,
    notes: null,
    created_at: STARTED_AT,
    updated_at: STARTED_AT,
  };
}

test("Stage 4.2 (1) [Mocked Unit Test]: Grants identical current-round access to any authenticated team regardless of contingent identity or event registration", async () => {
  let timestampCalls = 0;
  const invalidResult = await loadTeamCurrentRoundsWithDeps("not-a-uuid", {
    async getDbServerTimestamp() {
      timestampCalls += 1;
      return { timestampIso: DB_NOW_ISO, error: null };
    },
    async findOpenReleaseSessions() {
      return { rows: [], error: null };
    },
    async findActiveEventsByIds() {
      return { rows: [], error: null };
    },
    async findDeployedRoundsByIds() {
      return { rows: [], error: null };
    },
  });

  assert.equal(invalidResult.ok, false);
  assert.equal(timestampCalls, 0);

  const sharedDeps = {
    async getDbServerTimestamp() {
      return { timestampIso: DB_NOW_ISO, error: null };
    },
    async findOpenReleaseSessions() {
      return {
        rows: [
          makeSession({
            id: "aaaa0000-0000-4000-8000-000000000011",
            event_id: EVENT_ACTIVE_2,
            round_id: ROUND_OPEN_1,
          }),
        ],
        error: null,
      };
    },
    async findActiveEventsByIds(eventIds) {
      assert.deepEqual(eventIds, [EVENT_ACTIVE_2]);
      return {
        rows: [
          {
            id: EVENT_ACTIVE_2,
            code: "MKT-02",
            name: "Brand Strategy",
            status: "active",
          },
        ],
        error: null,
      };
    },
    async findDeployedRoundsByIds(roundIds) {
      assert.deepEqual(roundIds, [ROUND_OPEN_1]);
      return {
        rows: [
          {
            id: ROUND_OPEN_1,
            event_id: EVENT_ACTIVE_2,
            round_number: 1,
            name: "Market Entry Brief",
            description: "Prepare a 5-minute market sizing brief.",
            status: "deployed",
            duration_minutes: 90,
            is_locked: false,
          },
        ],
        error: null,
      };
    },
  };

  const alphaResult = await loadTeamCurrentRoundsWithDeps(
    ` ${CONTINGENT_ALPHA.toUpperCase()} `,
    sharedDeps,
  );
  const betaResult = await loadTeamCurrentRoundsWithDeps(
    CONTINGENT_BETA,
    sharedDeps,
  );

  assert.deepEqual(alphaResult, betaResult);
  assert.deepEqual(alphaResult, {
    ok: true,
    rounds: [
      {
        roundId: ROUND_OPEN_1,
        eventId: EVENT_ACTIVE_2,
        eventCode: "MKT-02",
        eventName: "Brand Strategy",
        roundNumber: 1,
        roundName: "Market Entry Brief",
        roundDescription: "Prepare a 5-minute market sizing brief.",
      },
    ],
  });
});

test("Stage 4.2 (2) [Mocked Unit Test]: Completely hides unreleased, future-scheduled, closed, expired, completed, archived, and draft-event rounds", async () => {
  const result = await loadTeamCurrentRoundsWithDeps(CONTINGENT_ALPHA, {
    async getDbServerTimestamp() {
      return { timestampIso: DB_NOW_ISO, error: null };
    },
    async findOpenReleaseSessions() {
      return {
        rows: [
          // Valid live session
          makeSession({
            id: "aaaa0000-0000-4000-8000-000000000101",
            event_id: EVENT_ACTIVE_1,
            round_id: ROUND_OPEN_1,
          }),
          // Unreleased draft/ready rounds even if anomalous session existed
          makeSession({
            id: "aaaa0000-0000-4000-8000-000000000102",
            event_id: EVENT_ACTIVE_1,
            round_id: ROUND_DRAFT,
          }),
          makeSession({
            id: "aaaa0000-0000-4000-8000-000000000103",
            event_id: EVENT_ACTIVE_1,
            round_id: ROUND_READY,
          }),
          // Future started_at window
          makeSession({
            id: "aaaa0000-0000-4000-8000-000000000104",
            event_id: EVENT_ACTIVE_1,
            round_id: ROUND_OPEN_REOPENED,
            started_at: STARTED_FUTURE,
          }),
          // Explicitly closed session
          makeSession({
            id: "aaaa0000-0000-4000-8000-000000000105",
            event_id: EVENT_ACTIVE_1,
            round_id: ROUND_CLOSED,
            closed_at: "2026-12-04T10:20:00.000Z",
          }),
          // Expired open session (at exact boundary and strictly past)
          makeSession({
            id: "aaaa0000-0000-4000-8000-000000000106",
            event_id: EVENT_ACTIVE_1,
            round_id: ROUND_EXPIRED,
            expires_at: EXPIRES_EXACT,
          }),
          makeSession({
            id: "aaaa0000-0000-4000-8000-000000000107",
            event_id: EVENT_ACTIVE_1,
            round_id: ROUND_COMPLETED,
            expires_at: EXPIRES_PAST,
          }),
          // Completed/archived round status
          makeSession({
            id: "aaaa0000-0000-4000-8000-000000000108",
            event_id: EVENT_ACTIVE_1,
            round_id: ROUND_ARCHIVED,
          }),
          // Non-active parent event
          makeSession({
            id: "aaaa0000-0000-4000-8000-000000000109",
            event_id: EVENT_DRAFT,
            round_id: ROUND_IN_DRAFT_EVENT,
          }),
        ],
        error: null,
      };
    },
    async findActiveEventsByIds() {
      return {
        rows: [
          {
            id: EVENT_ACTIVE_1,
            code: "FIN-01",
            name: "Finance Conclave",
            status: "active",
          },
          {
            id: EVENT_DRAFT,
            code: "OPS-09",
            name: "Draft Operations",
            status: "draft",
          },
        ],
        error: null,
      };
    },
    async findDeployedRoundsByIds() {
      return {
        rows: [
          {
            id: ROUND_OPEN_1,
            event_id: EVENT_ACTIVE_1,
            round_number: 1,
            name: "Valuation Case",
            description: "Analyze comparable multiples.",
            status: "deployed",
            duration_minutes: 90,
            is_locked: false,
          },
          {
            id: ROUND_DRAFT,
            event_id: EVENT_ACTIVE_1,
            round_number: 2,
            name: "Hidden Draft",
            description: null,
            status: "draft",
            duration_minutes: 60,
            is_locked: false,
          },
          {
            id: ROUND_READY,
            event_id: EVENT_ACTIVE_1,
            round_number: 3,
            name: "Hidden Ready",
            description: null,
            status: "ready",
            duration_minutes: 60,
            is_locked: false,
          },
          {
            id: ROUND_CLOSED,
            event_id: EVENT_ACTIVE_1,
            round_number: 4,
            name: "Hidden Closed",
            description: null,
            status: "closed",
            duration_minutes: 60,
            is_locked: true,
          },
          {
            id: ROUND_EXPIRED,
            event_id: EVENT_ACTIVE_1,
            round_number: 5,
            name: "Hidden Expired Boundary",
            description: null,
            status: "deployed",
            duration_minutes: 30,
            is_locked: false,
          },
          {
            id: ROUND_COMPLETED,
            event_id: EVENT_ACTIVE_1,
            round_number: 6,
            name: "Hidden Completed",
            description: null,
            status: "completed",
            duration_minutes: 60,
            is_locked: true,
          },
          {
            id: ROUND_ARCHIVED,
            event_id: EVENT_ACTIVE_1,
            round_number: 7,
            name: "Hidden Archived",
            description: null,
            status: "archived",
            duration_minutes: 60,
            is_locked: true,
          },
          {
            id: ROUND_IN_DRAFT_EVENT,
            event_id: EVENT_DRAFT,
            round_number: 1,
            name: "Hidden Non-Active Event Round",
            description: null,
            status: "deployed",
            duration_minutes: 60,
            is_locked: false,
          },
        ],
        error: null,
      };
    },
  });

  assert.deepEqual(result, {
    ok: true,
    rounds: [
      {
        roundId: ROUND_OPEN_1,
        eventId: EVENT_ACTIVE_1,
        eventCode: "FIN-01",
        eventName: "Finance Conclave",
        roundNumber: 1,
        roundName: "Valuation Case",
        roundDescription: "Analyze comparable multiples.",
      },
    ],
  });
});

test("Stage 4.2 (3) [Mocked Unit Test]: Shows reopened rounds cleanly without leaking session numbers or prior history and sorts deterministically", async () => {
  const result = await loadTeamCurrentRoundsWithDeps(CONTINGENT_ALPHA, {
    async getDbServerTimestamp() {
      return { timestampIso: DB_NOW_ISO, error: null };
    },
    async findOpenReleaseSessions() {
      return {
        rows: [
          makeSession({
            id: "aaaa0000-0000-4000-8000-000000000201",
            event_id: EVENT_ACTIVE_2,
            round_id: ROUND_OPEN_REOPENED,
            session_number: 3,
          }),
          // Prior closed session for the same round should be ignored while open session #3 makes round visible
          makeSession({
            id: "aaaa0000-0000-4000-8000-000000000200",
            event_id: EVENT_ACTIVE_2,
            round_id: ROUND_OPEN_REOPENED,
            session_number: 1,
            closed_at: "2026-12-04T09:00:00.000Z",
          }),
          makeSession({
            id: "aaaa0000-0000-4000-8000-000000000202",
            event_id: EVENT_ACTIVE_1,
            round_id: ROUND_OPEN_1,
            session_number: 1,
          }),
        ],
        error: null,
      };
    },
    async findActiveEventsByIds() {
      return {
        rows: [
          {
            id: EVENT_ACTIVE_2,
            code: "MKT-02",
            name: "Brand Strategy",
            status: "active",
          },
          {
            id: EVENT_ACTIVE_1,
            code: "ACC-01",
            name: "Audit & Forensics",
            status: "active",
          },
        ],
        error: null,
      };
    },
    async findDeployedRoundsByIds() {
      return {
        rows: [
          {
            id: ROUND_OPEN_REOPENED,
            event_id: EVENT_ACTIVE_2,
            round_number: 2,
            name: "Crisis Simulation",
            description: null,
            status: "deployed",
            duration_minutes: 45,
            is_locked: false,
          },
          {
            id: ROUND_OPEN_1,
            event_id: EVENT_ACTIVE_1,
            round_number: 1,
            name: "Forensic Screening",
            description: "Identify ledger discrepancies.",
            status: "deployed",
            duration_minutes: 60,
            is_locked: false,
          },
        ],
        error: null,
      };
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.rounds, [
      {
        roundId: ROUND_OPEN_1,
        eventId: EVENT_ACTIVE_1,
        eventCode: "ACC-01",
        eventName: "Audit & Forensics",
        roundNumber: 1,
        roundName: "Forensic Screening",
        roundDescription: "Identify ledger discrepancies.",
      },
      {
        roundId: ROUND_OPEN_REOPENED,
        eventId: EVENT_ACTIVE_2,
        eventCode: "MKT-02",
        eventName: "Brand Strategy",
        roundNumber: 2,
        roundName: "Crisis Simulation",
        roundDescription: null,
      },
    ]);
    assert.equal("sessionNumber" in result.rounds[1], false);
    assert.equal("session_number" in result.rounds[1], false);
  }
});

test("Stage 4.2 (4) [Mocked Unit Test]: Returns clean empty list when no open release sessions exist", async () => {
  let secondaryLookupsCalled = false;

  const result = await loadTeamCurrentRoundsWithDeps(CONTINGENT_ALPHA, {
    async getDbServerTimestamp() {
      return { timestampIso: DB_NOW_ISO, error: null };
    },
    async findOpenReleaseSessions() {
      return { rows: [], error: null };
    },
    async findActiveEventsByIds() {
      secondaryLookupsCalled = true;
      return { rows: [], error: null };
    },
    async findDeployedRoundsByIds() {
      secondaryLookupsCalled = true;
      return { rows: [], error: null };
    },
  });

  assert.deepEqual(result, { ok: true, rounds: [] });
  assert.equal(secondaryLookupsCalled, false);
});

test("Stage 4.2 (5) [Mocked Unit Test]: Propagates explicit error state on database time or query failures rather than returning empty state", async () => {
  const loggedContexts = [];

  const timeFailure = await loadTeamCurrentRoundsWithDeps(CONTINGENT_ALPHA, {
    async getDbServerTimestamp() {
      return {
        timestampIso: null,
        error: "function public.get_db_server_timestamp() permission denied",
      };
    },
    async findOpenReleaseSessions() {
      throw new Error("Should not query sessions when DB clock fails");
    },
    async findActiveEventsByIds() {
      return { rows: [], error: null };
    },
    async findDeployedRoundsByIds() {
      return { rows: [], error: null };
    },
    onError(ctx) {
      loggedContexts.push(ctx);
    },
  });

  assert.equal(timeFailure.ok, false);
  if (!timeFailure.ok) {
    assert.match(timeFailure.error, /Unable to load active rounds/i);
    assert.equal(timeFailure.error.includes("permission denied"), false);
  }

  const sessionsFailure = await loadTeamCurrentRoundsWithDeps(
    CONTINGENT_ALPHA,
    {
      async getDbServerTimestamp() {
        return { timestampIso: DB_NOW_ISO, error: null };
      },
      async findOpenReleaseSessions() {
        return { rows: [], error: "connection reset by peer" };
      },
      async findActiveEventsByIds() {
        return { rows: [], error: null };
      },
      async findDeployedRoundsByIds() {
        return { rows: [], error: null };
      },
      onError(ctx) {
        loggedContexts.push(ctx);
      },
    },
  );
  assert.equal(sessionsFailure.ok, false);

  const roundsThrow = await loadTeamCurrentRoundsWithDeps(CONTINGENT_ALPHA, {
    async getDbServerTimestamp() {
      return { timestampIso: DB_NOW_ISO, error: null };
    },
    async findOpenReleaseSessions() {
      return { rows: [makeSession()], error: null };
    },
    async findActiveEventsByIds() {
      return {
        rows: [
          {
            id: EVENT_ACTIVE_1,
            code: "FIN-01",
            name: "Finance Conclave",
            status: "active",
          },
        ],
        error: null,
      };
    },
    async findDeployedRoundsByIds() {
      throw new Error("ECONNRESET");
    },
    onError(ctx) {
      loggedContexts.push(ctx);
    },
  });
  assert.equal(roundsThrow.ok, false);

  assert.deepEqual(loggedContexts, [
    "db_timestamp_error",
    "release_sessions_error",
    "rounds_or_events_throw",
  ]);
});

test("Stage 4.2 (6) [Static Structural Check]: Current rounds reader and page enforce server-only auth, DB clock checks, no contingent scoping, no leaks of future/past/deferred features", () => {
  const roundsReadSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/lib/team-portal/rounds-read.ts"),
    "utf8",
  );
  const roundsPageSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/team/rounds/page.tsx"),
    "utf8",
  );
  const dashboardPageSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/team/page.tsx"),
    "utf8",
  );

  // Server-only enforcement and Stage 2C lifecycle query conditions
  assert.match(roundsReadSource, /^import "server-only";/m);
  assert.match(roundsReadSource, /get_db_server_timestamp/);
  assert.match(roundsReadSource, /\.from\("round_release_sessions"\)/);
  assert.match(roundsReadSource, /\.is\("closed_at", null\)/);
  assert.match(roundsReadSource, /\.lte\("started_at", dbNowIso\)/);
  assert.match(roundsReadSource, /\.gt\("expires_at", dbNowIso\)/);
  assert.match(roundsReadSource, /\.from\("events"\)/);
  assert.match(roundsReadSource, /\.eq\("status", "active"\)/);
  assert.match(roundsReadSource, /\.from\("rounds"\)/);
  assert.match(roundsReadSource, /\.eq\("status", "deployed"\)/);
  assert.equal(roundsReadSource.includes("event_entries"), false);
  assert.equal(roundsReadSource.includes("contingent_id"), false);

  // Team current rounds Server Component checks
  assert.equal(roundsPageSource.startsWith('"use client"'), false);
  assert.equal(roundsPageSource.startsWith("'use client'"), false);
  assert.match(
    roundsPageSource,
    /requireActiveTeam\(\{\s*nextPath:\s*"\/team\/rounds"\s*\}\)/,
  );
  assert.match(roundsPageSource, /loadTeamCurrentRoundsForTeam\(team\)/);
  assert.match(roundsPageSource, /logoutTeamAction/);
  assert.match(roundsPageSource, /BrandMark/);
  assert.match(
    roundsPageSource,
    /There are no active rounds available right now\./,
  );
  assert.match(roundsPageSource, /role="alert"/);
  assert.match(roundsPageSource, /Round \{item\.roundNumber\}/);
  assert.equal(roundsPageSource.includes("searchParams"), false);
  assert.equal(roundsPageSource.includes("createSupabaseAdminClient"), false);
  assert.equal(roundsPageSource.includes("contingentId"), false);
  assert.equal(roundsPageSource.includes("team.virtuoso.invalid"), false);
  assert.equal(roundsPageSource.includes("Completed"), false);
  assert.equal(roundsPageSource.includes("Reopened"), false);
  assert.equal(roundsPageSource.includes("Upcoming"), false);
  assert.equal(roundsPageSource.includes("leaderboard"), false);
  assert.equal(roundsPageSource.includes("judging_criteria"), false);
  assert.equal(roundsPageSource.includes("download"), false);
  assert.equal(roundsPageSource.includes(".pdf"), false);

  // Dashboard page links cleanly to /team/rounds while preserving Stage 4.1 constraints
  assert.match(dashboardPageSource, /href="\/team\/rounds"/);
});
