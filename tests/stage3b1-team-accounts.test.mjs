import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  ALL_ORGANISER_ROLES,
  evaluateOrganiserAccess,
} from "../src/lib/auth/policy.ts";
import { MAX_TEAM_CONCURRENT_SESSIONS } from "../src/types/team-auth.ts";
import {
  TEAM_SYNTHETIC_EMAIL_DOMAIN,
  buildTeamSyntheticEmail,
  canAccessTeamSessionRecords,
  evaluateCurrentTeamSessionAccess,
  evaluateDeactivateContingent,
  evaluateDeactivateTeamAccount,
  evaluateReactivateContingent,
  evaluateReactivateTeamAccount,
  evaluateRevokeCurrentTeamSession,
  evaluateTeamAccountEligibility,
  evaluateTeamSessionRegistration,
} from "../src/lib/auth/team-account-rules.ts";

const ROOT_DIR = process.cwd();

const TEAM_ACCOUNT_A = "aaaa1111-1111-4111-8111-111111111111";
const TEAM_ACCOUNT_B = "bbbb2222-2222-4222-8222-222222222222";
const CONTINGENT_A = "cccc1111-1111-4111-8111-111111111111";
const CONTINGENT_B = "cccc2222-2222-4222-8222-222222222222";
const AUTH_USER_A = "dddd1111-1111-4111-8111-111111111111";
const AUTH_USER_B = "dddd2222-2222-4222-8222-222222222222";
const ORGANISER_USER = "eeee1111-1111-4111-8111-111111111111";

const SESSION_1 = "11110000-0000-4000-8000-000000000001";
const SESSION_2 = "11110000-0000-4000-8000-000000000002";
const SESSION_3 = "11110000-0000-4000-8000-000000000003";
const SESSION_4 = "11110000-0000-4000-8000-000000000004";
const SESSION_5 = "11110000-0000-4000-8000-000000000005";

const NOW = "2026-11-24T12:00:00Z";
const FUTURE = "2026-11-24T18:00:00Z";
const PAST = "2026-11-24T11:00:00Z";

function makeAccount(overrides = {}) {
  return {
    id: TEAM_ACCOUNT_A,
    contingent_id: CONTINGENT_A,
    auth_user_id: AUTH_USER_A,
    is_active: true,
    ...overrides,
  };
}

function makeEligibility(overrides = {}) {
  return {
    authUserId: AUTH_USER_A,
    jwtSessionId: SESSION_1,
    hasOrganiserProfile: false,
    teamAccount: makeAccount(),
    contingentIsActive: true,
    ...overrides,
  };
}

// ============================================================================
// EXECUTED UNIT TESTS (TypeScript policy & reference session model)
// ============================================================================

test("Stage 3B.1 (1) [Executed]: Synthetic team email derives exclusively from immutable team account UUID and ignores contingent codes", () => {
  const email = buildTeamSyntheticEmail(TEAM_ACCOUNT_A.toUpperCase());
  assert.equal(
    email,
    `team-${TEAM_ACCOUNT_A}@${TEAM_SYNTHETIC_EMAIL_DOMAIN}`,
  );
  assert.ok(email.endsWith(".invalid"));
  assert.equal(
    buildTeamSyntheticEmail(TEAM_ACCOUNT_A),
    buildTeamSyntheticEmail(TEAM_ACCOUNT_A),
  );
  assert.notEqual(
    buildTeamSyntheticEmail(TEAM_ACCOUNT_A),
    buildTeamSyntheticEmail(TEAM_ACCOUNT_B),
  );
  assert.throws(() => buildTeamSyntheticEmail("CONT-001"), /valid UUID/i);
});

test("Stage 3B.1 (2) [Executed]: Team account eligibility rejects unauthenticated, organiser profiles, inactive accounts, and inactive contingents", () => {
  assert.equal(
    evaluateTeamAccountEligibility(makeEligibility({ authUserId: null })).ok,
    false,
  );
  assert.equal(
    evaluateTeamAccountEligibility(makeEligibility({ jwtSessionId: "bad" }))
      .reason,
    "unauthenticated",
  );
  assert.equal(
    evaluateTeamAccountEligibility(
      makeEligibility({ hasOrganiserProfile: true }),
    ).reason,
    "organiser_forbidden",
  );
  assert.equal(
    evaluateTeamAccountEligibility(
      makeEligibility({ teamAccount: makeAccount({ is_active: false }) }),
    ).reason,
    "account_inactive",
  );
  assert.equal(
    evaluateTeamAccountEligibility(makeEligibility({ contingentIsActive: false }))
      .reason,
    "contingent_inactive",
  );
  assert.equal(
    evaluateTeamAccountEligibility(makeEligibility()).ok,
    true,
  );
});

test("Stage 3B.1 (3) [Executed]: Up to 4 simultaneous sessions register cleanly and the 5th device is rejected without evicting existing sessions", () => {
  assert.equal(MAX_TEAM_CONCURRENT_SESSIONS, 4);

  const authSessions = [SESSION_1, SESSION_2, SESSION_3, SESSION_4, SESSION_5].map(
    (id) => ({ id, user_id: AUTH_USER_A, not_after: FUTURE }),
  );

  let sessions = [];

  for (const [idx, sid] of [SESSION_1, SESSION_2, SESSION_3, SESSION_4].entries()) {
    const res = evaluateTeamSessionRegistration({
      eligibility: makeEligibility({ jwtSessionId: sid }),
      sessions,
      authSessions,
      nowIso: NOW,
      newSessionRowId: `row-${idx + 1}`,
    });
    assert.equal(res.ok, true);
    assert.equal(res.operation, "registered");
    assert.equal(res.activeSessionCount, idx + 1);
    assert.equal(res.maxSessions, 4);
    sessions = res.sessions;
  }

  // Re-registering an already active session refreshes last_seen_at idempotently
  const refresh = evaluateTeamSessionRegistration({
    eligibility: makeEligibility({ jwtSessionId: SESSION_2 }),
    sessions,
    authSessions,
    nowIso: "2026-11-24T12:05:00Z",
  });
  assert.equal(refresh.ok, true);
  assert.equal(refresh.operation, "refreshed");
  assert.equal(refresh.activeSessionCount, 4);
  sessions = refresh.sessions;

  // 5th concurrent session MUST be rejected and all 4 existing sessions remain unrevoked
  const fifth = evaluateTeamSessionRegistration({
    eligibility: makeEligibility({ jwtSessionId: SESSION_5 }),
    sessions,
    authSessions,
    nowIso: "2026-11-24T12:06:00Z",
  });
  assert.equal(fifth.ok, false);
  assert.equal(fifth.reason, "max_concurrent_sessions_reached");
  assert.equal(
    fifth.sessions.filter((s) => s.revoked_at === null).length,
    4,
  );
});

test("Stage 3B.1 (4) [Executed]: Logging out current session revokes only that session, preserves other 3 sessions, rejects revoked reuse, and frees the 4th slot", () => {
  const authSessions = [SESSION_1, SESSION_2, SESSION_3, SESSION_4, SESSION_5].map(
    (id) => ({ id, user_id: AUTH_USER_A, not_after: null }),
  );

  let sessions = [SESSION_1, SESSION_2, SESSION_3, SESSION_4].map((sid, i) => ({
    id: `row-${i + 1}`,
    team_account_id: TEAM_ACCOUNT_A,
    contingent_id: CONTINGENT_A,
    supabase_session_id: sid,
    created_at: NOW,
    last_seen_at: NOW,
    revoked_at: null,
    revoked_reason: null,
    revoked_by: null,
  }));

  // Logout device 2
  const logout = evaluateRevokeCurrentTeamSession({
    eligibility: makeEligibility({ jwtSessionId: SESSION_2 }),
    sessions,
    nowIso: "2026-11-24T12:10:00Z",
  });
  assert.equal(logout.ok, true);
  assert.equal(logout.revoked, true);
  sessions = logout.sessions;

  // Device 2 is immediately blocked even while its Supabase auth.sessions row has not expired
  const accessDevice2 = evaluateCurrentTeamSessionAccess({
    eligibility: makeEligibility({ jwtSessionId: SESSION_2 }),
    sessions,
    authSessions,
    nowIso: "2026-11-24T12:11:00Z",
  });
  assert.equal(accessDevice2.isActive, false);
  assert.equal(accessDevice2.contingentId, null);

  // Re-registering revoked device 2 is rejected
  const reuseRevoked = evaluateTeamSessionRegistration({
    eligibility: makeEligibility({ jwtSessionId: SESSION_2 }),
    sessions,
    authSessions,
    nowIso: "2026-11-24T12:11:00Z",
  });
  assert.equal(reuseRevoked.ok, false);
  assert.equal(reuseRevoked.reason, "session_revoked");

  // Devices 1, 3, and 4 remain active
  for (const activeSid of [SESSION_1, SESSION_3, SESSION_4]) {
    const check = evaluateCurrentTeamSessionAccess({
      eligibility: makeEligibility({ jwtSessionId: activeSid }),
      sessions,
      authSessions,
      nowIso: "2026-11-24T12:11:00Z",
    });
    assert.equal(check.isActive, true);
    assert.equal(check.contingentId, CONTINGENT_A);
  }

  // Device 5 can now register cleanly into the freed slot
  const fifthAfterLogout = evaluateTeamSessionRegistration({
    eligibility: makeEligibility({ jwtSessionId: SESSION_5 }),
    sessions,
    authSessions,
    nowIso: "2026-11-24T12:12:00Z",
    newSessionRowId: "row-5",
  });
  assert.equal(fifthAfterLogout.ok, true);
  assert.equal(fifthAfterLogout.activeSessionCount, 4);
});

test("Stage 3B.1 (5) [Executed]: Expired or vanished auth.sessions rows are pruned as auth_session_expired during registration", () => {
  const sessions = [
    {
      id: "row-1",
      team_account_id: TEAM_ACCOUNT_A,
      contingent_id: CONTINGENT_A,
      supabase_session_id: SESSION_1,
      created_at: PAST,
      last_seen_at: PAST,
      revoked_at: null,
      revoked_reason: null,
      revoked_by: null,
    },
    {
      id: "row-2",
      team_account_id: TEAM_ACCOUNT_A,
      contingent_id: CONTINGENT_A,
      supabase_session_id: SESSION_2,
      created_at: PAST,
      last_seen_at: PAST,
      revoked_at: null,
      revoked_reason: null,
      revoked_by: null,
    },
    {
      id: "row-3",
      team_account_id: TEAM_ACCOUNT_A,
      contingent_id: CONTINGENT_A,
      supabase_session_id: SESSION_3,
      created_at: PAST,
      last_seen_at: PAST,
      revoked_at: null,
      revoked_reason: null,
      revoked_by: null,
    },
    {
      id: "row-4",
      team_account_id: TEAM_ACCOUNT_A,
      contingent_id: CONTINGENT_A,
      supabase_session_id: SESSION_4,
      created_at: PAST,
      last_seen_at: PAST,
      revoked_at: null,
      revoked_reason: null,
      revoked_by: null,
    },
  ];

  // SESSION_1 expired in auth.sessions, SESSION_2 was deleted from auth.sessions
  const authSessions = [
    { id: SESSION_1, user_id: AUTH_USER_A, not_after: "2026-11-24T11:30:00Z" },
    { id: SESSION_3, user_id: AUTH_USER_A, not_after: FUTURE },
    { id: SESSION_4, user_id: AUTH_USER_A, not_after: null },
    { id: SESSION_5, user_id: AUTH_USER_A, not_after: FUTURE },
  ];

  const reg = evaluateTeamSessionRegistration({
    eligibility: makeEligibility({ jwtSessionId: SESSION_5 }),
    sessions,
    authSessions,
    nowIso: NOW,
    newSessionRowId: "row-5",
  });

  assert.equal(reg.ok, true);
  assert.equal(reg.stalePrunedCount, 2);
  assert.equal(reg.activeSessionCount, 3);
  assert.equal(
    reg.sessions.find((s) => s.supabase_session_id === SESSION_1)?.revoked_reason,
    "auth_session_expired",
  );
  assert.equal(
    reg.sessions.find((s) => s.supabase_session_id === SESSION_2)?.revoked_reason,
    "auth_session_expired",
  );
});

test("Stage 3B.1 (6) [Executed]: Cross-contingent isolation rejects mismatched contingent access and preserves existing organiser policies", () => {
  const authSessions = [{ id: SESSION_1, user_id: AUTH_USER_A, not_after: FUTURE }];
  const sessions = [
    {
      id: "row-1",
      team_account_id: TEAM_ACCOUNT_A,
      contingent_id: CONTINGENT_A,
      supabase_session_id: SESSION_1,
      created_at: NOW,
      last_seen_at: NOW,
      revoked_at: null,
      revoked_reason: null,
      revoked_by: null,
    },
  ];

  // Team A trying to read Contingent B fails closed
  const crossAccess = evaluateCurrentTeamSessionAccess({
    eligibility: makeEligibility({ jwtSessionId: SESSION_1 }),
    sessions,
    authSessions,
    nowIso: NOW,
    requestedContingentId: CONTINGENT_B,
  });
  assert.equal(crossAccess.isActive, false);
  assert.equal(crossAccess.contingentId, null);

  // Team B's auth user cannot access Team A's account
  const wrongUser = evaluateCurrentTeamSessionAccess({
    eligibility: makeEligibility({
      authUserId: AUTH_USER_B,
      jwtSessionId: SESSION_1,
    }),
    sessions,
    authSessions: [{ id: SESSION_1, user_id: AUTH_USER_B, not_after: FUTURE }],
    nowIso: NOW,
  });
  assert.equal(wrongUser.isActive, false);

  // Organiser roles & evaluation remain unchanged
  assert.deepEqual(ALL_ORGANISER_ROLES, ["super_admin", "event_coordinator"]);
  const orgAccess = evaluateOrganiserAccess({
    authUserId: ORGANISER_USER,
    profile: {
      id: ORGANISER_USER,
      full_name: "Organiser Admin",
      email: "admin@virtuoso.test",
      role: "super_admin",
      scope_mode: "all_events",
      is_active: true,
      created_at: NOW,
      updated_at: NOW,
    },
  });
  assert.equal(orgAccess.ok, true);
});

test("Stage 3B.1 (7) [Executed]: Deactivating a team account revokes all unrevoked sessions as account_deactivated, and reactivation never restores them", () => {
  const authSessions = [SESSION_1, SESSION_2, SESSION_3, SESSION_4].map(
    (id) => ({ id, user_id: AUTH_USER_A, not_after: FUTURE }),
  );
  const account = {
    id: TEAM_ACCOUNT_A,
    contingent_id: CONTINGENT_A,
    auth_user_id: AUTH_USER_A,
    is_active: true,
    created_by: ORGANISER_USER,
    updated_by: ORGANISER_USER,
    deactivated_at: null,
    deactivated_by: null,
    created_at: PAST,
    updated_at: PAST,
  };

  // Session 1 already logged out earlier; Sessions 2 and 3 are active
  const initialSessions = [
    {
      id: "row-1",
      team_account_id: TEAM_ACCOUNT_A,
      contingent_id: CONTINGENT_A,
      supabase_session_id: SESSION_1,
      created_at: PAST,
      last_seen_at: PAST,
      revoked_at: "2026-11-24T11:30:00Z",
      revoked_reason: "logout",
      revoked_by: null,
    },
    {
      id: "row-2",
      team_account_id: TEAM_ACCOUNT_A,
      contingent_id: CONTINGENT_A,
      supabase_session_id: SESSION_2,
      created_at: NOW,
      last_seen_at: NOW,
      revoked_at: null,
      revoked_reason: null,
      revoked_by: null,
    },
    {
      id: "row-3",
      team_account_id: TEAM_ACCOUNT_A,
      contingent_id: CONTINGENT_A,
      supabase_session_id: SESSION_3,
      created_at: NOW,
      last_seen_at: NOW,
      revoked_at: null,
      revoked_reason: null,
      revoked_by: null,
    },
  ];

  // Deactivate account
  const deactivated = evaluateDeactivateTeamAccount({
    account,
    sessions: initialSessions,
    deactivatedByProfileId: ORGANISER_USER,
    nowIso: "2026-11-24T12:15:00Z",
  });
  assert.equal(deactivated.account.is_active, false);
  assert.equal(deactivated.revokedCount, 2);

  // Earlier logout session keeps its original logout reason & timestamp
  const s1 = deactivated.sessions.find((s) => s.supabase_session_id === SESSION_1);
  assert.equal(s1?.revoked_reason, "logout");
  assert.equal(s1?.revoked_at, "2026-11-24T11:30:00Z");

  // Previously active sessions are now revoked with account_deactivated
  for (const sid of [SESSION_2, SESSION_3]) {
    const s = deactivated.sessions.find((row) => row.supabase_session_id === sid);
    assert.equal(s?.revoked_reason, "account_deactivated");
    assert.equal(s?.revoked_by, ORGANISER_USER);
    assert.equal(
      evaluateCurrentTeamSessionAccess({
        eligibility: makeEligibility({
          jwtSessionId: sid,
          teamAccount: deactivated.account,
        }),
        sessions: deactivated.sessions,
        authSessions,
        nowIso: "2026-11-24T12:16:00Z",
      }).isActive,
      false,
    );
  }

  // Reactivate account -> old sessions remain permanently revoked!
  const reactivated = evaluateReactivateTeamAccount({
    account: deactivated.account,
    sessions: deactivated.sessions,
    reactivatedByProfileId: ORGANISER_USER,
    nowIso: "2026-11-24T12:20:00Z",
  });
  assert.equal(reactivated.account.is_active, true);
  assert.equal(reactivated.account.deactivated_at, null);
  assert.equal(
    reactivated.sessions.every((s) => s.revoked_at !== null),
    true,
  );

  // Reusing SESSION_2 after reactivation is still blocked
  const oldSessionAccess = evaluateCurrentTeamSessionAccess({
    eligibility: makeEligibility({
      jwtSessionId: SESSION_2,
      teamAccount: reactivated.account,
    }),
    sessions: reactivated.sessions,
    authSessions,
    nowIso: "2026-11-24T12:21:00Z",
  });
  assert.equal(oldSessionAccess.isActive, false);

  const reuseOld = evaluateTeamSessionRegistration({
    eligibility: makeEligibility({
      jwtSessionId: SESSION_2,
      teamAccount: reactivated.account,
    }),
    sessions: reactivated.sessions,
    authSessions,
    nowIso: "2026-11-24T12:21:00Z",
  });
  assert.equal(reuseOld.ok, false);
  assert.equal(reuseOld.reason, "session_revoked");

  // Fresh login (SESSION_4) succeeds cleanly after reactivation
  const freshLogin = evaluateTeamSessionRegistration({
    eligibility: makeEligibility({
      jwtSessionId: SESSION_4,
      teamAccount: reactivated.account,
    }),
    sessions: reactivated.sessions,
    authSessions,
    nowIso: "2026-11-24T12:22:00Z",
    newSessionRowId: "row-4",
  });
  assert.equal(freshLogin.ok, true);
  assert.equal(freshLogin.activeSessionCount, 1);
});

test("Stage 3B.1 (8) [Executed]: Only active Super Admins may access team account and sensitive session records; event coordinators and teams are denied", () => {
  assert.equal(
    canAccessTeamSessionRecords({ kind: "super_admin", isActive: true }),
    true,
  );
  assert.equal(
    canAccessTeamSessionRecords({ kind: "super_admin", isActive: false }),
    false,
  );
  assert.equal(
    canAccessTeamSessionRecords({ kind: "event_coordinator", isActive: true }),
    false,
  );
  assert.equal(
    canAccessTeamSessionRecords({ kind: "team", isActive: true }),
    false,
  );
  assert.equal(
    canAccessTeamSessionRecords({ kind: "anonymous", isActive: false }),
    false,
  );
});

test("Stage 3B.1 (9) [Executed]: Deactivating a contingent revokes active team sessions as contingent_deactivated, ignores contingents without a team account, and reactivation never restores old sessions", () => {
  const authSessions = [SESSION_1, SESSION_2, SESSION_3, SESSION_4].map(
    (id) => ({ id, user_id: AUTH_USER_A, not_after: FUTURE }),
  );
  const teamAccount = {
    id: TEAM_ACCOUNT_A,
    contingent_id: CONTINGENT_A,
    auth_user_id: AUTH_USER_A,
    is_active: true,
    created_by: ORGANISER_USER,
    updated_by: ORGANISER_USER,
    deactivated_at: null,
    deactivated_by: null,
    created_at: PAST,
    updated_at: PAST,
  };

  const initialSessions = [
    {
      id: "row-1",
      team_account_id: TEAM_ACCOUNT_A,
      contingent_id: CONTINGENT_A,
      supabase_session_id: SESSION_1,
      created_at: PAST,
      last_seen_at: PAST,
      revoked_at: "2026-11-24T11:30:00Z",
      revoked_reason: "logout",
      revoked_by: null,
    },
    {
      id: "row-2",
      team_account_id: TEAM_ACCOUNT_A,
      contingent_id: CONTINGENT_A,
      supabase_session_id: SESSION_2,
      created_at: NOW,
      last_seen_at: NOW,
      revoked_at: null,
      revoked_reason: null,
      revoked_by: null,
    },
    {
      id: "row-3",
      team_account_id: TEAM_ACCOUNT_A,
      contingent_id: CONTINGENT_A,
      supabase_session_id: SESSION_3,
      created_at: NOW,
      last_seen_at: NOW,
      revoked_at: null,
      revoked_reason: null,
      revoked_by: null,
    },
  ];

  // Contingent without a team account deactivates cleanly without touching sessions
  const noAccountDeactivate = evaluateDeactivateContingent({
    contingentId: CONTINGENT_B,
    contingentWasActive: true,
    teamAccount: null,
    sessions: initialSessions,
    actorProfileId: ORGANISER_USER,
    nowIso: "2026-11-24T12:15:00Z",
  });
  assert.equal(noAccountDeactivate.contingentIsActive, false);
  assert.equal(noAccountDeactivate.revokedCount, 0);
  assert.equal(
    noAccountDeactivate.sessions.filter((s) => s.revoked_at === null).length,
    2,
  );

  // Deactivating Contingent A revokes unrevoked sessions 2 & 3 with contingent_deactivated
  const deactivated = evaluateDeactivateContingent({
    contingentId: CONTINGENT_A,
    contingentWasActive: true,
    teamAccount,
    sessions: initialSessions,
    actorProfileId: ORGANISER_USER,
    nowIso: "2026-11-24T12:15:00Z",
  });
  assert.equal(deactivated.contingentIsActive, false);
  assert.equal(deactivated.revokedCount, 2);

  // Historical logout session preserves its original logout metadata
  const s1 = deactivated.sessions.find((s) => s.supabase_session_id === SESSION_1);
  assert.equal(s1?.revoked_reason, "logout");
  assert.equal(s1?.revoked_at, "2026-11-24T11:30:00Z");

  // Active sessions 2 & 3 are revoked immediately and blocked during inactive contingent
  for (const sid of [SESSION_2, SESSION_3]) {
    const s = deactivated.sessions.find((row) => row.supabase_session_id === sid);
    assert.equal(s?.revoked_reason, "contingent_deactivated");
    assert.equal(s?.revoked_by, ORGANISER_USER);
    assert.equal(
      evaluateCurrentTeamSessionAccess({
        eligibility: makeEligibility({
          jwtSessionId: sid,
          teamAccount,
          contingentIsActive: deactivated.contingentIsActive,
        }),
        sessions: deactivated.sessions,
        authSessions,
        nowIso: "2026-11-24T12:16:00Z",
      }).isActive,
      false,
    );
  }

  // Reactivating Contingent A never restores old revoked sessions
  const reactivated = evaluateReactivateContingent({
    sessions: deactivated.sessions,
  });
  assert.equal(reactivated.contingentIsActive, true);
  assert.equal(
    reactivated.sessions.every((s) => s.revoked_at !== null),
    true,
  );

  const reuseRevoked = evaluateTeamSessionRegistration({
    eligibility: makeEligibility({
      jwtSessionId: SESSION_2,
      teamAccount,
      contingentIsActive: reactivated.contingentIsActive,
    }),
    sessions: reactivated.sessions,
    authSessions,
    nowIso: "2026-11-24T12:20:00Z",
  });
  assert.equal(reuseRevoked.ok, false);
  assert.equal(reuseRevoked.reason, "session_revoked");

  // Fresh login works after contingent reactivation
  const freshLogin = evaluateTeamSessionRegistration({
    eligibility: makeEligibility({
      jwtSessionId: SESSION_4,
      teamAccount,
      contingentIsActive: reactivated.contingentIsActive,
    }),
    sessions: reactivated.sessions,
    authSessions,
    nowIso: "2026-11-24T12:21:00Z",
    newSessionRowId: "row-4",
  });
  assert.equal(freshLogin.ok, true);
  assert.equal(freshLogin.activeSessionCount, 1);
});

// ============================================================================
// STRUCTURAL SQL ASSERTIONS (static inspection of migrations only;
// live concurrency, auth.sessions joins, and RLS behavior require a real
// PostgreSQL/Supabase instance)
// ============================================================================

test("Stage 3B.1 (10) [Structural]: Migration 0009 enforces race-safe separation locks, atomic account & contingent deactivation revocation, and canonical lock ordering", () => {
  const sql = fs.readFileSync(
    path.join(ROOT_DIR, "supabase/migrations/202611240009_stage3b1_team_accounts.sql"),
    "utf8",
  );

  // Account model & uniqueness constraints
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.team_accounts/i);
  assert.match(sql, /contingent_id uuid NOT NULL REFERENCES public\.contingents \(id\) ON DELETE RESTRICT/);
  assert.match(sql, /auth_user_id uuid NOT NULL REFERENCES auth\.users \(id\) ON DELETE RESTRICT/);
  assert.match(sql, /ADD CONSTRAINT team_accounts_contingent_unique[\s\S]*UNIQUE \(contingent_id\)/);
  assert.match(sql, /ADD CONSTRAINT team_accounts_auth_user_unique[\s\S]*UNIQUE \(auth_user_id\)/);
  assert.match(sql, /ADD CONSTRAINT team_accounts_id_contingent_unique[\s\S]*UNIQUE \(id, contingent_id\)/);

  // Bidirectional race-safe separation from public.profiles via shared advisory lock BEFORE checking opposite table
  assert.doesNotMatch(sql, /profiles_role_check/);
  assert.match(sql, /CREATE TRIGGER protect_team_account_integrity/);
  assert.match(sql, /CREATE TRIGGER protect_profile_team_separation/);
  assert.match(
    sql,
    /enforce_team_account_integrity\(\)[\s\S]*pg_catalog\.pg_advisory_xact_lock\(\s*pg_catalog\.hashtext\('virtuoso_auth_identity_role:' \|\| NEW\.auth_user_id::text\)\s*\)[\s\S]*FROM public\.profiles p[\s\S]*WHERE p\.id = NEW\.auth_user_id/,
  );
  assert.match(
    sql,
    /enforce_profile_team_separation\(\)[\s\S]*pg_catalog\.pg_advisory_xact_lock\(\s*pg_catalog\.hashtext\('virtuoso_auth_identity_role:' \|\| NEW\.id::text\)\s*\)[\s\S]*FROM public\.team_accounts ta[\s\S]*WHERE ta\.auth_user_id = NEW\.id/,
  );

  // Atomic team account deactivation revocation
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.revoke_team_sessions_on_deactivation\(\)/);
  assert.match(
    sql,
    /CREATE TRIGGER revoke_sessions_on_team_account_deactivation[\s\S]*AFTER UPDATE OF is_active ON public\.team_accounts[\s\S]*WHEN \(OLD\.is_active IS TRUE AND NEW\.is_active IS FALSE\)/,
  );
  assert.match(
    sql,
    /revoke_team_sessions_on_deactivation\(\)[\s\S]*pg_catalog\.pg_advisory_xact_lock\(\s*pg_catalog\.hashtext\('virtuoso_team_session:' \|\| NEW\.id::text\)\s*\)[\s\S]*UPDATE public\.team_sessions ts[\s\S]*revoked_reason = 'account_deactivated'[\s\S]*WHERE ts\.team_account_id = NEW\.id[\s\S]*AND ts\.revoked_at IS NULL/,
  );

  // Atomic contingent deactivation revocation (handles no-account contingents safely, matches global lock order)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.revoke_team_sessions_on_contingent_deactivation\(\)/);
  assert.match(
    sql,
    /CREATE TRIGGER revoke_sessions_on_contingent_deactivation[\s\S]*AFTER UPDATE OF is_active ON public\.contingents[\s\S]*WHEN \(OLD\.is_active IS TRUE AND NEW\.is_active IS FALSE\)/,
  );
  assert.match(
    sql,
    /revoke_team_sessions_on_contingent_deactivation\(\)[\s\S]*FROM public\.team_accounts ta[\s\S]*WHERE ta\.contingent_id = NEW\.id[\s\S]*FOR UPDATE[\s\S]*IF NOT FOUND THEN[\s\S]*RETURN NULL;[\s\S]*pg_catalog\.pg_advisory_xact_lock\(\s*pg_catalog\.hashtext\('virtuoso_team_session:' \|\| v_team\.id::text\)\s*\)[\s\S]*UPDATE public\.team_sessions ts[\s\S]*revoked_reason = 'contingent_deactivated'[\s\S]*WHERE ts\.team_account_id = v_team\.id[\s\S]*AND ts\.revoked_at IS NULL/,
  );

  // Team sessions table & composite FK + immutability trigger
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.team_sessions/i);
  assert.match(
    sql,
    /CONSTRAINT team_sessions_account_contingent_fkey[\s\S]*FOREIGN KEY \(team_account_id, contingent_id\)[\s\S]*REFERENCES public\.team_accounts \(id, contingent_id\)/,
  );
  assert.match(sql, /ADD CONSTRAINT team_sessions_supabase_session_unique[\s\S]*UNIQUE \(supabase_session_id\)/);
  assert.match(
    sql,
    /'logout'[\s\S]*'organiser_revoked'[\s\S]*'account_deactivated'[\s\S]*'contingent_deactivated'[\s\S]*'auth_session_expired'/,
  );
  assert.match(sql, /CREATE TRIGGER protect_team_session_immutability/);
  assert.match(sql, /IF TG_OP = 'DELETE' THEN[\s\S]*RAISE EXCEPTION/);
  assert.match(sql, /IF OLD\.revoked_at IS NOT NULL THEN[\s\S]*RAISE EXCEPTION/);
});

test("Stage 3B.1 (11) [Structural]: Migration 0009 relies on verified is_active_super_admin() from migration 0001 and enforces Super Admin-only RLS", () => {
  const migration0001 = fs.readFileSync(
    path.join(ROOT_DIR, "supabase/migrations/202611160001_stage1b_profiles.sql"),
    "utf8",
  );
  const sql = fs.readFileSync(
    path.join(ROOT_DIR, "supabase/migrations/202611240009_stage3b1_team_accounts.sql"),
    "utf8",
  );

  // Verify public.is_active_super_admin() already exists in migration 0001 with active + role checks & SECURITY DEFINER
  assert.match(
    migration0001,
    /CREATE OR REPLACE FUNCTION public\.is_active_super_admin\(\)[\s\S]*STABLE[\s\S]*SECURITY DEFINER[\s\S]*p\.is_active = true[\s\S]*p\.role = 'super_admin'/,
  );
  assert.match(migration0001, /GRANT EXECUTE ON FUNCTION public\.is_active_super_admin\(\) TO authenticated;/);
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.is_active_super_admin/i);

  // RLS & direct-mutation revocation on team tables
  assert.match(sql, /ALTER TABLE public\.team_accounts ENABLE ROW LEVEL SECURITY;/);
  assert.match(sql, /ALTER TABLE public\.team_sessions ENABLE ROW LEVEL SECURITY;/);
  assert.match(sql, /REVOKE ALL ON public\.team_accounts FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /REVOKE ALL ON public\.team_sessions FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /GRANT SELECT ON public\.team_accounts TO authenticated;/);
  assert.match(sql, /GRANT SELECT ON public\.team_sessions TO authenticated;/);
  assert.match(sql, /CREATE POLICY team_accounts_select_super_admin[\s\S]*USING \(public\.is_active_super_admin\(\)\)/);
  assert.match(sql, /CREATE POLICY team_sessions_select_super_admin[\s\S]*USING \(public\.is_active_super_admin\(\)\)/);
  assert.doesNotMatch(sql, /CREATE POLICY[\s\S]*USING \(public\.is_active_organiser\(\)\)/);

  // No team policies added to existing competition tables in Stage 3B.1
  assert.doesNotMatch(
    sql,
    /CREATE POLICY[\s\S]+ON public\.(events|rounds|judging_criteria|contingents|participants|event_entries|entry_codenames|round_release_sessions|leaderboard_entries)\b/i,
  );

  // No synthetic email column or audit actor_email leakage
  assert.doesNotMatch(sql, /synthetic_email/i);
  assert.doesNotMatch(sql, /team\.virtuoso\.invalid/i);
  assert.match(sql, /INSERT INTO public\.audit_logs[\s\S]*VALUES\s*\(\s*NULL,\s*NULL,/);
});

test("Stage 3B.1 (12) [Structural]: Migration 0009 SECURITY DEFINER functions harden search_path (pg_temp last), maintain contingents->team_accounts->advisory lock order, and restrict grants", () => {
  const sql = fs.readFileSync(
    path.join(ROOT_DIR, "supabase/migrations/202611240009_stage3b1_team_accounts.sql"),
    "utf8",
  );

  // Explicit ownership & auth.sessions SELECT assumption documentation
  assert.match(sql, /SELECT on auth\.sessions \(id, user_id, not_after\)/);

  // Zero-argument RPC signatures (no caller-supplied team/contingent/session IDs)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.register_team_session\(\)/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.revoke_current_team_session\(\)/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.is_active_team_session\(\)/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.current_team_contingent_id\(\)/);

  // Safe search_path on every SECURITY DEFINER and trigger function (pg_catalog first, pg_temp last)
  const searchPathMatches = sql.match(/SET search_path = pg_catalog, public(?:, auth)?, pg_temp/g) ?? [];
  assert.equal(searchPathMatches.length, 11);

  // Fail-closed JWT claim extraction & revoked internal helpers
  assert.match(sql, /auth\.jwt\(\) ->> 'session_id'/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.current_jwt_session_id\(\) FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.enforce_team_account_integrity\(\) FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.enforce_profile_team_separation\(\) FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.revoke_team_sessions_on_deactivation\(\) FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.revoke_team_sessions_on_contingent_deactivation\(\) FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.enforce_team_session_immutability\(\) FROM PUBLIC, anon, authenticated;/);

  // Read-time helper checks auth.sessions + unrevoked team_sessions + statement_timestamp()
  assert.match(sql, /JOIN auth\.sessions a[\s\S]*a\.not_after IS NULL OR a\.not_after > pg_catalog\.statement_timestamp\(\)/);
  assert.match(sql, /ts\.revoked_at IS NULL/);

  // Canonical global lock order in register_team_session(): contingents FOR SHARE -> team_accounts FOR UPDATE -> advisory lock -> clock_timestamp()
  assert.match(
    sql,
    /register_team_session\(\)[\s\S]*FROM public\.contingents c[\s\S]*FOR SHARE[\s\S]*FROM public\.team_accounts ta[\s\S]*FOR UPDATE[\s\S]*pg_catalog\.pg_advisory_xact_lock\(\s*pg_catalog\.hashtext\('virtuoso_team_session:' \|\| v_team\.id::text\)\s*\)[\s\S]*v_now := pg_catalog\.clock_timestamp\(\);/,
  );
  assert.match(sql, /IF v_active_count >= 4 THEN[\s\S]*RAISE EXCEPTION 'Maximum of 4 concurrent team sessions reached/);
  assert.match(sql, /revoked_reason = 'auth_session_expired'/);
  assert.match(sql, /revoked_reason = 'logout'/);

  // Execute grants restricted to authenticated
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.is_active_team_session\(\) TO authenticated;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.current_team_contingent_id\(\) TO authenticated;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.register_team_session\(\) TO authenticated;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.revoke_current_team_session\(\) TO authenticated;/);
});
