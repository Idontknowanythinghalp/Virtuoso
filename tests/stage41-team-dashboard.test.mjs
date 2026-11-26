import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  PARTICIPANT_VISIBLE_ENTRY_STATUSES,
  loadTeamRegisteredEventsWithDeps,
} from "../src/lib/team-portal/rules.ts";

const ROOT_DIR = process.cwd();

const CONTINGENT_ALPHA = "cccc1111-1111-4111-8111-111111111111";
const CONTINGENT_BETA = "cccc2222-2222-4222-8222-222222222222";

const EVENT_1 = "eeee1111-1111-4111-8111-111111111111";
const EVENT_2 = "eeee2222-2222-4222-8222-222222222222";
const EVENT_3 = "eeee3333-3333-4333-8333-333333333333";
const EVENT_4 = "eeee4444-4444-4444-8444-444444444444";

test("Stage 4.1 (1) [Mocked Unit Test]: Enforces contingent isolation and rejects invalid contingent identifiers", async () => {
  let entryQueryCalled = false;
  const invalidResult = await loadTeamRegisteredEventsWithDeps("not-a-uuid", {
    async findEligibleEventEntries() {
      entryQueryCalled = true;
      return { rows: [], error: null };
    },
    async findEventsByIds() {
      return { rows: [], error: null };
    },
  });

  assert.equal(invalidResult.ok, false);
  assert.equal(entryQueryCalled, false);

  const queriedContingents = [];
  const queriedStatuses = [];
  const queriedEventIds = [];

  const result = await loadTeamRegisteredEventsWithDeps(
    ` ${CONTINGENT_ALPHA.toUpperCase()} `,
    {
      async findEligibleEventEntries({ contingentId, statuses }) {
        queriedContingents.push(contingentId);
        queriedStatuses.push([...statuses]);
        return {
          rows: [
            {
              id: "10000000-0000-4000-8000-000000000001",
              event_id: EVENT_1,
              entry_type: "contingent",
              contingent_id: CONTINGENT_ALPHA,
              status: "registered",
            },
            // Cross-contingent row must be dropped even if returned anomalously
            {
              id: "10000000-0000-4000-8000-000000000002",
              event_id: EVENT_2,
              entry_type: "contingent",
              contingent_id: CONTINGENT_BETA,
              status: "checked_in",
            },
            // Individual entry without matching contingent_id must be dropped
            {
              id: "10000000-0000-4000-8000-000000000003",
              event_id: EVENT_3,
              entry_type: "individual",
              contingent_id: null,
              status: "registered",
            },
          ],
          error: null,
        };
      },
      async findEventsByIds(eventIds) {
        queriedEventIds.push(...eventIds);
        return {
          rows: [
            {
              id: EVENT_1,
              code: "FIN-01",
              name: "Finance Conclave",
              description: "Corporate valuation challenge.",
              status: "active",
            },
          ],
          error: null,
        };
      },
    },
  );

  assert.deepEqual(queriedContingents, [CONTINGENT_ALPHA]);
  assert.deepEqual(queriedStatuses, [["registered", "checked_in"]]);
  assert.deepEqual(queriedEventIds, [EVENT_1]);
  assert.deepEqual(result, {
    ok: true,
    events: [
      {
        entryId: "10000000-0000-4000-8000-000000000001",
        eventId: EVENT_1,
        eventCode: "FIN-01",
        eventName: "Finance Conclave",
        eventDescription: "Corporate valuation challenge.",
        eventStatus: "active",
        entryStatus: "registered",
      },
    ],
  });
});

test("Stage 4.1 (2) [Mocked Unit Test]: Includes only registered and checked_in entries, excludes withdrawn/disqualified, and sorts events deterministically", async () => {
  assert.deepEqual(PARTICIPANT_VISIBLE_ENTRY_STATUSES, [
    "registered",
    "checked_in",
  ]);

  let requestedEventIds = [];
  const result = await loadTeamRegisteredEventsWithDeps(CONTINGENT_ALPHA, {
    async findEligibleEventEntries() {
      return {
        rows: [
          {
            id: "20000000-0000-4000-8000-000000000001",
            event_id: EVENT_2,
            entry_type: "contingent",
            contingent_id: CONTINGENT_ALPHA,
            status: "checked_in",
          },
          {
            id: "20000000-0000-4000-8000-000000000002",
            event_id: EVENT_1,
            entry_type: "contingent",
            contingent_id: CONTINGENT_ALPHA,
            status: "registered",
          },
          {
            id: "20000000-0000-4000-8000-000000000003",
            event_id: EVENT_3,
            entry_type: "contingent",
            contingent_id: CONTINGENT_ALPHA,
            status: "withdrawn",
          },
          {
            id: "20000000-0000-4000-8000-000000000004",
            event_id: EVENT_4,
            entry_type: "contingent",
            contingent_id: CONTINGENT_ALPHA,
            status: "disqualified",
          },
        ],
        error: null,
      };
    },
    async findEventsByIds(eventIds) {
      requestedEventIds = eventIds;
      return {
        rows: [
          {
            id: EVENT_2,
            code: "MKT-02",
            name: "Brand Strategy",
            description: null,
            status: "active",
          },
          {
            id: EVENT_1,
            code: "ACC-01",
            name: "Audit & Forensics",
            description: "Case analysis and balance sheet investigation.",
            status: "draft",
          },
        ],
        error: null,
      };
    },
  });

  assert.deepEqual(requestedEventIds, [EVENT_2, EVENT_1]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.events, [
      {
        entryId: "20000000-0000-4000-8000-000000000002",
        eventId: EVENT_1,
        eventCode: "ACC-01",
        eventName: "Audit & Forensics",
        eventDescription: "Case analysis and balance sheet investigation.",
        eventStatus: "draft",
        entryStatus: "registered",
      },
      {
        entryId: "20000000-0000-4000-8000-000000000001",
        eventId: EVENT_2,
        eventCode: "MKT-02",
        eventName: "Brand Strategy",
        eventDescription: null,
        eventStatus: "active",
        entryStatus: "checked_in",
      },
    ]);
  }
});

test("Stage 4.1 (3) [Mocked Unit Test]: Returns empty event list cleanly when contingent has no registered or checked_in entries", async () => {
  let eventsLookupCalled = false;

  const emptyDirect = await loadTeamRegisteredEventsWithDeps(CONTINGENT_ALPHA, {
    async findEligibleEventEntries() {
      return { rows: [], error: null };
    },
    async findEventsByIds() {
      eventsLookupCalled = true;
      return { rows: [], error: null };
    },
  });

  assert.deepEqual(emptyDirect, { ok: true, events: [] });
  assert.equal(eventsLookupCalled, false);

  const onlyWithdrawn = await loadTeamRegisteredEventsWithDeps(
    CONTINGENT_ALPHA,
    {
      async findEligibleEventEntries() {
        return {
          rows: [
            {
              id: "30000000-0000-4000-8000-000000000001",
              event_id: EVENT_1,
              entry_type: "contingent",
              contingent_id: CONTINGENT_ALPHA,
              status: "withdrawn",
            },
          ],
          error: null,
        };
      },
      async findEventsByIds() {
        eventsLookupCalled = true;
        return { rows: [], error: null };
      },
    },
  );

  assert.deepEqual(onlyWithdrawn, { ok: true, events: [] });
  assert.equal(eventsLookupCalled, false);
});

test("Stage 4.1 (4) [Mocked Unit Test]: Propagates explicit error state on database query failures or missing event rows instead of returning empty results", async () => {
  const loggedContexts = [];

  const entriesError = await loadTeamRegisteredEventsWithDeps(
    CONTINGENT_ALPHA,
    {
      async findEligibleEventEntries() {
        return {
          rows: [],
          error: "permission denied for relation event_entries",
        };
      },
      async findEventsByIds() {
        throw new Error("Should not query events after entries failure");
      },
      onError(ctx) {
        loggedContexts.push(ctx);
      },
    },
  );

  assert.equal(entriesError.ok, false);
  if (!entriesError.ok) {
    assert.match(entriesError.error, /Unable to load your registered events/i);
    assert.equal(entriesError.error.includes("permission denied"), false);
  }

  const entriesThrown = await loadTeamRegisteredEventsWithDeps(
    CONTINGENT_ALPHA,
    {
      async findEligibleEventEntries() {
        throw new Error("ECONNRESET");
      },
      async findEventsByIds() {
        return { rows: [], error: null };
      },
      onError(ctx) {
        loggedContexts.push(ctx);
      },
    },
  );
  assert.equal(entriesThrown.ok, false);

  const eventsError = await loadTeamRegisteredEventsWithDeps(
    CONTINGENT_ALPHA,
    {
      async findEligibleEventEntries() {
        return {
          rows: [
            {
              id: "40000000-0000-4000-8000-000000000001",
              event_id: EVENT_1,
              entry_type: "contingent",
              contingent_id: CONTINGENT_ALPHA,
              status: "registered",
            },
          ],
          error: null,
        };
      },
      async findEventsByIds() {
        return { rows: [], error: "connection timeout reading events" };
      },
      onError(ctx) {
        loggedContexts.push(ctx);
      },
    },
  );

  assert.equal(eventsError.ok, false);
  if (!eventsError.ok) {
    assert.equal(eventsError.error.includes("connection timeout"), false);
  }

  const missingEvent = await loadTeamRegisteredEventsWithDeps(
    CONTINGENT_ALPHA,
    {
      async findEligibleEventEntries() {
        return {
          rows: [
            {
              id: "40000000-0000-4000-8000-000000000002",
              event_id: EVENT_1,
              entry_type: "contingent",
              contingent_id: CONTINGENT_ALPHA,
              status: "checked_in",
            },
          ],
          error: null,
        };
      },
      async findEventsByIds() {
        return { rows: [], error: null };
      },
      onError(ctx) {
        loggedContexts.push(ctx);
      },
    },
  );

  assert.equal(missingEvent.ok, false);
  assert.deepEqual(loggedContexts, [
    "event_entries_error",
    "event_entries_throw",
    "events_error",
    "missing_event_record",
  ]);
});

test("Stage 4.1 (5) [Static Structural Check]: Team dashboard keeps queries server-only, derives contingent strictly from requireActiveTeam(), preserves branding/sign-out, and excludes deferred stages", () => {
  const readSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/lib/team-portal/read.ts"),
    "utf8",
  );
  const pageSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/team/page.tsx"),
    "utf8",
  );

  // Server-only enforcement and contingent-scoped queries
  assert.match(readSource, /^import "server-only";/m);
  assert.match(readSource, /createSupabaseAdminClient\(/);
  assert.match(readSource, /\.from\("event_entries"\)/);
  assert.match(readSource, /\.eq\("contingent_id", contingentId\)/);
  assert.match(readSource, /\.eq\("entry_type", "contingent"\)/);
  assert.match(readSource, /\.in\("status", \[\.\.\.statuses\]\)/);
  assert.match(readSource, /\.from\("events"\)/);
  assert.equal(readSource.includes("team_accounts"), false);
  assert.equal(readSource.includes("team_sessions"), false);

  // Server Component page verifies requireActiveTeam, preserves identity & sign-out,
  // renders empty/error states, and avoids client-supplied contingent IDs or deferred Stage 4 features
  assert.equal(pageSource.startsWith('"use client"'), false);
  assert.equal(pageSource.startsWith("'use client'"), false);
  assert.match(pageSource, /requireActiveTeam\(/);
  assert.match(pageSource, /loadTeamRegisteredEventsForTeam\(team\)/);
  assert.match(pageSource, /logoutTeamAction/);
  assert.match(pageSource, /BrandMark/);
  assert.match(pageSource, /team\.contingentCode/);
  assert.match(pageSource, /team\.contingentName/);
  assert.match(pageSource, /team\.institutionName/);
  assert.match(pageSource, /No Registered Events Yet/);
  assert.match(pageSource, /role="alert"/);
  assert.match(pageSource, /ENTRY_STATUS_LABELS\[item\.entryStatus\]/);
  assert.match(pageSource, /EVENT_STATUS_LABELS\[item\.eventStatus\]/);
  assert.equal(pageSource.includes("searchParams"), false);
  assert.equal(pageSource.includes("createSupabaseAdminClient"), false);
  assert.equal(pageSource.includes("leaderboard"), false);
  assert.equal(pageSource.includes("judging_criteria"), false);
  assert.equal(pageSource.includes("round_release"), false);

  // Ensure no client component imports team-portal server modules or admin Supabase client
  function walkTsFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let files = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files = files.concat(walkTsFiles(fullPath));
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        files.push(fullPath);
      }
    }
    return files;
  }

  for (const filePath of walkTsFiles(path.join(ROOT_DIR, "src"))) {
    const content = fs.readFileSync(filePath, "utf8");
    const isClient =
      content.startsWith('"use client"') || content.startsWith("'use client'");
    if (isClient) {
      assert.equal(content.includes("team-portal"), false);
      assert.equal(content.includes("supabase/admin"), false);
    }
  }
});
