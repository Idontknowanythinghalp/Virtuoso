import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  ALL_ORGANISER_ROLES,
  SUPER_ADMIN_ONLY,
  evaluateOrganiserAccess,
} from "../src/lib/auth/policy.ts";
import { sanitizeAuditPayload } from "../src/lib/audit/sanitize.ts";
import {
  TEAM_SYNTHETIC_EMAIL_DOMAIN,
  evaluateCurrentTeamSessionAccess,
  evaluateTeamSessionRegistration,
} from "../src/lib/auth/team-account-rules.ts";
import {
  revokeAllTeamSessionsWithDeps,
  revokeTeamSessionWithDeps,
  sanitizeSecretOutput,
  validateTeamCodeForAdmin,
} from "../src/lib/auth/team-account-admin.ts";
import {
  DEVICE_INFO_NOT_COLLECTED_LABEL,
  GLOBAL_LOGOUT_CONFIRMATION_PHRASE,
  buildTeamSessionOverviewSummary,
  classifyTeamSessionStatus,
  evaluateGlobalRevokeAllTeamsSessions,
  filterTeamSessionOverviews,
  formatTeamSessionRevocationReason,
  revokeAllTeamsSessionsWithDeps,
  sanitizeTeamSessionDetailsPayload,
  sanitizeTeamSessionOverviewPayload,
  validateGlobalLogoutConfirmation,
} from "../src/lib/auth/team-session-management.ts";

const ROOT_DIR = process.cwd();

const SUPER_ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const COORDINATOR_ID = "22222222-2222-4222-8222-222222222222";
const INACTIVE_ADMIN_ID = "33333333-3333-4333-8333-333333333333";

const CONTINGENT_A = "cccc1111-1111-4111-8111-111111111111";
const CONTINGENT_B = "cccc2222-2222-4222-8222-222222222222";
const TEAM_ACCOUNT_A = "aaaa1111-1111-4111-8111-111111111111";
const TEAM_ACCOUNT_B = "aaaa2222-2222-4222-8222-222222222222";
const AUTH_USER_A = "dddd1111-1111-4111-8111-111111111111";
const AUTH_USER_B = "dddd2222-2222-4222-8222-222222222222";

const TEAM_ROW_1 = "99990000-0000-4000-8000-000000000001";
const TEAM_ROW_2 = "99990000-0000-4000-8000-000000000002";
const TEAM_ROW_3 = "99990000-0000-4000-8000-000000000003";
const TEAM_ROW_4 = "99990000-0000-4000-8000-000000000004";
const TEAM_ROW_5 = "99990000-0000-4000-8000-000000000005";

const AUTH_SESS_1 = "11110000-0000-4000-8000-000000000001";
const AUTH_SESS_2 = "11110000-0000-4000-8000-000000000002";
const AUTH_SESS_3 = "11110000-0000-4000-8000-000000000003";
const AUTH_SESS_4 = "11110000-0000-4000-8000-000000000004";
const AUTH_SESS_5 = "11110000-0000-4000-8000-000000000005";

const NOW = "2026-11-27T12:00:00Z";
const PAST = "2026-11-27T10:00:00Z";
const FUTURE = "2026-11-27T18:00:00Z";

function makeAccount(id, contingentId, authUserId, isActive = true) {
  return {
    id,
    contingent_id: contingentId,
    auth_user_id: authUserId,
    is_active: isActive,
    created_by: SUPER_ADMIN_ID,
    updated_by: SUPER_ADMIN_ID,
    deactivated_at: isActive ? null : PAST,
    deactivated_by: isActive ? null : SUPER_ADMIN_ID,
    created_at: PAST,
    updated_at: PAST,
  };
}

// ============================================================================
// 1. AUTHORISATION & RBAC POLICY TESTS
// ============================================================================

test("Stage 4.5 (1) [Executed]: Only active Super Admins are authorized for Team Session Management; coordinators, inactive admins, teams, and unauthenticated users are denied", () => {
  const superAdminOk = evaluateOrganiserAccess({
    authUserId: SUPER_ADMIN_ID,
    profile: {
      id: SUPER_ADMIN_ID,
      full_name: "Super Admin",
      email: "admin@sjcc.edu.in",
      role: "super_admin",
      scope_mode: "all_events",
      is_active: true,
      created_at: PAST,
      updated_at: PAST,
    },
    allowedRoles: SUPER_ADMIN_ONLY,
  });
  assert.equal(superAdminOk.ok, true);

  const coordinatorDenied = evaluateOrganiserAccess({
    authUserId: COORDINATOR_ID,
    profile: {
      id: COORDINATOR_ID,
      full_name: "Coordinator",
      email: "coord@sjcc.edu.in",
      role: "event_coordinator",
      scope_mode: "all_events",
      is_active: true,
      created_at: PAST,
      updated_at: PAST,
    },
    allowedRoles: SUPER_ADMIN_ONLY,
  });
  assert.deepEqual(coordinatorDenied, { ok: false, reason: "forbidden" });

  const inactiveAdminDenied = evaluateOrganiserAccess({
    authUserId: INACTIVE_ADMIN_ID,
    profile: {
      id: INACTIVE_ADMIN_ID,
      full_name: "Inactive Admin",
      email: "former@sjcc.edu.in",
      role: "super_admin",
      scope_mode: "all_events",
      is_active: false,
      created_at: PAST,
      updated_at: PAST,
    },
    allowedRoles: SUPER_ADMIN_ONLY,
  });
  assert.deepEqual(inactiveAdminDenied, { ok: false, reason: "inactive" });

  const teamUserDenied = evaluateOrganiserAccess({
    authUserId: AUTH_USER_A,
    profile: null,
    allowedRoles: ALL_ORGANISER_ROLES,
  });
  assert.deepEqual(teamUserDenied, { ok: false, reason: "missing_profile" });

  const anonDenied = evaluateOrganiserAccess({
    authUserId: null,
    profile: null,
    allowedRoles: SUPER_ADMIN_ONLY,
  });
  assert.deepEqual(anonDenied, { ok: false, reason: "unauthenticated" });
});

// ============================================================================
// 2. OVERVIEW FILTERING, COUNTS & SUMMARY
// ============================================================================

test("Stage 4.5 (2) [Executed]: Team overview payload sanitization, search filtering, status filtering, and summary totals work accurately", () => {
  const sanitized = sanitizeTeamSessionOverviewPayload({
    generated_at: NOW,
    max_sessions: 4,
    teams: [
      {
        contingent_id: CONTINGENT_A,
        contingent_code: "SJCC-01",
        contingent_name: "Solstice Alpha",
        institution_name: "St. Joseph's College of Commerce",
        contingent_is_active: true,
        has_team_account: true,
        team_account_is_active: true,
        active_session_count: 2,
        max_sessions: 4,
        expired_unpruned_count: 1,
        total_session_count: 4,
        most_recent_active_at: NOW,
        most_recent_activity_at: NOW,
        supabase_session_id: AUTH_SESS_1,
        auth_user_id: AUTH_USER_A,
      },
      {
        contingent_id: CONTINGENT_B,
        contingent_code: "MCC-02",
        contingent_name: "Mount Carmel Beta",
        institution_name: "Mount Carmel College",
        contingent_is_active: true,
        has_team_account: true,
        team_account_is_active: true,
        active_session_count: 0,
        max_sessions: 4,
        expired_unpruned_count: 0,
        total_session_count: 1,
        most_recent_active_at: null,
        most_recent_activity_at: PAST,
      },
    ],
  });

  // Never leaks internal auth/session identifiers
  const serialized = JSON.stringify(sanitized);
  assert.equal(serialized.includes(AUTH_SESS_1), false);
  assert.equal(serialized.includes(AUTH_USER_A), false);

  assert.equal(sanitized.teams.length, 2);
  assert.equal(sanitized.teams[0].isLoggedIn, true);
  assert.equal(sanitized.teams[1].isLoggedIn, false);

  const summary = buildTeamSessionOverviewSummary(sanitized.teams);
  assert.deepEqual(summary, {
    totalTeams: 2,
    provisionedTeams: 2,
    loggedInTeams: 1,
    totalActiveSessions: 2,
    totalExpiredUnprunedSessions: 1,
  });

  assert.equal(
    filterTeamSessionOverviews(sanitized.teams, "sjcc", "all").length,
    1,
  );
  assert.equal(
    filterTeamSessionOverviews(sanitized.teams, "carmel", "not_logged_in").length,
    1,
  );
  assert.equal(
    filterTeamSessionOverviews(sanitized.teams, "", "logged_in")[0].contingentCode,
    "SJCC-01",
  );
  assert.equal(
    filterTeamSessionOverviews(sanitized.teams, "carmel", "logged_in").length,
    0,
  );
});

// ============================================================================
// 3. SESSION DETAIL CLASSIFICATION & SECRET STRIPPING
// ============================================================================

test("Stage 4.5 (3) [Executed]: Session detail classification distinguishes Active, Expired, and Revoked sessions and strips all secret fields", () => {
  assert.deepEqual(
    classifyTeamSessionStatus({
      revokedAt: null,
      revokedReason: null,
      teamAccountIsActive: true,
      contingentIsActive: true,
      authSessionExists: true,
      authSessionNotAfter: FUTURE,
      nowIso: NOW,
    }),
    { isActive: true, status: "active" },
  );

  // Null auth.sessions.not_after (unconfigured in GoTrue) still counts as active
  assert.deepEqual(
    classifyTeamSessionStatus({
      revokedAt: null,
      revokedReason: null,
      teamAccountIsActive: true,
      contingentIsActive: true,
      authSessionExists: true,
      authSessionNotAfter: null,
      nowIso: NOW,
    }),
    { isActive: true, status: "active" },
  );

  // Expired auth.sessions.not_after
  assert.deepEqual(
    classifyTeamSessionStatus({
      revokedAt: null,
      revokedReason: null,
      teamAccountIsActive: true,
      contingentIsActive: true,
      authSessionExists: true,
      authSessionNotAfter: PAST,
      nowIso: NOW,
    }),
    { isActive: false, status: "expired" },
  );

  // Pruned expired row
  assert.deepEqual(
    classifyTeamSessionStatus({
      revokedAt: NOW,
      revokedReason: "auth_session_expired",
      teamAccountIsActive: true,
      contingentIsActive: true,
      authSessionExists: false,
      authSessionNotAfter: null,
      nowIso: NOW,
    }),
    { isActive: false, status: "expired" },
  );

  // Admin revoked row
  assert.deepEqual(
    classifyTeamSessionStatus({
      revokedAt: NOW,
      revokedReason: "organiser_revoked",
      teamAccountIsActive: true,
      contingentIsActive: true,
      authSessionExists: true,
      authSessionNotAfter: FUTURE,
      nowIso: NOW,
    }),
    { isActive: false, status: "revoked" },
  );

  const details = sanitizeTeamSessionDetailsPayload({
    contingent_id: CONTINGENT_A,
    contingent_code: "SJCC-01",
    contingent_name: "Solstice Alpha",
    institution_name: "SJCC",
    contingent_is_active: true,
    team_account_is_active: true,
    active_session_count: 1,
    max_sessions: 4,
    sessions: [
      {
        session_id: TEAM_ROW_1,
        supabase_session_id: AUTH_SESS_1,
        auth_user_id: AUTH_USER_A,
        jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig",
        created_at: PAST,
        last_seen_at: NOW,
        expires_at: null,
        revoked_at: null,
        revoked_reason: null,
        is_active: true,
        status: "active",
      },
      {
        session_id: TEAM_ROW_2,
        created_at: PAST,
        last_seen_at: PAST,
        expires_at: PAST,
        revoked_at: null,
        revoked_reason: null,
        is_active: false,
        status: "expired",
      },
    ],
  });

  assert.ok(details);
  assert.equal(details.sessions.length, 2);
  assert.equal(
    details.sessions[0].deviceInfoStatus,
    DEVICE_INFO_NOT_COLLECTED_LABEL,
  );
  assert.equal(details.sessions[0].expiresAt, null);
  assert.equal(details.sessions[1].status, "expired");
  assert.equal(
    formatTeamSessionRevocationReason("organiser_revoked"),
    "Revoked by Super Admin",
  );

  const serialized = JSON.stringify(details);
  assert.equal(serialized.includes(AUTH_SESS_1), false);
  assert.equal(serialized.includes(AUTH_USER_A), false);
  assert.equal(serialized.includes("eyJhbGci"), false);
  assert.equal(serialized.includes(TEAM_SYNTHETIC_EMAIL_DOMAIN), false);
});

// ============================================================================
// 4. SINGLE-SESSION REVOCATION & IMMEDIATE ACCESS INVALIDATION
// ============================================================================

test("Stage 4.5 (4) [Executed]: Single-session revocation invalidates only the target session immediately, preserves remaining devices, and frees a slot under the 4-device limit", async () => {
  const account = makeAccount(TEAM_ACCOUNT_A, CONTINGENT_A, AUTH_USER_A, true);
  const authSessions = [
    AUTH_SESS_1,
    AUTH_SESS_2,
    AUTH_SESS_3,
    AUTH_SESS_4,
    AUTH_SESS_5,
  ].map((id) => ({ id, user_id: AUTH_USER_A, not_after: FUTURE }));

  let sessions = [
    [TEAM_ROW_1, AUTH_SESS_1],
    [TEAM_ROW_2, AUTH_SESS_2],
    [TEAM_ROW_3, AUTH_SESS_3],
    [TEAM_ROW_4, AUTH_SESS_4],
  ].map(([id, sid]) => ({
    id,
    team_account_id: TEAM_ACCOUNT_A,
    contingent_id: CONTINGENT_A,
    supabase_session_id: sid,
    created_at: PAST,
    last_seen_at: PAST,
    revoked_at: null,
    revoked_reason: null,
    revoked_by: null,
  }));

  const operator = { id: SUPER_ADMIN_ID, email: "admin@sjcc.edu.in" };

  const singleDeps = {
    async revokeTeamSessionRpc({ teamSessionId }) {
      const target = sessions.find((s) => s.id === teamSessionId);
      if (!target) return { data: null, error: "Team session was not found" };
      if (target.revoked_at !== null) {
        return {
          data: {
            operation: "already_revoked",
            revoked: false,
            session_id: target.id,
            contingent_code: "SJCC-01",
            revoked_at: target.revoked_at,
            revoked_reason: target.revoked_reason,
          },
          error: null,
        };
      }
      sessions = sessions.map((s) =>
        s.id === teamSessionId
          ? {
              ...s,
              revoked_at: NOW,
              revoked_reason: "organiser_revoked",
              revoked_by: SUPER_ADMIN_ID,
            }
          : s,
      );
      return {
        data: {
          operation: "revoked",
          revoked: true,
          session_id: teamSessionId,
          contingent_code: "SJCC-01",
          revoked_at: NOW,
          revoked_reason: "organiser_revoked",
        },
        error: null,
      };
    },
  };

  const first = await revokeTeamSessionWithDeps({
    operator,
    rawContingentCode: "SJCC-01",
    rawSessionId: TEAM_ROW_2,
    deps: singleDeps,
  });
  assert.equal(first.ok, true);
  if (first.ok) {
    assert.equal(first.operation, "revoked");
    assert.equal(first.revoked, true);
  }

  // Repeated revocation is safe/idempotent
  const repeat = await revokeTeamSessionWithDeps({
    operator,
    rawContingentCode: "SJCC-01",
    rawSessionId: TEAM_ROW_2,
    deps: singleDeps,
  });
  assert.equal(repeat.ok, true);
  if (repeat.ok) {
    assert.equal(repeat.operation, "already_revoked");
    assert.equal(repeat.revoked, false);
  }

  // Revoked session 2 is immediately blocked on next request
  const revokedAccess = evaluateCurrentTeamSessionAccess({
    eligibility: {
      authUserId: AUTH_USER_A,
      jwtSessionId: AUTH_SESS_2,
      hasOrganiserProfile: false,
      teamAccount: account,
      contingentIsActive: true,
    },
    sessions,
    authSessions,
    nowIso: NOW,
  });
  assert.deepEqual(revokedAccess, { isActive: false, contingentId: null });

  // Sessions 1, 3, and 4 remain active
  for (const activeSid of [AUTH_SESS_1, AUTH_SESS_3, AUTH_SESS_4]) {
    const okAccess = evaluateCurrentTeamSessionAccess({
      eligibility: {
        authUserId: AUTH_USER_A,
        jwtSessionId: activeSid,
        hasOrganiserProfile: false,
        teamAccount: account,
        contingentIsActive: true,
      },
      sessions,
      authSessions,
      nowIso: NOW,
    });
    assert.equal(okAccess.isActive, true);
  }

  // Freed slot allows 5th device login
  const newLogin = evaluateTeamSessionRegistration({
    eligibility: {
      authUserId: AUTH_USER_A,
      jwtSessionId: AUTH_SESS_5,
      hasOrganiserProfile: false,
      teamAccount: account,
      contingentIsActive: true,
    },
    sessions,
    authSessions,
    nowIso: NOW,
    newSessionRowId: TEAM_ROW_5,
  });
  assert.equal(newLogin.ok, true);
  if (newLogin.ok) {
    assert.equal(newLogin.activeSessionCount, 4);
  }
});

// ============================================================================
// 5. PER-TEAM LOG OUT ALL DEVICES & PRESERVATION OF CREDENTIALS / OTHER TEAMS
// ============================================================================

test("Stage 4.5 (5) [Executed]: Log Out All Devices revokes all active sessions for that team simultaneously while preserving account and other teams", async () => {
  let teamASessions = [AUTH_SESS_1, AUTH_SESS_2].map((sid, idx) => ({
    id: idx === 0 ? TEAM_ROW_1 : TEAM_ROW_2,
    team_account_id: TEAM_ACCOUNT_A,
    contingent_id: CONTINGENT_A,
    supabase_session_id: sid,
    created_at: PAST,
    last_seen_at: PAST,
    revoked_at: null,
    revoked_reason: null,
    revoked_by: null,
  }));
  const teamBSessions = [
    {
      id: TEAM_ROW_3,
      team_account_id: TEAM_ACCOUNT_B,
      contingent_id: CONTINGENT_B,
      supabase_session_id: AUTH_SESS_3,
      created_at: PAST,
      last_seen_at: PAST,
      revoked_at: null,
      revoked_reason: null,
      revoked_by: null,
    },
  ];
  const accountA = makeAccount(TEAM_ACCOUNT_A, CONTINGENT_A, AUTH_USER_A, true);
  const accountB = makeAccount(TEAM_ACCOUNT_B, CONTINGENT_B, AUTH_USER_B, true);
  const authSessions = [
    { id: AUTH_SESS_1, user_id: AUTH_USER_A, not_after: FUTURE },
    { id: AUTH_SESS_2, user_id: AUTH_USER_A, not_after: FUTURE },
    { id: AUTH_SESS_3, user_id: AUTH_USER_B, not_after: FUTURE },
  ];

  const deps = {
    async revokeAllTeamSessionsRpc({ contingentCode }) {
      const openIds = teamASessions
        .filter((s) => s.revoked_at === null)
        .map((s) => s.id);
      if (openIds.length === 0) {
        return {
          data: {
            operation: "none_active",
            revoked_count: 0,
            revoked_session_ids: [],
            contingent_code: contingentCode,
          },
          error: null,
        };
      }
      teamASessions = teamASessions.map((s) =>
        s.revoked_at === null
          ? {
              ...s,
              revoked_at: NOW,
              revoked_reason: "organiser_revoked",
              revoked_by: SUPER_ADMIN_ID,
            }
          : s,
      );
      return {
        data: {
          operation: "revoked_all",
          revoked_count: openIds.length,
          revoked_session_ids: openIds,
          contingent_code: contingentCode,
        },
        error: null,
      };
    },
  };

  const operator = { id: SUPER_ADMIN_ID, email: "admin@sjcc.edu.in" };
  const res = await revokeAllTeamSessionsWithDeps({
    operator,
    rawContingentCode: "SJCC-01",
    deps,
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.operation, "revoked_all");
    assert.equal(res.revokedCount, 2);
  }

  // Team A's account stays active and can immediately sign in again with existing credentials
  assert.equal(accountA.is_active, true);
  assert.equal(
    evaluateCurrentTeamSessionAccess({
      eligibility: {
        authUserId: AUTH_USER_A,
        jwtSessionId: AUTH_SESS_1,
        hasOrganiserProfile: false,
        teamAccount: accountA,
        contingentIsActive: true,
      },
      sessions: teamASessions,
      authSessions,
      nowIso: NOW,
    }).isActive,
    false,
  );

  // Team B remains untouched
  assert.equal(
    evaluateCurrentTeamSessionAccess({
      eligibility: {
        authUserId: AUTH_USER_B,
        jwtSessionId: AUTH_SESS_3,
        hasOrganiserProfile: false,
        teamAccount: accountB,
        contingentIsActive: true,
      },
      sessions: teamBSessions,
      authSessions,
      nowIso: NOW,
    }).isActive,
    true,
  );

  // Repeating when 0 active sessions remain is idempotent
  const repeat = await revokeAllTeamSessionsWithDeps({
    operator,
    rawContingentCode: "SJCC-01",
    deps,
  });
  assert.equal(repeat.ok, true);
  if (repeat.ok) {
    assert.equal(repeat.operation, "none_active");
    assert.equal(repeat.revokedCount, 0);
  }
});

// ============================================================================
// 6. GLOBAL EMERGENCY LOGOUT & EXPIRED SESSION PRUNING
// ============================================================================

test("Stage 4.5 (6) [Executed]: Global emergency logout requires exact confirmation, revokes all active teams atomically, prunes expired rows separately, preserves accounts, and handles 0 active sessions idempotently", async () => {
  const accounts = [
    makeAccount(TEAM_ACCOUNT_A, CONTINGENT_A, AUTH_USER_A, true),
    makeAccount(TEAM_ACCOUNT_B, CONTINGENT_B, AUTH_USER_B, true),
  ];
  const contingents = [
    { id: CONTINGENT_A, contingent_code: "SJCC-01", is_active: true },
    { id: CONTINGENT_B, contingent_code: "MCC-02", is_active: true },
  ];
  const authSessions = [
    { id: AUTH_SESS_1, user_id: AUTH_USER_A, not_after: FUTURE },
    { id: AUTH_SESS_2, user_id: AUTH_USER_A, not_after: PAST }, // expired
    { id: AUTH_SESS_3, user_id: AUTH_USER_B, not_after: null }, // active (no expiry)
  ];
  const initialSessions = [
    {
      id: TEAM_ROW_1,
      team_account_id: TEAM_ACCOUNT_A,
      contingent_id: CONTINGENT_A,
      supabase_session_id: AUTH_SESS_1,
      created_at: PAST,
      last_seen_at: PAST,
      revoked_at: null,
      revoked_reason: null,
      revoked_by: null,
    },
    {
      id: TEAM_ROW_2,
      team_account_id: TEAM_ACCOUNT_A,
      contingent_id: CONTINGENT_A,
      supabase_session_id: AUTH_SESS_2,
      created_at: PAST,
      last_seen_at: PAST,
      revoked_at: null,
      revoked_reason: null,
      revoked_by: null,
    },
    {
      id: TEAM_ROW_3,
      team_account_id: TEAM_ACCOUNT_B,
      contingent_id: CONTINGENT_B,
      supabase_session_id: AUTH_SESS_3,
      created_at: PAST,
      last_seen_at: PAST,
      revoked_at: null,
      revoked_reason: null,
      revoked_by: null,
    },
    {
      id: TEAM_ROW_4,
      team_account_id: TEAM_ACCOUNT_B,
      contingent_id: CONTINGENT_B,
      supabase_session_id: AUTH_SESS_4,
      created_at: PAST,
      last_seen_at: PAST,
      revoked_at: PAST,
      revoked_reason: "logout",
      revoked_by: null,
    },
  ];

  // Confirmation gate checks
  assert.equal(validateGlobalLogoutConfirmation("log out all teams").ok, false);
  assert.equal(
    validateGlobalLogoutConfirmation(GLOBAL_LOGOUT_CONFIRMATION_PHRASE).ok,
    true,
  );

  // Reject wrong confirmation before calling RPC
  let rpcCalled = false;
  const badConfirm = await revokeAllTeamsSessionsWithDeps({
    operator: { id: SUPER_ADMIN_ID, email: "admin@sjcc.edu.in" },
    rawConfirmationText: "WRONG",
    deps: {
      async revokeAllTeamsSessionsRpc() {
        rpcCalled = true;
        return { data: null, error: null };
      },
    },
  });
  assert.equal(badConfirm.ok, false);
  assert.equal(rpcCalled, false);

  // Reference model execution
  const firstRun = evaluateGlobalRevokeAllTeamsSessions({
    actorProfileId: SUPER_ADMIN_ID,
    accounts,
    contingents,
    sessions: initialSessions,
    authSessions,
    nowIso: NOW,
  });

  assert.equal(firstRun.operation, "revoked_all_teams");
  assert.equal(firstRun.revokedCount, 2);
  assert.equal(firstRun.expiredPrunedCount, 1);
  assert.equal(firstRun.affectedTeamCount, 2);
  assert.deepEqual(firstRun.affectedContingentCodes, ["MCC-02", "SJCC-01"]);

  // Expired row marked auth_session_expired with revoked_by = null
  const expiredRow = firstRun.sessions.find((s) => s.id === TEAM_ROW_2);
  assert.equal(expiredRow?.revoked_reason, "auth_session_expired");
  assert.equal(expiredRow?.revoked_by, null);

  // Historical logout row preserved unchanged
  const logoutRow = firstRun.sessions.find((s) => s.id === TEAM_ROW_4);
  assert.equal(logoutRow?.revoked_reason, "logout");
  assert.equal(logoutRow?.revoked_at, PAST);

  // Re-running when 0 active sessions exist is idempotent
  const secondRun = evaluateGlobalRevokeAllTeamsSessions({
    actorProfileId: SUPER_ADMIN_ID,
    accounts,
    contingents,
    sessions: firstRun.sessions,
    authSessions,
    nowIso: NOW,
  });
  assert.equal(secondRun.operation, "none_active");
  assert.equal(secondRun.revokedCount, 0);
  assert.equal(secondRun.expiredPrunedCount, 0);

  // Wrapper handles RPC success & redacts RPC errors
  const rpcSuccess = await revokeAllTeamsSessionsWithDeps({
    operator: { id: SUPER_ADMIN_ID, email: "admin@sjcc.edu.in" },
    rawConfirmationText: ` ${GLOBAL_LOGOUT_CONFIRMATION_PHRASE} `,
    deps: {
      async revokeAllTeamsSessionsRpc() {
        return {
          data: {
            operation: "revoked_all_teams",
            revoked_count: 2,
            expired_pruned_count: 1,
            affected_team_count: 2,
            affected_contingent_codes: ["MCC-02", "SJCC-01"],
            revoked_at: NOW,
          },
          error: null,
        };
      },
    },
  });
  assert.equal(rpcSuccess.ok, true);
  if (rpcSuccess.ok) {
    assert.equal(rpcSuccess.revokedCount, 2);
    assert.equal(rpcSuccess.affectedTeamCount, 2);
  }

  const rpcErr = await revokeAllTeamsSessionsWithDeps({
    operator: { id: SUPER_ADMIN_ID, email: "admin@sjcc.edu.in" },
    rawConfirmationText: GLOBAL_LOGOUT_CONFIRMATION_PHRASE,
    deps: {
      async revokeAllTeamsSessionsRpc() {
        return {
          data: null,
          error: `DB error for team-${TEAM_ACCOUNT_A}@team.virtuoso.invalid`,
        };
      },
    },
  });
  assert.equal(rpcErr.ok, false);
  if (!rpcErr.ok) {
    assert.equal(rpcErr.error.includes(TEAM_SYNTHETIC_EMAIL_DOMAIN), false);
  }
});

// ============================================================================
// 7. INPUT VALIDATION & AUDIT LOG SANITIZATION
// ============================================================================

test("Stage 4.5 (7) [Executed]: Invalid inputs are rejected cleanly and secret values are redacted from errors and audit logs", async () => {
  assert.equal(validateTeamCodeForAdmin("x").ok, false);
  assert.equal(validateTeamCodeForAdmin("  sjcc-01 ").ok, true);

  const badUuid = await revokeTeamSessionWithDeps({
    operator: { id: SUPER_ADMIN_ID, email: "admin@sjcc.edu.in" },
    rawContingentCode: "SJCC-01",
    rawSessionId: "not-a-uuid",
    deps: {
      async revokeTeamSessionRpc() {
        throw new Error("Should not call RPC on invalid UUID");
      },
    },
  });
  assert.equal(badUuid.ok, false);

  const redacted = sanitizeSecretOutput(
    `Error team-${TEAM_ACCOUNT_A}@${TEAM_SYNTHETIC_EMAIL_DOMAIN} token eyJhbGciOiJIUzI1NiJ9.abc.def`,
  );
  assert.equal(redacted.includes(TEAM_SYNTHETIC_EMAIL_DOMAIN), false);
  assert.equal(redacted.includes("eyJhbGci"), false);

  const audited = sanitizeAuditPayload({
    contingent_code: "SJCC-01",
    supabase_session_id: AUTH_SESS_1,
    refresh_token: "secret-refresh",
  });
  assert.equal(audited?.contingent_code, "SJCC-01");
  assert.equal(audited?.refresh_token, "[redacted]");
});

// ============================================================================
// 8. UI, NAVIGATION, PROXY & SERVER GUARD STRUCTURAL CHECKS
// ============================================================================

test("Stage 4.5 (8) [Structural]: CmsShell, /admin/team-sessions, TeamSessionsManager, Server Actions, and AuditLogViewer enforce Super Admin exclusivity, icon/UI rules, and zero secret exposure", () => {
  const cmsShell = fs.readFileSync(
    path.join(ROOT_DIR, "src/components/layout/CmsShell.tsx"),
    "utf8",
  );
  const pageSrc = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/admin/team-sessions/page.tsx"),
    "utf8",
  );
  const actionsSrc = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/actions/team-sessions.ts"),
    "utf8",
  );
  const managerSrc = fs.readFileSync(
    path.join(ROOT_DIR, "src/components/admin/TeamSessionsManager.tsx"),
    "utf8",
  );
  const auditViewerSrc = fs.readFileSync(
    path.join(ROOT_DIR, "src/components/admin/AuditLogViewer.tsx"),
    "utf8",
  );

  // Team Sessions link appears ONLY inside the isSuperAdmin Administration section
  assert.match(
    cmsShell,
    /\{isSuperAdmin \? \([\s\S]*href="\/admin\/team-sessions"[\s\S]*Team Sessions[\s\S]*\) : null\}/,
  );

  // Page & every Server Action enforce SUPER_ADMIN_ONLY
  assert.match(pageSrc, /requireActiveUser\(SUPER_ADMIN_ONLY/);
  assert.match(pageSrc, /export const dynamic = "force-dynamic"/);
  const actionGuardMatches =
    actionsSrc.match(/requireActiveUserForAction\(SUPER_ADMIN_ONLY/g) ?? [];
  assert.equal(actionGuardMatches.length, 5);
  assert.equal(actionsSrc.includes("createSupabaseAdminClient"), false);

  // Client component safety, Lucide icons, no browser popups, explicit confirmations
  assert.equal(managerSrc.startsWith('"use client"'), true);
  assert.equal(managerSrc.includes("SUPABASE_SERVICE_ROLE_KEY"), false);
  assert.equal(managerSrc.includes("@/lib/supabase/admin"), false);
  assert.equal(managerSrc.includes("@/lib/supabase/server"), false);
  assert.equal(managerSrc.includes("supabase_session_id"), false);
  assert.equal(managerSrc.includes("auth_user_id"), false);
  assert.equal(/\bwindow\.(alert|confirm|open)\b/.test(managerSrc), false);
  assert.equal(/<svg\b/i.test(managerSrc), false);
  assert.match(managerSrc, /from "lucide-react"/);
  assert.match(managerSrc, /Log Out All Devices/);
  assert.match(managerSrc, /Log Out All Teams/);
  assert.match(managerSrc, /Revoke Session/);
  assert.match(managerSrc, /GLOBAL_LOGOUT_CONFIRMATION_PHRASE/);

  // Audit Log Viewer filters include team_session actions
  assert.match(auditViewerSrc, /team_session\.revoked_by_admin/);
  assert.match(auditViewerSrc, /team_session\.all_revoked_by_admin/);
  assert.match(auditViewerSrc, /team_session\.global_revoked_by_admin/);
  assert.match(auditViewerSrc, /value: "team_session"/);
});

// ============================================================================
// 9. MIGRATION 0014 & REAL-TIME ENFORCEMENT STRUCTURAL CHECKS
// ============================================================================

test("Stage 4.5 (9) [Structural]: Migration 0014 enforces Super Admin actor checks, safe search_path, deterministic global lock order, and zero secret exposure; proxy & team-guards immediately reject revoked sessions", () => {
  const migrationSql = fs.readFileSync(
    path.join(
      ROOT_DIR,
      "supabase/migrations/202611270014_stage45_team_session_management.sql",
    ),
    "utf8",
  );
  const proxySrc = fs.readFileSync(
    path.join(ROOT_DIR, "src/proxy.ts"),
    "utf8",
  );
  const teamGuardsSrc = fs.readFileSync(
    path.join(ROOT_DIR, "src/lib/auth/team-guards.ts"),
    "utf8",
  );

  // Valid pg_catalog built-ins only & balanced $$ delimiters
  assert.equal(/\bpg_catalog\.trim\s*\(/i.test(migrationSql), false);
  assert.equal(/\bauth\.role\s*\(/i.test(migrationSql), false);
  assert.equal(/\bp_actor_user_id\b/i.test(migrationSql), false);
  const dollarCount = (migrationSql.match(/\$\$/g) ?? []).length;
  assert.equal(dollarCount % 2, 0);

  const allowedPgCatalogFns = new Set([
    "btrim",
    "upper",
    "lower",
    "char_length",
    "clock_timestamp",
    "pg_advisory_xact_lock",
    "hashtext",
    "count",
    "max",
    "array_agg",
    "jsonb_build_object",
    "jsonb_agg",
    "to_jsonb",
  ]);
  for (const match of migrationSql.matchAll(
    /pg_catalog\.([a-z0-9_]+)\s*\(/gi,
  )) {
    assert.ok(
      allowedPgCatalogFns.has(match[1].toLowerCase()),
      `Unexpected pg_catalog function: ${match[1]}`,
    );
  }

  // Required RPCs, strict grants, and actor enforcement
  for (const [fnName, sig] of [
    ["admin_list_team_session_overviews", ""],
    ["admin_get_team_session_details", "text"],
    ["admin_revoke_all_teams_sessions", ""],
  ]) {
    assert.match(
      migrationSql,
      new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fnName}\\(`, "i"),
    );
    assert.match(
      migrationSql,
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${fnName}\\(${sig}\\) FROM PUBLIC, anon, authenticated, service_role;`,
        "i",
      ),
    );
    assert.match(
      migrationSql,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${fnName}\\(${sig}\\) TO authenticated;`,
        "i",
      ),
    );
  }

  assert.equal(
    /GRANT EXECUTE ON FUNCTION .* TO (anon|PUBLIC|service_role)/i.test(
      migrationSql,
    ),
    false,
  );
  assert.equal(
    (migrationSql.match(/FROM public\.assert_team_admin_actor\(\)/gi) ?? [])
      .length,
    3,
  );
  assert.equal(
    (
      migrationSql.match(
        /SET search_path = pg_catalog, public, auth, pg_temp/gi,
      ) ?? []
    ).length,
    3,
  );

  // Secret fields never serialized in any jsonb_build_object(...) output
  for (let i = 0; i < migrationSql.length; i += 1) {
    const idx = migrationSql.indexOf("jsonb_build_object(", i);
    if (idx === -1) break;
    let depth = 0;
    let end = idx + "jsonb_build_object(".length;
    for (let j = idx + "jsonb_build_object".length; j < migrationSql.length; j += 1) {
      if (migrationSql[j] === "(") depth += 1;
      else if (migrationSql[j] === ")") {
        depth -= 1;
        if (depth === 0) {
          end = j + 1;
          break;
        }
      }
    }
    const callExpr = migrationSql.slice(idx, end);
    assert.equal(
      /(supabase_session_id|auth_user_id)/i.test(callExpr),
      false,
      `jsonb_build_object output must not expose secret fields: ${callExpr}`,
    );
    i = end;
  }

  // Deterministic global lock order + team_accounts SHARE lock + valid NOT EXISTS pruning + audit entry
  assert.match(
    migrationSql,
    /FROM public\.contingents c\s+ORDER BY c\.id ASC\s+FOR SHARE;\s+LOCK TABLE public\.team_accounts IN SHARE MODE;[\s\S]*SELECT ta\.id\s+FROM public\.team_accounts ta\s+ORDER BY ta\.id ASC\s+FOR UPDATE[\s\S]*pg_catalog\.pg_advisory_xact_lock\(/i,
  );
  assert.match(
    migrationSql,
    /WITH expired_rows AS \(\s*UPDATE public\.team_sessions ts[\s\S]*AND NOT EXISTS \(\s*SELECT 1\s+FROM auth\.sessions a/i,
  );
  assert.match(migrationSql, /revoked_reason = 'auth_session_expired'/);
  assert.match(migrationSql, /team_session\.global_revoked_by_admin/);

  // Immediate server-side enforcement on every participant route and action
  assert.match(proxySrc, /supabase\.rpc\(\s*"is_active_team_session"/);
  assert.match(teamGuardsSrc, /supabase\.rpc\("is_active_team_session"\)/);
});
