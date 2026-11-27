import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  resolveActiveTeamSessionWithDeps,
} from "../src/lib/auth/team-account-rules.ts";
import {
  PARTICIPANT_DOCUMENTS_LOAD_ERROR_MESSAGE,
  PARTICIPANT_DOCUMENT_OPEN_ERROR_MESSAGE,
  PARTICIPANT_DOCUMENT_UNAVAILABLE_MESSAGE,
  issueParticipantDocumentViewUrlWithDeps,
  loadParticipantRoundDocumentsWithDeps,
} from "../src/lib/team-portal/documents.ts";
import {
  ALLOWED_COMPETITION_DOCUMENT_MIME,
  COMPETITION_DOCUMENTS_BUCKET,
  PARTICIPANT_DOCUMENT_VIEW_TTL_SECONDS,
} from "../src/lib/documents/validation.ts";

const ROOT_DIR = process.cwd();

const CONTINGENT_ALPHA = "cccc1111-1111-4111-8111-111111111111";
const CONTINGENT_BETA = "cccc2222-2222-4222-8222-222222222222";
const TEAM_USER_ID = "dddd1111-1111-4111-8111-111111111111";
const ORGANISER_USER_ID = "eeee0000-0000-4000-8000-000000000001";

const EVENT_ACTIVE = "eeee1111-1111-4111-8111-111111111111";
const EVENT_DRAFT = "eeee2222-2222-4222-8222-222222222222";

const ROUND_LIVE = "11111111-1111-4111-8111-111111111111";
const ROUND_REOPENED = "22222222-2222-4222-8222-222222222222";
const ROUND_DRAFT = "33333333-3333-4333-8333-333333333333";
const ROUND_READY = "44444444-4444-4444-8444-444444444444";
const ROUND_FUTURE = "55555555-5555-4555-8555-555555555555";
const ROUND_CLOSED = "66666666-6666-4666-8666-666666666666";
const ROUND_EXPIRED = "77777777-7777-4777-8777-777777777777";
const ROUND_COMPLETED = "88888888-8888-4888-8888-888888888888";
const ROUND_ARCHIVED = "99999999-9999-4999-8999-999999999999";
const ROUND_IN_DRAFT_EVENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const DB_NOW_ISO = "2026-12-04T10:30:00.000Z";
const STARTED_PAST = "2026-12-04T10:00:00.000Z";
const STARTED_FUTURE = "2026-12-04T11:00:00.000Z";
const EXPIRES_FUTURE = "2026-12-04T11:30:00.000Z";
const EXPIRES_EXACT = DB_NOW_ISO;
const EXPIRES_PAST = "2026-12-04T10:15:00.000Z";

function makeDocRow(overrides = {}) {
  const id = overrides.id ?? "f1111111-1111-4111-8111-111111111111";
  const eventId = overrides.event_id ?? EVENT_ACTIVE;
  const roundId = overrides.round_id ?? ROUND_LIVE;
  const objUuid = overrides.objUuid ?? id;
  return {
    id,
    event_id: eventId,
    round_id: roundId,
    title: overrides.title ?? "Round Case Brief",
    storage_bucket:
      overrides.storage_bucket === undefined
        ? COMPETITION_DOCUMENTS_BUCKET
        : overrides.storage_bucket,
    storage_object_path:
      overrides.storage_object_path === undefined
        ? `${eventId}/${roundId}/${objUuid}.pdf`
        : overrides.storage_object_path,
    mime_type:
      overrides.mime_type === undefined
        ? ALLOWED_COMPETITION_DOCUMENT_MIME
        : overrides.mime_type,
    file_size_bytes: overrides.file_size_bytes ?? 2_450_000,
    status: overrides.status ?? "active",
    created_at: overrides.created_at ?? "2026-12-04T09:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-12-04T09:00:00.000Z",
  };
}

function makeSession(overrides = {}) {
  return {
    id: overrides.id ?? "b1111111-1111-4111-8111-111111111111",
    event_id: overrides.event_id ?? EVENT_ACTIVE,
    round_id: overrides.round_id ?? ROUND_LIVE,
    session_number: overrides.session_number ?? 1,
    duration_minutes: overrides.duration_minutes ?? 90,
    started_at: overrides.started_at ?? STARTED_PAST,
    expires_at: overrides.expires_at ?? EXPIRES_FUTURE,
    closed_at: overrides.closed_at === undefined ? null : overrides.closed_at,
    close_reason: overrides.close_reason ?? null,
    released_by: "bbbb0000-0000-4000-8000-000000000001",
    closed_by: null,
    notes: null,
    created_at: STARTED_PAST,
    updated_at: STARTED_PAST,
  };
}

function createViewDeps({ docs, events, rounds, sessionsByRound, onSignedUrl }) {
  const signedCalls = [];
  return {
    signedCalls,
    deps: {
      async findDocumentById(documentId) {
        return { row: docs.get(documentId) ?? null, error: null };
      },
      async getDbServerTimestamp() {
        return { timestampIso: DB_NOW_ISO, error: null };
      },
      async findEventById(eventId) {
        return { row: events.get(eventId) ?? null, error: null };
      },
      async findRoundById(roundId) {
        return { row: rounds.get(roundId) ?? null, error: null };
      },
      async findReleaseSessionsForRound(roundId) {
        return { rows: sessionsByRound.get(roundId) ?? [], error: null };
      },
      async createSignedViewUrl({ objectPath, expiresInSeconds }) {
        signedCalls.push({ objectPath, expiresInSeconds });
        if (onSignedUrl) {
          return onSignedUrl({ objectPath, expiresInSeconds });
        }
        return {
          ok: true,
          viewUrl: `https://storage.example.test/object/sign/${objectPath}?token=short-lived`,
          expiresInSeconds,
        };
      },
    },
  };
}

test("Stage 4.4B (1) [Mocked Unit Test]: Unauthenticated, organiser, revoked-session, and inactive-contingent callers are blocked before document access", async () => {
  const baseTeamDeps = {
    async getAuthUser() {
      return { userId: TEAM_USER_ID, error: null };
    },
    async hasOwnOrganiserProfile() {
      return { exists: false, error: null };
    },
    async checkIsActiveTeamSession() {
      return { active: true, error: null };
    },
    async getCurrentTeamContingentId() {
      return { contingentId: CONTINGENT_ALPHA, error: null };
    },
    async verifyActiveTeamAccountForSession() {
      return { active: true, error: null };
    },
    async findActiveContingentSummary() {
      return {
        contingent: {
          id: CONTINGENT_ALPHA,
          contingent_code: "SJCC-01",
          name: "Alpha Team",
          institution_name: "SJCC",
          is_active: true,
        },
        error: null,
      };
    },
  };

  // Unauthenticated
  const unauth = await resolveActiveTeamSessionWithDeps({
    ...baseTeamDeps,
    async getAuthUser() {
      return { userId: null, error: "missing session" };
    },
  });
  assert.deepEqual(unauth, { ok: false, reason: "unauthenticated" });

  // Organiser cannot impersonate participant
  const organiser = await resolveActiveTeamSessionWithDeps({
    ...baseTeamDeps,
    async getAuthUser() {
      return { userId: ORGANISER_USER_ID, error: null };
    },
    async hasOwnOrganiserProfile() {
      return { exists: true, error: null };
    },
  });
  assert.deepEqual(organiser, { ok: false, reason: "organiser_forbidden" });

  // Revoked session or inactive team/contingent
  const revoked = await resolveActiveTeamSessionWithDeps({
    ...baseTeamDeps,
    async checkIsActiveTeamSession() {
      return { active: false, error: null };
    },
  });
  assert.deepEqual(revoked, { ok: false, reason: "invalid_team_session" });

  const inactiveContingent = await resolveActiveTeamSessionWithDeps({
    ...baseTeamDeps,
    async findActiveContingentSummary() {
      return { contingent: null, error: null };
    },
  });
  assert.deepEqual(inactiveContingent, {
    ok: false,
    reason: "invalid_team_session",
  });

  // Invalid contingentId passed into document helpers fails cleanly before DB/Storage
  let dbQueried = false;
  const listDenied = await loadParticipantRoundDocumentsWithDeps(
    "invalid-contingent-id",
    [{ roundId: ROUND_LIVE, eventId: EVENT_ACTIVE }],
    {
      async findActiveDocumentsForRounds() {
        dbQueried = true;
        return { rows: [], error: null };
      },
    },
  );
  assert.equal(listDenied.ok, false);
  assert.equal(dbQueried, false);

  const viewDenied = await issueParticipantDocumentViewUrlWithDeps(
    {
      verifiedTeamContingentId: "invalid-contingent-id",
      documentId: "f1111111-1111-4111-8111-111111111111",
    },
    {
      async findDocumentById() {
        dbQueried = true;
        return { row: null, error: null };
      },
      async getDbServerTimestamp() {
        return { timestampIso: DB_NOW_ISO, error: null };
      },
      async findEventById() {
        return { row: null, error: null };
      },
      async findRoundById() {
        return { row: null, error: null };
      },
      async findReleaseSessionsForRound() {
        return { rows: [], error: null };
      },
      async createSignedViewUrl() {
        return { ok: true, viewUrl: "unused" };
      },
    },
  );
  assert.equal(viewDenied.ok, false);
  if (!viewDenied.ok) {
    assert.equal(viewDenied.reason, "invalid_team_session");
  }
  assert.equal(dbQueried, false);
});

test("Stage 4.4B (2) [Mocked Unit Test]: Authenticated participants see and open multiple PDFs on live & reopened rounds without exposing Storage paths", async () => {
  const doc1 = makeDocRow({
    id: "f1111111-1111-4111-8111-111111111111",
    title: "01 Case Briefing",
    file_size_bytes: 1_200_000,
    created_at: "2026-12-04T08:00:00.000Z",
    updated_at: "2026-12-04T08:00:00.000Z",
  });
  const doc2 = makeDocRow({
    id: "f2222222-2222-4222-8222-222222222222",
    title: "02 Financial Exhibits",
    file_size_bytes: 7_400_000,
    created_at: "2026-12-04T08:05:00.000Z",
    updated_at: "2026-12-04T08:05:00.000Z",
  });
  const doc3 = makeDocRow({
    id: "f3333333-3333-4333-8333-333333333333",
    title: "03 Rules Addendum",
    file_size_bytes: 450_000,
    created_at: "2026-12-04T08:10:00.000Z",
    updated_at: "2026-12-04T08:10:00.000Z",
  });
  const docReopened = makeDocRow({
    id: "f4444444-4444-4444-8444-444444444444",
    round_id: ROUND_REOPENED,
    title: "Reopened Round Addendum",
    file_size_bytes: 980_000,
    created_at: "2026-12-04T08:15:00.000Z",
    updated_at: "2026-12-04T08:15:00.000Z",
  });

  const visibleRoundRefs = [
    { roundId: ROUND_LIVE, eventId: EVENT_ACTIVE },
    { roundId: ROUND_REOPENED, eventId: EVENT_ACTIVE },
  ];

  // Return rows out of order + include an archived doc & mismatched event row to confirm filtering
  const listDeps = {
    async findActiveDocumentsForRounds(roundIds) {
      assert.deepEqual(roundIds, [ROUND_LIVE, ROUND_REOPENED]);
      return {
        rows: [
          doc3,
          doc1,
          docReopened,
          doc2,
          makeDocRow({
            id: "f5555555-5555-4555-8555-555555555555",
            status: "archived",
            storage_object_path: null,
          }),
          makeDocRow({
            id: "f6666666-6666-4666-8666-666666666666",
            event_id: EVENT_DRAFT,
            round_id: ROUND_LIVE,
          }),
        ],
        error: null,
      };
    },
  };

  const alphaList = await loadParticipantRoundDocumentsWithDeps(
    CONTINGENT_ALPHA,
    visibleRoundRefs,
    listDeps,
  );
  const betaList = await loadParticipantRoundDocumentsWithDeps(
    CONTINGENT_BETA,
    visibleRoundRefs,
    listDeps,
  );

  assert.equal(alphaList.ok, true);
  assert.deepEqual(alphaList, betaList);
  assert.equal(alphaList.documentsByRoundId[ROUND_LIVE].length, 3);
  assert.deepEqual(
    alphaList.documentsByRoundId[ROUND_LIVE].map((d) => d.title),
    ["01 Case Briefing", "02 Financial Exhibits", "03 Rules Addendum"],
  );
  assert.equal(alphaList.documentsByRoundId[ROUND_REOPENED].length, 1);

  // Confirm internal storage paths/buckets/created_by are completely omitted from DTO
  const serializedList = JSON.stringify(alphaList);
  assert.equal(serializedList.includes("storage_object_path"), false);
  assert.equal(serializedList.includes("storage_bucket"), false);
  assert.equal(serializedList.includes(COMPETITION_DOCUMENTS_BUCKET), false);

  // Independently view multiple PDFs on live & reopened rounds
  const docsMap = new Map([
    [doc1.id, doc1],
    [doc2.id, doc2],
    [doc3.id, doc3],
    [docReopened.id, docReopened],
  ]);
  const eventsMap = new Map([
    [EVENT_ACTIVE, { id: EVENT_ACTIVE, status: "active" }],
  ]);
  const roundsMap = new Map([
    [
      ROUND_LIVE,
      {
        id: ROUND_LIVE,
        event_id: EVENT_ACTIVE,
        status: "deployed",
        duration_minutes: 90,
        is_locked: false,
      },
    ],
    [
      ROUND_REOPENED,
      {
        id: ROUND_REOPENED,
        event_id: EVENT_ACTIVE,
        status: "deployed",
        duration_minutes: 45,
        is_locked: false,
      },
    ],
  ]);
  const sessionsMap = new Map([
    [ROUND_LIVE, [makeSession({ round_id: ROUND_LIVE })]],
    [
      ROUND_REOPENED,
      [
        makeSession({
          id: "b2222222-2222-4222-8222-222222222222",
          round_id: ROUND_REOPENED,
          session_number: 1,
          closed_at: "2026-12-04T09:00:00.000Z",
          close_reason: "manual",
        }),
        makeSession({
          id: "b3333333-3333-4333-8333-333333333333",
          round_id: ROUND_REOPENED,
          session_number: 2,
        }),
      ],
    ],
  ]);

  const { deps, signedCalls } = createViewDeps({
    docs: docsMap,
    events: eventsMap,
    rounds: roundsMap,
    sessionsByRound: sessionsMap,
  });

  for (const targetDoc of [doc1, doc2, doc3, docReopened]) {
    const viewRes = await issueParticipantDocumentViewUrlWithDeps(
      { verifiedTeamContingentId: CONTINGENT_ALPHA, documentId: targetDoc.id },
      deps,
    );
    assert.equal(viewRes.ok, true);
    if (viewRes.ok) {
      assert.equal(viewRes.documentId, targetDoc.id);
      assert.equal(viewRes.title, targetDoc.title);
      assert.equal(
        viewRes.expiresInSeconds,
        PARTICIPANT_DOCUMENT_VIEW_TTL_SECONDS,
      );
      assert.ok(viewRes.viewUrl.includes("token=short-lived"));
    }
  }
  assert.equal(signedCalls.length, 4);
  assert.equal(
    signedCalls.every(
      (c) => c.expiresInSeconds === PARTICIPANT_DOCUMENT_VIEW_TTL_SECONDS,
    ),
    true,
  );
});

test("Stage 4.4B (3) [Mocked Unit Test]: Denies direct view requests for unreleased, future-scheduled, closed, expired, completed, archived, and inactive-event rounds", async () => {
  const roundConfigs = [
    {
      label: "draft round",
      eventId: EVENT_ACTIVE,
      eventStatus: "active",
      roundId: ROUND_DRAFT,
      roundStatus: "draft",
      sessions: [],
    },
    {
      label: "ready round",
      eventId: EVENT_ACTIVE,
      eventStatus: "active",
      roundId: ROUND_READY,
      roundStatus: "ready",
      sessions: [],
    },
    {
      label: "future started_at round",
      eventId: EVENT_ACTIVE,
      eventStatus: "active",
      roundId: ROUND_FUTURE,
      roundStatus: "deployed",
      sessions: [
        makeSession({
          round_id: ROUND_FUTURE,
          started_at: STARTED_FUTURE,
        }),
      ],
    },
    {
      label: "manually closed round",
      eventId: EVENT_ACTIVE,
      eventStatus: "active",
      roundId: ROUND_CLOSED,
      roundStatus: "closed",
      sessions: [
        makeSession({
          round_id: ROUND_CLOSED,
          closed_at: "2026-12-04T10:25:00.000Z",
          close_reason: "manual",
        }),
      ],
    },
    {
      label: "expired round at exact boundary",
      eventId: EVENT_ACTIVE,
      eventStatus: "active",
      roundId: ROUND_EXPIRED,
      roundStatus: "deployed",
      sessions: [
        makeSession({
          round_id: ROUND_EXPIRED,
          expires_at: EXPIRES_EXACT,
        }),
      ],
    },
    {
      label: "expired round past boundary",
      eventId: EVENT_ACTIVE,
      eventStatus: "active",
      roundId: "77777777-7777-4777-8777-777777777778",
      roundStatus: "deployed",
      sessions: [
        makeSession({
          round_id: "77777777-7777-4777-8777-777777777778",
          expires_at: EXPIRES_PAST,
        }),
      ],
    },
    {
      label: "completed round even with open session row",
      eventId: EVENT_ACTIVE,
      eventStatus: "active",
      roundId: ROUND_COMPLETED,
      roundStatus: "completed",
      sessions: [makeSession({ round_id: ROUND_COMPLETED })],
    },
    {
      label: "archived round even with open session row",
      eventId: EVENT_ACTIVE,
      eventStatus: "active",
      roundId: ROUND_ARCHIVED,
      roundStatus: "archived",
      sessions: [makeSession({ round_id: ROUND_ARCHIVED })],
    },
    {
      label: "deployed round under draft event",
      eventId: EVENT_DRAFT,
      eventStatus: "draft",
      roundId: ROUND_IN_DRAFT_EVENT,
      roundStatus: "deployed",
      sessions: [
        makeSession({
          event_id: EVENT_DRAFT,
          round_id: ROUND_IN_DRAFT_EVENT,
        }),
      ],
    },
  ];

  const docsMap = new Map();
  const eventsMap = new Map([
    [EVENT_ACTIVE, { id: EVENT_ACTIVE, status: "active" }],
    [EVENT_DRAFT, { id: EVENT_DRAFT, status: "draft" }],
  ]);
  const roundsMap = new Map();
  const sessionsMap = new Map();

  const docIds = [];
  roundConfigs.forEach((cfg, index) => {
    const docId = `d0000000-0000-4000-8000-00000000000${index + 1}`;
    docIds.push({ label: cfg.label, docId });
    docsMap.set(
      docId,
      makeDocRow({
        id: docId,
        event_id: cfg.eventId,
        round_id: cfg.roundId,
        title: `Secret ${cfg.label}`,
      }),
    );
    roundsMap.set(cfg.roundId, {
      id: cfg.roundId,
      event_id: cfg.eventId,
      status: cfg.roundStatus,
      duration_minutes: 60,
      is_locked: cfg.roundStatus === "completed" || cfg.roundStatus === "archived",
    });
    sessionsMap.set(cfg.roundId, cfg.sessions);
  });

  const { deps, signedCalls } = createViewDeps({
    docs: docsMap,
    events: eventsMap,
    rounds: roundsMap,
    sessionsByRound: sessionsMap,
  });

  for (const { label, docId } of docIds) {
    const res = await issueParticipantDocumentViewUrlWithDeps(
      { verifiedTeamContingentId: CONTINGENT_ALPHA, documentId: docId },
      deps,
    );
    assert.equal(res.ok, false, `Expected denial for ${label}`);
    if (!res.ok) {
      assert.equal(res.reason, "not_visible");
      assert.equal(res.message, PARTICIPANT_DOCUMENT_UNAVAILABLE_MESSAGE);
    }
  }
  assert.equal(signedCalls.length, 0);
});

test("Stage 4.4B (4) [Mocked Unit Test]: Rejects guessed, malformed, missing, archived, or path-tampered document IDs with identical non-enumerating errors", async () => {
  const archivedDocId = "a1111111-1111-4111-8111-111111111111";
  const wrongBucketDocId = "a2222222-2222-4222-8222-222222222222";
  const wrongMimeDocId = "a3333333-3333-4333-8333-333333333333";
  const tamperedPathDocId = "a4444444-4444-4444-8444-444444444444";
  const missingDocId = "a5555555-5555-4555-8555-555555555555";

  const docsMap = new Map([
    [
      archivedDocId,
      makeDocRow({
        id: archivedDocId,
        status: "archived",
        storage_object_path: null,
      }),
    ],
    [
      wrongBucketDocId,
      makeDocRow({
        id: wrongBucketDocId,
        storage_bucket: "public-assets",
      }),
    ],
    [
      wrongMimeDocId,
      makeDocRow({
        id: wrongMimeDocId,
        mime_type: "text/html",
      }),
    ],
    [
      tamperedPathDocId,
      makeDocRow({
        id: tamperedPathDocId,
        storage_object_path: `${EVENT_ACTIVE}/${ROUND_DRAFT}/99999999-9999-4999-8999-999999999999.pdf`,
      }),
    ],
  ]);

  const { deps, signedCalls } = createViewDeps({
    docs: docsMap,
    events: new Map([[EVENT_ACTIVE, { id: EVENT_ACTIVE, status: "active" }]]),
    rounds: new Map([
      [
        ROUND_LIVE,
        {
          id: ROUND_LIVE,
          event_id: EVENT_ACTIVE,
          status: "deployed",
          duration_minutes: 90,
          is_locked: false,
        },
      ],
    ]),
    sessionsByRound: new Map([[ROUND_LIVE, [makeSession()]]]),
  });

  for (const probeId of [
    "",
    "not-a-uuid",
    "../../etc/passwd",
    missingDocId,
    archivedDocId,
    wrongBucketDocId,
    wrongMimeDocId,
    tamperedPathDocId,
  ]) {
    const res = await issueParticipantDocumentViewUrlWithDeps(
      { verifiedTeamContingentId: CONTINGENT_ALPHA, documentId: probeId },
      deps,
    );
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.reason, "not_found");
      assert.equal(res.message, PARTICIPANT_DOCUMENT_UNAVAILABLE_MESSAGE);
    }
  }

  assert.equal(signedCalls.length, 0);
});

test("Stage 4.4B (5) [Mocked Unit Test]: Propagates explicit errors without internal leaks and survives throwing onError callbacks", async () => {
  let loggerCalls = 0;
  const loadErrorRes = await loadParticipantRoundDocumentsWithDeps(
    CONTINGENT_ALPHA,
    [{ roundId: ROUND_LIVE, eventId: EVENT_ACTIVE }],
    {
      async findActiveDocumentsForRounds() {
        return {
          rows: [],
          error: {
            code: "42P01",
            message: 'relation "public.competition_documents" does not exist',
          },
        };
      },
      onError() {
        loggerCalls += 1;
        throw new Error("logger failed");
      },
    },
  );
  assert.equal(loadErrorRes.ok, false);
  assert.equal(loadErrorRes.error, PARTICIPANT_DOCUMENTS_LOAD_ERROR_MESSAGE);
  assert.equal(loadErrorRes.error.includes("competition_documents"), false);
  assert.equal(loggerCalls, 1);

  const liveDoc = makeDocRow();
  const { deps: baseViewDeps } = createViewDeps({
    docs: new Map([[liveDoc.id, liveDoc]]),
    events: new Map([[EVENT_ACTIVE, { id: EVENT_ACTIVE, status: "active" }]]),
    rounds: new Map([
      [
        ROUND_LIVE,
        {
          id: ROUND_LIVE,
          event_id: EVENT_ACTIVE,
          status: "deployed",
          duration_minutes: 90,
          is_locked: false,
        },
      ],
    ]),
    sessionsByRound: new Map([[ROUND_LIVE, [makeSession()]]]),
  });

  const signedFailRes = await issueParticipantDocumentViewUrlWithDeps(
    { verifiedTeamContingentId: CONTINGENT_ALPHA, documentId: liveDoc.id },
    {
      ...baseViewDeps,
      async createSignedViewUrl() {
        return { ok: false, error: "storage service key failure" };
      },
      onError() {
        loggerCalls += 1;
        throw new Error("logger failed again");
      },
    },
  );
  assert.equal(signedFailRes.ok, false);
  if (!signedFailRes.ok) {
    assert.equal(signedFailRes.reason, "error");
    assert.equal(signedFailRes.message, PARTICIPANT_DOCUMENT_OPEN_ERROR_MESSAGE);
    assert.equal(signedFailRes.message.includes("service key"), false);
  }
  assert.equal(loggerCalls, 2);
});

test("Stage 4.4B (6) [Static Structural Check]: Private bucket, server-only readers, team action guard, and participant viewer enforce Stage 4.4 security boundaries", () => {
  const storageSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/lib/documents/storage.ts"),
    "utf8",
  );
  const docsReadSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/lib/team-portal/documents-read.ts"),
    "utf8",
  );
  const docsLogicSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/lib/team-portal/documents.ts"),
    "utf8",
  );
  const teamDocActionSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/actions/team-documents.ts"),
    "utf8",
  );
  const viewerSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/components/team/ParticipantRoundDocuments.tsx"),
    "utf8",
  );
  const roundsPageSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/team/rounds/page.tsx"),
    "utf8",
  );
  const migrationSql = fs.readFileSync(
    path.join(
      ROOT_DIR,
      "supabase/migrations/202611260011_stage43a_competition_documents.sql",
    ),
    "utf8",
  );

  // Storage keeps bucket private and issues short-lived inline signed URLs (no getPublicUrl, no attachment download)
  assert.match(storageSource, /^import "server-only";/m);
  assert.equal(storageSource.includes("getPublicUrl"), false);
  assert.match(storageSource, /createCompetitionDocumentSignedViewUrl/);
  assert.match(storageSource, /\.createSignedUrl\(params\.objectPath,\s*clampedTtl\)/);

  // Participant document reader is server-only and reuses Stage 2C round release state + DB server time
  assert.match(docsReadSource, /^import "server-only";/m);
  assert.match(docsReadSource, /get_db_server_timestamp/);
  assert.match(docsReadSource, /createCompetitionDocumentSignedViewUrl/);
  assert.equal(docsReadSource.includes("getPublicUrl"), false);
  assert.match(docsLogicSource, /deriveRoundReleaseState/);
  assert.match(docsLogicSource, /isSafeCompetitionDocumentStoragePath/);

  // Server action accepts only documentId and enforces requireActiveTeamForAction() before lookup
  assert.match(teamDocActionSource, /^"use server";/m);
  assert.match(teamDocActionSource, /requireActiveTeamForAction\(\)/);
  assert.match(teamDocActionSource, /TeamAuthError/);
  assert.equal(teamDocActionSource.includes("contingentId"), false);

  // Client viewer uses inline iframe + refresh/close without window.open, download attribute, or server imports
  assert.match(viewerSource, /^"use client";/m);
  assert.match(viewerSource, /viewParticipantRoundDocumentAction/);
  assert.match(viewerSource, /<iframe[\s\S]*src=\{activeViewer\.viewUrl\}/);
  assert.equal(viewerSource.includes("window.open"), false);
  assert.equal(viewerSource.includes("window.alert"), false);
  assert.equal(viewerSource.includes("download"), false);
  assert.equal(viewerSource.includes("team-portal"), false);
  assert.equal(viewerSource.includes("supabase/admin"), false);
  assert.equal(viewerSource.includes("SUPABASE_SERVICE_ROLE_KEY"), false);
  assert.equal(viewerSource.includes("getPublicUrl"), false);

  // Rounds page wires participant documents while preserving Stage 4.2 constraints
  assert.match(roundsPageSource, /loadParticipantDocumentsForVisibleRounds/);
  assert.match(roundsPageSource, /ParticipantRoundDocuments/);
  assert.equal(roundsPageSource.includes("download"), false);
  assert.equal(roundsPageSource.includes(".pdf"), false);

  // Migration 0011 private bucket & Super Admin RLS remain untouched
  assert.match(
    migrationSql,
    /VALUES \(\s*'competition-documents',\s*'competition-documents',\s*false,/,
  );
  assert.match(migrationSql, /AS RESTRICTIVE/);
});
