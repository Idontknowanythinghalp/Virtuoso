import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  ALL_ORGANISER_ROLES,
  evaluateOrganiserAccess,
} from "../src/lib/auth/policy.ts";
import {
  TEAM_SYNTHETIC_EMAIL_DOMAIN,
  buildTeamSyntheticEmail,
  evaluateCurrentTeamSessionAccess,
  evaluateDeactivateContingent,
  evaluateDeactivateTeamAccount,
  evaluateReactivateContingent,
  evaluateReactivateTeamAccount,
  evaluateTeamSessionRegistration,
} from "../src/lib/auth/team-account-rules.ts";
import {
  authenticateSuperAdminOperatorWithDeps,
  commandRequiresServiceRole,
  createTeamAccountWithDeps,
  listTeamSessionsWithDeps,
  parseTeamAdminCliArgs,
  resetTeamPasswordWithDeps,
  revokeAllTeamSessionsWithDeps,
  revokeTeamSessionWithDeps,
  sanitizeSecretOutput,
  setTeamAccountActiveWithDeps,
} from "../src/lib/auth/team-account-admin.ts";

const ROOT_DIR = process.cwd();

const SUPER_ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const COORDINATOR_ID = "22222222-2222-4222-8222-222222222222";
const INACTIVE_ADMIN_ID = "33333333-3333-4333-8333-333333333333";

const CONTINGENT_ID = "cccc1111-1111-4111-8111-111111111111";
const TEAM_ACCOUNT_ID = "aaaa1111-1111-4111-8111-111111111111";
const AUTH_USER_ID = "dddd1111-1111-4111-8111-111111111111";

const TEAM_SESSION_ROW_1 = "99990000-0000-4000-8000-000000000001";
const TEAM_SESSION_ROW_2 = "99990000-0000-4000-8000-000000000002";
const AUTH_SESSION_1 = "11110000-0000-4000-8000-000000000001";
const AUTH_SESSION_2 = "11110000-0000-4000-8000-000000000002";
const AUTH_SESSION_3 = "11110000-0000-4000-8000-000000000003";

const VERIFIED_OPERATOR = {
  id: SUPER_ADMIN_ID,
  email: "admin@sjcc.edu.in",
};

/**
 * Reference check matching migration 0009 CHECK constraint:
 * team_accounts_deactivation_consistency_check
 */
function assertTeamAccountConstraint0009(account) {
  if (account.is_active === true) {
    assert.equal(
      account.deactivated_at,
      null,
      "Active team_accounts row must have deactivated_at IS NULL per migration 0009",
    );
    assert.equal(
      account.deactivated_by,
      null,
      "Active team_accounts row must have deactivated_by IS NULL per migration 0009",
    );
  } else {
    assert.notEqual(
      account.deactivated_at,
      null,
      "Inactive team_accounts row must have deactivated_at IS NOT NULL per migration 0009",
    );
  }
}

// ============================================================================
// MOCKED UNIT TESTS (Executed in Node against Stage 3B.3 TS modules)
// ============================================================================

test("Stage 3B.3 (1) [Mocked Unit Test]: Account creation derives immutable synthetic email, creates Auth + team_accounts without profiles, binds audit to verified operator, and rejects duplicates", async () => {
  const createdAuthUsers = [];
  const existingTeamContingents = new Set();
  const auditRecords = [];

  function makeDeps() {
    return {
      generateUuid: () => TEAM_ACCOUNT_ID,
      async preflightCreateTeamAccount(payload) {
        assert.equal("actorUserId" in payload, false);
        if (existingTeamContingents.has(payload.contingentCode)) {
          return {
            contingent: null,
            error: `A team account already exists for contingent "${payload.contingentCode}"`,
          };
        }
        return {
          contingent: {
            contingent_id: CONTINGENT_ID,
            contingent_code: "SJCC-01",
            contingent_name: "SJCC Alpha",
            institution_name: "St. Joseph's College of Commerce",
          },
          error: null,
        };
      },
      async createAuthUser({ email, password }) {
        createdAuthUsers.push({ email, password });
        return { authUserId: AUTH_USER_ID, error: null };
      },
      async insertTeamAccountRecord(payload) {
        assert.equal("actorUserId" in payload, false);
        assert.equal(payload.authUserId, AUTH_USER_ID);
        existingTeamContingents.add("SJCC-01");
        auditRecords.push({
          action: "team_account.created",
          actor_user_id: VERIFIED_OPERATOR.id,
          actor_email: VERIFIED_OPERATOR.email,
          teamAccountId: payload.teamAccountId,
          contingentId: payload.contingentId,
        });
        return {
          created: {
            team_account_id: payload.teamAccountId,
            contingent_id: payload.contingentId,
            contingent_code: "SJCC-01",
            contingent_name: "SJCC Alpha",
            auth_user_id: payload.authUserId,
            is_active: true,
            created_at: "2026-11-25T10:00:00Z",
          },
          error: null,
        };
      },
      async deleteAuthUser() {
        throw new Error("Should not delete on success");
      },
    };
  }

  const secretPass = "TeamSecret!2026#Alpha";
  const created = await createTeamAccountWithDeps({
    operator: VERIFIED_OPERATOR,
    rawContingentCode: " sjcc-01 ",
    rawPassword: secretPass,
    rawConfirmPassword: secretPass,
    deps: makeDeps(),
  });

  assert.equal(created.ok, true);
  assert.equal(createdAuthUsers.length, 1);
  assert.equal(
    createdAuthUsers[0].email,
    buildTeamSyntheticEmail(TEAM_ACCOUNT_ID),
  );
  assert.equal(auditRecords.length, 1);
  assert.equal(auditRecords[0].actor_user_id, SUPER_ADMIN_ID);

  // Returned object must NEVER contain synthetic email, password, or authUserId
  const serialized = JSON.stringify(created);
  assert.equal(serialized.includes(TEAM_SYNTHETIC_EMAIL_DOMAIN), false);
  assert.equal(serialized.includes(secretPass), false);
  assert.equal(serialized.includes(AUTH_USER_ID), false);
  assert.equal(serialized.includes(TEAM_ACCOUNT_ID), false);

  // Duplicate contingent creation is rejected before creating another Auth user
  const duplicate = await createTeamAccountWithDeps({
    operator: VERIFIED_OPERATOR,
    rawContingentCode: "SJCC-01",
    rawPassword: secretPass,
    rawConfirmPassword: secretPass,
    deps: makeDeps(),
  });
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.error, /already exists/i);
  assert.equal(createdAuthUsers.length, 1);
});

test("Stage 3B.3 (2) [Mocked Unit Test]: Account creation retries once idempotently on uncertain DB responses, never deletes Auth users, and enforces reconciliation on failure, mismatch, or inactive account", async () => {
  const secretPass = "SuperStrongPassword!2026";
  const contingent = {
    contingent_id: CONTINGENT_ID,
    contingent_code: "SJCC-01",
    contingent_name: "SJCC Alpha",
    institution_name: "SJCC",
  };

  function assertNoSensitiveLeaks(result) {
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes(TEAM_SYNTHETIC_EMAIL_DOMAIN), false);
    assert.equal(serialized.includes(secretPass), false);
    assert.equal(serialized.includes(AUTH_USER_ID), false);
    assert.equal(serialized.includes(TEAM_ACCOUNT_ID), false);
  }

  // Case A: First RPC response lost/fails, second idempotent retry confirms committed account
  let deleteCallsA = 0;
  const payloadsA = [];
  const retryConfirmed = await createTeamAccountWithDeps({
    operator: VERIFIED_OPERATOR,
    rawContingentCode: "SJCC-01",
    rawPassword: secretPass,
    rawConfirmPassword: secretPass,
    deps: {
      generateUuid: () => TEAM_ACCOUNT_ID,
      async preflightCreateTeamAccount() {
        return { contingent, error: null };
      },
      async createAuthUser() {
        return { authUserId: AUTH_USER_ID, error: null };
      },
      async insertTeamAccountRecord(payload) {
        payloadsA.push(payload);
        if (payloadsA.length === 1) {
          throw new Error("Gateway timeout after commit");
        }
        return {
          created: {
            team_account_id: payload.teamAccountId,
            contingent_id: payload.contingentId,
            contingent_code: "SJCC-01",
            contingent_name: "SJCC Alpha",
            auth_user_id: payload.authUserId,
            is_active: true,
            created_at: "2026-11-25T10:00:00Z",
          },
          error: null,
        };
      },
      async deleteAuthUser() {
        deleteCallsA += 1;
        return { error: null };
      },
    },
  });

  assert.equal(retryConfirmed.ok, true);
  assert.equal(payloadsA.length, 2);
  assert.deepEqual(payloadsA[0], payloadsA[1]);
  assert.equal(deleteCallsA, 0);
  assertNoSensitiveLeaks(retryConfirmed);

  // Case B: Both attempts fail or remain uncertain -> reconciliationRequired, zero Auth deletions
  let deleteCallsB = 0;
  let attemptsB = 0;
  const bothUncertain = await createTeamAccountWithDeps({
    operator: VERIFIED_OPERATOR,
    rawContingentCode: "SJCC-01",
    rawPassword: secretPass,
    rawConfirmPassword: secretPass,
    deps: {
      generateUuid: () => TEAM_ACCOUNT_ID,
      async preflightCreateTeamAccount() {
        return { contingent, error: null };
      },
      async createAuthUser() {
        return { authUserId: AUTH_USER_ID, error: null };
      },
      async insertTeamAccountRecord() {
        attemptsB += 1;
        return {
          created: null,
          error: `DB connection lost for ${buildTeamSyntheticEmail(TEAM_ACCOUNT_ID)} (${AUTH_USER_ID})`,
        };
      },
      async deleteAuthUser() {
        deleteCallsB += 1;
        return { error: null };
      },
    },
  });

  assert.equal(bothUncertain.ok, false);
  if (!bothUncertain.ok) {
    assert.equal(bothUncertain.reconciliationRequired, true);
    assert.match(bothUncertain.error, /reconcile/i);
  }
  assert.equal(attemptsB, 2);
  assert.equal(deleteCallsB, 0);
  assertNoSensitiveLeaks(bothUncertain);

  // Case C: Retry returns mismatched identifiers -> reconciliationRequired, zero Auth deletions
  let deleteCallsC = 0;
  let attemptsC = 0;
  const mismatchedRetry = await createTeamAccountWithDeps({
    operator: VERIFIED_OPERATOR,
    rawContingentCode: "SJCC-01",
    rawPassword: secretPass,
    rawConfirmPassword: secretPass,
    deps: {
      generateUuid: () => TEAM_ACCOUNT_ID,
      async preflightCreateTeamAccount() {
        return { contingent, error: null };
      },
      async createAuthUser() {
        return { authUserId: AUTH_USER_ID, error: null };
      },
      async insertTeamAccountRecord(payload) {
        attemptsC += 1;
        if (attemptsC === 1) {
          return { created: null, error: "Transient RPC error" };
        }
        return {
          created: {
            team_account_id: payload.teamAccountId,
            contingent_id: payload.contingentId,
            contingent_code: "SJCC-01",
            contingent_name: "SJCC Alpha",
            auth_user_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
            is_active: true,
            created_at: "2026-11-25T10:00:00Z",
          },
          error: null,
        };
      },
      async deleteAuthUser() {
        deleteCallsC += 1;
        return { error: null };
      },
    },
  });

  assert.equal(mismatchedRetry.ok, false);
  if (!mismatchedRetry.ok) {
    assert.equal(mismatchedRetry.reconciliationRequired, true);
    assert.match(mismatchedRetry.error, /mismatched/i);
  }
  assert.equal(attemptsC, 2);
  assert.equal(deleteCallsC, 0);
  assertNoSensitiveLeaks(mismatchedRetry);

  // Case D: Retry returns matching but inactive account -> never reported as active creation
  let deleteCallsD = 0;
  let attemptsD = 0;
  const inactiveRetry = await createTeamAccountWithDeps({
    operator: VERIFIED_OPERATOR,
    rawContingentCode: "SJCC-01",
    rawPassword: secretPass,
    rawConfirmPassword: secretPass,
    deps: {
      generateUuid: () => TEAM_ACCOUNT_ID,
      async preflightCreateTeamAccount() {
        return { contingent, error: null };
      },
      async createAuthUser() {
        return { authUserId: AUTH_USER_ID, error: null };
      },
      async insertTeamAccountRecord(payload) {
        attemptsD += 1;
        if (attemptsD === 1) {
          return { created: null, error: null };
        }
        return {
          created: {
            team_account_id: payload.teamAccountId,
            contingent_id: payload.contingentId,
            contingent_code: "SJCC-01",
            contingent_name: "SJCC Alpha",
            auth_user_id: payload.authUserId,
            is_active: false,
            created_at: "2026-11-25T10:00:00Z",
          },
          error: null,
        };
      },
      async deleteAuthUser() {
        deleteCallsD += 1;
        return { error: null };
      },
    },
  });

  assert.equal(inactiveRetry.ok, false);
  if (!inactiveRetry.ok) {
    assert.equal(inactiveRetry.reconciliationRequired, true);
    assert.match(inactiveRetry.error, /inactive/i);
  }
  assert.equal(attemptsD, 2);
  assert.equal(deleteCallsD, 0);
  assertNoSensitiveLeaks(inactiveRetry);
});

test("Stage 3B.3 (3) [Mocked Unit Test]: Password reset updates Auth password without changing linkage/synthetic email and audits without leaking password", async () => {
  const newPass = "RotatedTeamPass!2026#99";
  const authUpdates = [];
  const resetAudits = [];

  const resetRes = await resetTeamPasswordWithDeps({
    operator: VERIFIED_OPERATOR,
    rawContingentCode: "sjcc-01",
    rawNewPassword: newPass,
    rawConfirmPassword: newPass,
    deps: {
      async resolveActiveTeamAccount(payload) {
        assert.equal("actorUserId" in payload, false);
        return {
          account: {
            team_account_id: TEAM_ACCOUNT_ID,
            contingent_id: CONTINGENT_ID,
            contingent_code: "SJCC-01",
            contingent_name: "SJCC Alpha",
            auth_user_id: AUTH_USER_ID,
          },
          error: null,
        };
      },
      async updateAuthUserPassword(payload) {
        authUpdates.push(payload);
        return { error: null };
      },
      async recordPasswordResetAudit(audit) {
        assert.equal("actorUserId" in audit, false);
        resetAudits.push(audit);
        return { error: null };
      },
    },
  });

  assert.deepEqual(resetRes, {
    ok: true,
    contingentCode: "SJCC-01",
    contingentName: "SJCC Alpha",
    actorEmail: VERIFIED_OPERATOR.email,
  });
  assert.equal(authUpdates.length, 1);
  assert.deepEqual(authUpdates[0], {
    authUserId: AUTH_USER_ID,
    password: newPass,
  });
  assert.equal("email" in authUpdates[0], false);
  assert.equal(resetAudits.length, 1);
  assert.equal(JSON.stringify(resetAudits).includes(newPass), false);
  assert.equal(JSON.stringify(resetRes).includes(newPass), false);
  assert.equal(
    JSON.stringify(resetRes).includes(TEAM_SYNTHETIC_EMAIL_DOMAIN),
    false,
  );

  // Audit failure after Auth update reports partial failure without leaking password
  const auditFailureRes = await resetTeamPasswordWithDeps({
    operator: VERIFIED_OPERATOR,
    rawContingentCode: "SJCC-01",
    rawNewPassword: newPass,
    rawConfirmPassword: newPass,
    deps: {
      async resolveActiveTeamAccount() {
        return {
          account: {
            team_account_id: TEAM_ACCOUNT_ID,
            contingent_id: CONTINGENT_ID,
            contingent_code: "SJCC-01",
            contingent_name: "SJCC Alpha",
            auth_user_id: AUTH_USER_ID,
          },
          error: null,
        };
      },
      async updateAuthUserPassword() {
        return { error: null };
      },
      async recordPasswordResetAudit() {
        return { error: "audit RPC unavailable" };
      },
    },
  });

  assert.equal(auditFailureRes.ok, false);
  assert.equal(auditFailureRes.passwordUpdated, true);
  assert.equal(auditFailureRes.auditFailed, true);
  assert.equal(auditFailureRes.error.includes(newPass), false);
});

test("Stage 3B.3 (4) [Mocked Unit Test]: Account deactivation and reactivation satisfy migration 0009 CHECK constraints, preserve audit snapshots, and never restore old sessions", async () => {
  const account = {
    id: TEAM_ACCOUNT_ID,
    contingent_id: CONTINGENT_ID,
    auth_user_id: AUTH_USER_ID,
    is_active: true,
    created_by: SUPER_ADMIN_ID,
    updated_by: SUPER_ADMIN_ID,
    deactivated_at: null,
    deactivated_by: null,
    created_at: "2026-11-24T09:00:00Z",
    updated_at: "2026-11-24T09:00:00Z",
  };
  assertTeamAccountConstraint0009(account);

  let sessions = [
    {
      id: TEAM_SESSION_ROW_1,
      team_account_id: TEAM_ACCOUNT_ID,
      contingent_id: CONTINGENT_ID,
      supabase_session_id: AUTH_SESSION_1,
      created_at: "2026-11-24T10:00:00Z",
      last_seen_at: "2026-11-24T11:00:00Z",
      revoked_at: null,
      revoked_reason: null,
      revoked_by: null,
    },
    {
      id: TEAM_SESSION_ROW_2,
      team_account_id: TEAM_ACCOUNT_ID,
      contingent_id: CONTINGENT_ID,
      supabase_session_id: AUTH_SESSION_2,
      created_at: "2026-11-24T10:15:00Z",
      last_seen_at: "2026-11-24T11:10:00Z",
      revoked_at: null,
      revoked_reason: null,
      revoked_by: null,
    },
  ];
  const authSessions = [
    { id: AUTH_SESSION_1, user_id: AUTH_USER_ID, not_after: "2026-11-26T00:00:00Z" },
    { id: AUTH_SESSION_2, user_id: AUTH_USER_ID, not_after: "2026-11-26T00:00:00Z" },
    { id: AUTH_SESSION_3, user_id: AUTH_USER_ID, not_after: "2026-11-26T00:00:00Z" },
  ];
  const auditLogs = [];

  // Deactivate
  const deactivateCli = await setTeamAccountActiveWithDeps({
    operator: VERIFIED_OPERATOR,
    rawContingentCode: "SJCC-01",
    nextIsActive: false,
    deps: {
      async setTeamAccountActiveRpc(payload) {
        assert.equal("actorUserId" in payload, false);
        assert.equal(payload.nextIsActive, false);
        const before = { ...account };
        const res = evaluateDeactivateTeamAccount({
          account,
          sessions,
          deactivatedByProfileId: VERIFIED_OPERATOR.id,
          nowIso: "2026-11-25T10:00:00Z",
        });
        sessions = res.sessions;
        Object.assign(account, res.account);
        assertTeamAccountConstraint0009(account);

        auditLogs.push({
          action: "team_account.deactivated",
          actor_user_id: VERIFIED_OPERATOR.id,
          before_data: {
            is_active: before.is_active,
            deactivated_at: before.deactivated_at,
            deactivated_by: before.deactivated_by,
            updated_by: before.updated_by,
          },
          after_data: {
            is_active: account.is_active,
            deactivated_at: account.deactivated_at,
            deactivated_by: account.deactivated_by,
            updated_by: account.updated_by,
          },
        });

        return {
          result: {
            operation: "deactivated",
            contingent_code: payload.contingentCode,
            contingent_is_active: true,
            is_active: account.is_active,
            revoked_session_count: res.revokedCount,
          },
          error: null,
        };
      },
    },
  });

  assert.equal(deactivateCli.ok, true);
  if (deactivateCli.ok) {
    assert.equal(deactivateCli.revokedSessionCount, 2);
  }
  assert.equal(account.is_active, false);
  assert.equal(account.deactivated_at, "2026-11-25T10:00:00Z");
  assert.equal(account.deactivated_by, SUPER_ADMIN_ID);
  assert.equal(sessions[0].revoked_reason, "account_deactivated");
  assert.equal(sessions[1].revoked_reason, "account_deactivated");

  // Reactivate under migration 0009 constraints: deactivated_at & deactivated_by MUST be NULL,
  // while audit_logs captures exact prior values in before_data + metadata and NULL in after_data.
  const reactivateCli = await setTeamAccountActiveWithDeps({
    operator: VERIFIED_OPERATOR,
    rawContingentCode: "SJCC-01",
    nextIsActive: true,
    deps: {
      async setTeamAccountActiveRpc(payload) {
        assert.equal("actorUserId" in payload, false);
        assert.equal(payload.nextIsActive, true);
        const before = { ...account };
        const res = evaluateReactivateTeamAccount({
          account,
          sessions,
          reactivatedByProfileId: VERIFIED_OPERATOR.id,
          nowIso: "2026-11-25T10:05:00Z",
        });
        sessions = res.sessions;
        Object.assign(account, res.account);
        assertTeamAccountConstraint0009(account);

        auditLogs.push({
          action: "team_account.activated",
          actor_user_id: VERIFIED_OPERATOR.id,
          before_data: {
            is_active: before.is_active,
            deactivated_at: before.deactivated_at,
            deactivated_by: before.deactivated_by,
            updated_by: before.updated_by,
          },
          after_data: {
            is_active: account.is_active,
            deactivated_at: account.deactivated_at,
            deactivated_by: account.deactivated_by,
            updated_by: account.updated_by,
          },
          metadata: {
            prior_deactivated_at: before.deactivated_at,
            prior_deactivated_by: before.deactivated_by,
            restored_sessions: 0,
          },
        });

        return {
          result: {
            operation: "activated",
            contingent_code: payload.contingentCode,
            contingent_is_active: true,
            is_active: account.is_active,
            revoked_session_count: 0,
          },
          error: null,
        };
      },
    },
  });

  assert.equal(reactivateCli.ok, true);
  assert.equal(account.is_active, true);
  assert.equal(account.deactivated_at, null);
  assert.equal(account.deactivated_by, null);

  // Audit log accurately captures prior deactivation & exact post-update NULL fields
  assert.equal(auditLogs.length, 2);
  assert.deepEqual(auditLogs[1].before_data, {
    is_active: false,
    deactivated_at: "2026-11-25T10:00:00Z",
    deactivated_by: SUPER_ADMIN_ID,
    updated_by: SUPER_ADMIN_ID,
  });
  assert.deepEqual(auditLogs[1].after_data, {
    is_active: true,
    deactivated_at: null,
    deactivated_by: null,
    updated_by: SUPER_ADMIN_ID,
  });
  assert.deepEqual(auditLogs[1].metadata, {
    prior_deactivated_at: "2026-11-25T10:00:00Z",
    prior_deactivated_by: SUPER_ADMIN_ID,
    restored_sessions: 0,
  });

  // Prior sessions remain revoked and rejected after reactivation
  assert.equal(sessions[0].revoked_reason, "account_deactivated");
  assert.ok(sessions[0].revoked_at !== null);
  const oldSessionAccess = evaluateCurrentTeamSessionAccess({
    eligibility: {
      authUserId: AUTH_USER_ID,
      jwtSessionId: AUTH_SESSION_1,
      hasOrganiserProfile: false,
      teamAccount: account,
      contingentIsActive: true,
    },
    sessions,
    authSessions,
    nowIso: "2026-11-25T10:10:00Z",
  });
  assert.deepEqual(oldSessionAccess, { isActive: false, contingentId: null });

  // Brand new session can sign in cleanly
  const newLogin = evaluateTeamSessionRegistration({
    eligibility: {
      authUserId: AUTH_USER_ID,
      jwtSessionId: AUTH_SESSION_3,
      hasOrganiserProfile: false,
      teamAccount: account,
      contingentIsActive: true,
    },
    sessions,
    authSessions,
    nowIso: "2026-11-25T10:15:00Z",
  });
  assert.equal(newLogin.ok, true);
  if (newLogin.ok) {
    assert.equal(newLogin.activeSessionCount, 1);
  }
});

test("Stage 3B.3 (5) [Mocked Unit Test]: Inactive contingent sessions remain revoked even after the contingent is reactivated", () => {
  const account = {
    id: TEAM_ACCOUNT_ID,
    contingent_id: CONTINGENT_ID,
    auth_user_id: AUTH_USER_ID,
    is_active: true,
    created_by: SUPER_ADMIN_ID,
    updated_by: SUPER_ADMIN_ID,
    deactivated_at: null,
    deactivated_by: null,
    created_at: "2026-11-24T09:00:00Z",
    updated_at: "2026-11-24T09:00:00Z",
  };
  const initialSessions = [
    {
      id: TEAM_SESSION_ROW_1,
      team_account_id: TEAM_ACCOUNT_ID,
      contingent_id: CONTINGENT_ID,
      supabase_session_id: AUTH_SESSION_1,
      created_at: "2026-11-24T10:00:00Z",
      last_seen_at: "2026-11-24T10:30:00Z",
      revoked_at: null,
      revoked_reason: null,
      revoked_by: null,
    },
  ];
  const authSessions = [
    { id: AUTH_SESSION_1, user_id: AUTH_USER_ID, not_after: "2026-11-26T00:00:00Z" },
  ];

  const deactivated = evaluateDeactivateContingent({
    contingentId: CONTINGENT_ID,
    contingentWasActive: true,
    teamAccount: account,
    sessions: initialSessions,
    actorProfileId: SUPER_ADMIN_ID,
    nowIso: "2026-11-25T09:00:00Z",
  });
  assert.equal(deactivated.revokedCount, 1);
  assert.equal(deactivated.sessions[0].revoked_reason, "contingent_deactivated");

  const reactivated = evaluateReactivateContingent({
    sessions: deactivated.sessions,
  });
  assert.equal(reactivated.contingentIsActive, true);
  assert.equal(reactivated.sessions[0].revoked_reason, "contingent_deactivated");

  const accessAfterReactivation = evaluateCurrentTeamSessionAccess({
    eligibility: {
      authUserId: AUTH_USER_ID,
      jwtSessionId: AUTH_SESSION_1,
      hasOrganiserProfile: false,
      teamAccount: account,
      contingentIsActive: true,
    },
    sessions: reactivated.sessions,
    authSessions,
    nowIso: "2026-11-25T09:05:00Z",
  });
  assert.deepEqual(accessAfterReactivation, {
    isActive: false,
    contingentId: null,
  });

  const reRegisterOldSession = evaluateTeamSessionRegistration({
    eligibility: {
      authUserId: AUTH_USER_ID,
      jwtSessionId: AUTH_SESSION_1,
      hasOrganiserProfile: false,
      teamAccount: account,
      contingentIsActive: true,
    },
    sessions: reactivated.sessions,
    authSessions,
    nowIso: "2026-11-25T09:06:00Z",
  });
  assert.equal(reRegisterOldSession.ok, false);
  if (!reRegisterOldSession.ok) {
    assert.equal(reRegisterOldSession.reason, "session_revoked");
  }
});

test("Stage 3B.3 (6) [Mocked Unit Test]: Listing sessions strips raw supabase_session_id, auth_user_id, JWTs, and synthetic emails", async () => {
  const listRes = await listTeamSessionsWithDeps({
    operator: VERIFIED_OPERATOR,
    rawContingentCode: "SJCC-01",
    deps: {
      async listTeamSessionsRpc(payload) {
        assert.equal("actorUserId" in payload, false);
        return {
          data: {
            contingent_code: "SJCC-01",
            contingent_name: "SJCC Alpha",
            contingent_is_active: true,
            team_account_is_active: true,
            sessions: [
              {
                session_id: TEAM_SESSION_ROW_1,
                supabase_session_id: AUTH_SESSION_1,
                auth_user_id: AUTH_USER_ID,
                created_at: "2026-11-25T08:00:00Z",
                last_seen_at: "2026-11-25T09:00:00Z",
                revoked_at: null,
                revoked_reason: null,
                is_active: true,
              },
              {
                session_id: TEAM_SESSION_ROW_2,
                created_at: "2026-11-24T08:00:00Z",
                last_seen_at: "2026-11-24T12:00:00Z",
                revoked_at: "2026-11-24T12:05:00Z",
                revoked_reason: "logout",
                is_active: false,
              },
            ],
          },
          error: null,
        };
      },
    },
  });

  assert.equal(listRes.ok, true);
  if (listRes.ok) {
    assert.equal(listRes.sessions.length, 2);
    assert.equal(listRes.sessions[0].sessionId, TEAM_SESSION_ROW_1);
    assert.equal(listRes.sessions[1].revokedReason, "logout");
  }

  const serialized = JSON.stringify(listRes);
  assert.equal(serialized.includes(AUTH_SESSION_1), false);
  assert.equal(serialized.includes(AUTH_USER_ID), false);
  assert.equal(serialized.includes("supabase_session_id"), false);
  assert.equal(serialized.includes(TEAM_SYNTHETIC_EMAIL_DOMAIN), false);
});

test("Stage 3B.3 (7) [Mocked Unit Test]: Single and bulk session revocation preserve history and handle already-revoked / repeated revocations idempotently", async () => {
  const revokedSet = new Set();

  const singleDeps = {
    async revokeTeamSessionRpc(payload) {
      assert.equal("actorUserId" in payload, false);
      if (revokedSet.has(payload.teamSessionId)) {
        return {
          data: {
            operation: "already_revoked",
            revoked: false,
            session_id: payload.teamSessionId,
            contingent_code: payload.contingentCode,
            revoked_at: "2026-11-25T10:00:00Z",
            revoked_reason: "organiser_revoked",
          },
          error: null,
        };
      }
      revokedSet.add(payload.teamSessionId);
      return {
        data: {
          operation: "revoked",
          revoked: true,
          session_id: payload.teamSessionId,
          contingent_code: payload.contingentCode,
          revoked_at: "2026-11-25T10:00:00Z",
          revoked_reason: "organiser_revoked",
        },
        error: null,
      };
    },
  };

  const firstSingle = await revokeTeamSessionWithDeps({
    operator: VERIFIED_OPERATOR,
    rawContingentCode: "SJCC-01",
    rawSessionId: TEAM_SESSION_ROW_1,
    deps: singleDeps,
  });
  assert.equal(firstSingle.ok, true);
  if (firstSingle.ok) {
    assert.equal(firstSingle.operation, "revoked");
    assert.equal(firstSingle.revoked, true);
    assert.equal(firstSingle.revokedReason, "organiser_revoked");
  }

  const repeatSingle = await revokeTeamSessionWithDeps({
    operator: VERIFIED_OPERATOR,
    rawContingentCode: "SJCC-01",
    rawSessionId: TEAM_SESSION_ROW_1,
    deps: singleDeps,
  });
  assert.equal(repeatSingle.ok, true);
  if (repeatSingle.ok) {
    assert.equal(repeatSingle.operation, "already_revoked");
    assert.equal(repeatSingle.revoked, false);
  }

  let remaining = [TEAM_SESSION_ROW_2];
  const bulkDeps = {
    async revokeAllTeamSessionsRpc(payload) {
      assert.equal("actorUserId" in payload, false);
      if (remaining.length === 0) {
        return {
          data: {
            operation: "none_active",
            revoked_count: 0,
            revoked_session_ids: [],
            contingent_code: payload.contingentCode,
          },
          error: null,
        };
      }
      const ids = [...remaining];
      remaining = [];
      return {
        data: {
          operation: "revoked_all",
          revoked_count: ids.length,
          revoked_session_ids: ids,
          contingent_code: payload.contingentCode,
        },
        error: null,
      };
    },
  };

  const bulkFirst = await revokeAllTeamSessionsWithDeps({
    operator: VERIFIED_OPERATOR,
    rawContingentCode: "SJCC-01",
    deps: bulkDeps,
  });
  assert.equal(bulkFirst.ok, true);
  if (bulkFirst.ok) {
    assert.equal(bulkFirst.operation, "revoked_all");
    assert.equal(bulkFirst.revokedCount, 1);
  }

  const bulkRepeat = await revokeAllTeamSessionsWithDeps({
    operator: VERIFIED_OPERATOR,
    rawContingentCode: "SJCC-01",
    deps: bulkDeps,
  });
  assert.equal(bulkRepeat.ok, true);
  if (bulkRepeat.ok) {
    assert.equal(bulkRepeat.operation, "none_active");
    assert.equal(bulkRepeat.revokedCount, 0);
  }
});

test("Stage 3B.3 (8) [Mocked Unit Test]: Operator authentication verifies real Super Admin Auth credentials, cleans up denied sessions, limits service_role scope, and rejects CLI secret flags", async () => {
  // Invalid password / failed Supabase Auth sign-in
  const badAuth = await authenticateSuperAdminOperatorWithDeps({
    rawOperatorEmail: "admin@sjcc.edu.in",
    rawOperatorPassword: "wrong-password",
    deps: {
      async signInWithPassword() {
        return {
          userId: null,
          email: null,
          error: "Invalid login credentials",
        };
      },
      async getOwnProfile() {
        throw new Error("Should not query profile after Auth failure");
      },
      async signOutLocal() {
        return { error: null };
      },
    },
  });
  assert.equal(badAuth.ok, false);
  assert.match(badAuth.error, /authentication failed/i);

  // Event Coordinator is signed out locally and denied
  let coordSignedOut = false;
  const coordAuth = await authenticateSuperAdminOperatorWithDeps({
    rawOperatorEmail: "coord@sjcc.edu.in",
    rawOperatorPassword: "CoordPassword!2026",
    deps: {
      async signInWithPassword() {
        return { userId: COORDINATOR_ID, email: "coord@sjcc.edu.in", error: null };
      },
      async getOwnProfile() {
        return {
          profile: {
            id: COORDINATOR_ID,
            email: "coord@sjcc.edu.in",
            role: "event_coordinator",
            is_active: true,
          },
          error: null,
        };
      },
      async signOutLocal() {
        coordSignedOut = true;
        return { error: null };
      },
    },
  });
  assert.equal(coordAuth.ok, false);
  assert.equal(coordSignedOut, true);
  assert.match(coordAuth.error, /Event Coordinators cannot/i);

  // Inactive Super Admin is signed out locally and denied
  let inactiveSignedOut = false;
  const inactiveAuth = await authenticateSuperAdminOperatorWithDeps({
    rawOperatorEmail: "former.admin@sjcc.edu.in",
    rawOperatorPassword: "AdminPassword!2026",
    deps: {
      async signInWithPassword() {
        return {
          userId: INACTIVE_ADMIN_ID,
          email: "former.admin@sjcc.edu.in",
          error: null,
        };
      },
      async getOwnProfile() {
        return {
          profile: {
            id: INACTIVE_ADMIN_ID,
            email: "former.admin@sjcc.edu.in",
            role: "super_admin",
            is_active: false,
          },
          error: null,
        };
      },
      async signOutLocal() {
        inactiveSignedOut = true;
        return { error: null };
      },
    },
  });
  assert.equal(inactiveAuth.ok, false);
  assert.equal(inactiveSignedOut, true);
  assert.match(inactiveAuth.error, /inactive/i);

  // Team Auth account without organiser profile is signed out locally and denied
  let missingSignedOut = false;
  const teamAsOperator = await authenticateSuperAdminOperatorWithDeps({
    rawOperatorEmail: "team@example.edu",
    rawOperatorPassword: "SomePassword!2026",
    deps: {
      async signInWithPassword() {
        return { userId: AUTH_USER_ID, email: "team@example.edu", error: null };
      },
      async getOwnProfile() {
        return { profile: null, error: null };
      },
      async signOutLocal() {
        missingSignedOut = true;
        return { error: null };
      },
    },
  });
  assert.equal(teamAsOperator.ok, false);
  assert.equal(missingSignedOut, true);
  assert.match(teamAsOperator.error, /does not have an active Super Admin/i);

  // Active Super Admin authenticates cleanly
  const validAuth = await authenticateSuperAdminOperatorWithDeps({
    rawOperatorEmail: " ADMIN@SJCC.EDU.IN ",
    rawOperatorPassword: "RealSuperAdminPassword!2026",
    deps: {
      async signInWithPassword({ email }) {
        assert.equal(email, "admin@sjcc.edu.in");
        return { userId: SUPER_ADMIN_ID, email, error: null };
      },
      async getOwnProfile(userId) {
        assert.equal(userId, SUPER_ADMIN_ID);
        return {
          profile: {
            id: SUPER_ADMIN_ID,
            email: "admin@sjcc.edu.in",
            role: "super_admin",
            is_active: true,
          },
          error: null,
        };
      },
      async signOutLocal() {
        throw new Error("Should not sign out on valid Super Admin");
      },
    },
  });
  assert.deepEqual(validAuth, {
    ok: true,
    operator: { id: SUPER_ADMIN_ID, email: "admin@sjcc.edu.in" },
  });

  // Service-role client is ONLY allowed for Auth Admin operations (create, reset-password)
  assert.equal(commandRequiresServiceRole("create"), true);
  assert.equal(commandRequiresServiceRole("reset-password"), true);
  assert.equal(commandRequiresServiceRole("activate"), false);
  assert.equal(commandRequiresServiceRole("deactivate"), false);
  assert.equal(commandRequiresServiceRole("sessions"), false);
  assert.equal(commandRequiresServiceRole("revoke-session"), false);
  assert.equal(commandRequiresServiceRole("revoke-all-sessions"), false);

  // Passwords passed via CLI flags are blocked before execution
  for (const forbidden of [
    ["create", "SJCC-01", "--password", "Secret12345!"],
    ["create", "SJCC-01", "-p", "Secret12345!"],
    ["reset-password", "SJCC-01", "--new-password=Secret12345!"],
  ]) {
    const parsed = parseTeamAdminCliArgs(forbidden);
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /Do not pass passwords/i);
  }

  // Secret redaction helper scrubs synthetic emails and JWTs
  const scrubbed = sanitizeSecretOutput(
    `Err for team-${TEAM_ACCOUNT_ID}@team.virtuoso.invalid with eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig`,
  );
  assert.equal(scrubbed.includes(TEAM_SYNTHETIC_EMAIL_DOMAIN), false);
  assert.equal(scrubbed.includes("eyJhbGci"), false);

  // Existing organiser/team separation remains intact
  assert.deepEqual(
    evaluateOrganiserAccess({
      authUserId: AUTH_USER_ID,
      profile: null,
      allowedRoles: ALL_ORGANISER_ROLES,
    }),
    { ok: false, reason: "missing_profile" },
  );
});

test("Stage 3B.3 (9) [Executed CLI Test]: Local CLI prints help safely and rejects password arguments without touching Supabase", () => {
  const helpOut = execFileSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "./tests/ts-alias-loader.mjs",
      "scripts/team-account-cli.mjs",
      "help",
    ],
    { cwd: ROOT_DIR, encoding: "utf8" },
  );
  assert.match(helpOut, /Team Account Administration CLI/i);
  assert.match(helpOut, /Authenticates the human operator/i);
  assert.equal(helpOut.includes(TEAM_SYNTHETIC_EMAIL_DOMAIN), false);

  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          "./tests/ts-alias-loader.mjs",
          "scripts/team-account-cli.mjs",
          "create",
          "SJCC-01",
          "--password=DoNotAllowThis",
        ],
        { cwd: ROOT_DIR, encoding: "utf8", stdio: "pipe" },
      ),
    (err) => {
      assert.match(String(err.stderr), /Do not pass passwords/i);
      return true;
    },
  );
});

// ============================================================================
// STATIC STRUCTURAL CHECKS (Migration 0010 SQL syntax, constraints, auth, RLS)
// ============================================================================

test("Stage 3B.3 (10) [Static Structural Check]: Migration 0010 uses valid pg_catalog.btrim, satisfies 0009 reactivation constraints, binds attribution to auth.uid(), revokes service_role/anon, and protects client isolation", () => {
  const migrationSql = fs.readFileSync(
    path.join(
      ROOT_DIR,
      "supabase/migrations/202611250010_stage3b3_team_account_operations.sql",
    ),
    "utf8",
  );

  // No nonexistent pg_catalog.trim(...) or deprecated auth.role() or caller-supplied p_actor_user_id
  assert.equal(/\bpg_catalog\.trim\s*\(/i.test(migrationSql), false);
  assert.equal(/\bauth\.role\s*\(/i.test(migrationSql), false);
  assert.equal(/\bp_actor_user_id\b/i.test(migrationSql), false);
  assert.match(migrationSql, /\bpg_catalog\.btrim\s*\(/i);

  // Every pg_catalog.<fn> referenced in migration 0010 must be a real built-in PostgreSQL function
  const allowedPgCatalogFns = new Set([
    "btrim",
    "upper",
    "lower",
    "char_length",
    "clock_timestamp",
    "pg_advisory_xact_lock",
    "hashtext",
    "count",
    "array_agg",
    "jsonb_build_object",
    "jsonb_agg",
    "to_jsonb",
  ]);
  const foundPgCatalogFns = [
    ...migrationSql.matchAll(/pg_catalog\.([a-z0-9_]+)\s*\(/gi),
  ].map((m) => m[1].toLowerCase());
  assert.ok(foundPgCatalogFns.length > 0);
  for (const fn of foundPgCatalogFns) {
    assert.ok(
      allowedPgCatalogFns.has(fn),
      `Unexpected pg_catalog function reference: pg_catalog.${fn}`,
    );
  }

  // Verify balanced $$ dollar-quoted PL/pgSQL blocks
  const dollarDelimCount = (migrationSql.match(/\$\$/g) ?? []).length;
  assert.equal(
    dollarDelimCount % 2,
    0,
    "Every CREATE FUNCTION $$ block must be properly closed",
  );

  // Helper must verify auth.uid() and is_active_super_admin() with zero caller parameters
  assert.match(
    migrationSql,
    /CREATE OR REPLACE FUNCTION public\.assert_team_admin_actor\(\)/i,
  );
  assert.match(
    migrationSql,
    /REVOKE ALL ON FUNCTION public\.assert_team_admin_actor\(\) FROM PUBLIC, anon, authenticated, service_role;/i,
  );
  assert.match(migrationSql, /v_uid := auth\.uid\(\);/i);
  assert.match(migrationSql, /public\.is_active_super_admin\(\)/i);

  const expectedPublicRpcs = [
    ["admin_preflight_team_account_creation", "text"],
    ["admin_create_team_account", "uuid, uuid, uuid"],
    ["admin_resolve_active_team_account", "text"],
    ["admin_record_team_password_reset", "text, uuid"],
    ["admin_set_team_account_active", "text, boolean"],
    ["admin_list_team_sessions", "text"],
    ["admin_revoke_team_session", "text, uuid"],
    ["admin_revoke_all_team_sessions", "text"],
  ];

  for (const [fnName, sig] of expectedPublicRpcs) {
    assert.match(
      migrationSql,
      new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fnName}\\(`, "i"),
      `Migration 0010 must define ${fnName}`,
    );
    assert.match(
      migrationSql,
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${fnName}\\(${sig}\\) FROM PUBLIC, anon, authenticated, service_role;`,
        "i",
      ),
      `Migration 0010 must revoke ${fnName} from PUBLIC, anon, authenticated, and service_role`,
    );
    assert.match(
      migrationSql,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${fnName}\\(${sig}\\) TO authenticated;`,
        "i",
      ),
      `Migration 0010 must grant ${fnName} only to authenticated JWT callers`,
    );
  }

  assert.equal(
    /GRANT EXECUTE ON FUNCTION .* TO (anon|PUBLIC|service_role)/i.test(
      migrationSql,
    ),
    false,
  );
  assert.match(
    migrationSql,
    /SET search_path = pg_catalog, public, auth, pg_temp/i,
  );

  // admin_create_team_account must lock contingent FOR UPDATE, validate synthetic email,
  // return matching existing account idempotently without a second audit row, reject conflicts,
  // and return auth_user_id in JSON responses.
  const createSection = migrationSql.slice(
    migrationSql.indexOf("CREATE OR REPLACE FUNCTION public.admin_create_team_account"),
    migrationSql.indexOf("CREATE OR REPLACE FUNCTION public.admin_resolve_active_team_account"),
  );
  assert.match(
    createSection,
    /FROM public\.contingents c\s+WHERE c\.id = p_contingent_id\s+FOR UPDATE;/i,
  );
  assert.equal(/\bFOR SHARE;/i.test(createSection), false);
  assert.match(
    createSection,
    /v_existing\.id = p_team_account_id\s+AND v_existing\.auth_user_id = p_auth_user_id/i,
  );
  assert.match(
    createSection,
    /RAISE EXCEPTION 'A team account already exists for contingent "%"'/i,
  );
  assert.match(createSection, /'auth_user_id', v_existing\.auth_user_id/);
  assert.match(createSection, /'auth_user_id', v_inserted\.auth_user_id/);
  assert.equal(
    createSection.indexOf("RETURN pg_catalog.jsonb_build_object(\n        'team_account_id', v_existing.id") <
      createSection.indexOf("INSERT INTO public.audit_logs"),
    true,
    "Idempotent existing-account return must happen before inserting an audit_logs row",
  );

  // Reactivation must explicitly clear deactivated_at and deactivated_by to satisfy 0009 CHECK constraint,
  // audit actual v_updated values, and preserve prior_deactivated_* metadata.
  const setActiveSection = migrationSql.slice(
    migrationSql.indexOf("CREATE OR REPLACE FUNCTION public.admin_set_team_account_active"),
    migrationSql.indexOf("CREATE OR REPLACE FUNCTION public.admin_list_team_sessions"),
  );
  assert.match(
    setActiveSection,
    /is_active = true,\s*deactivated_at = NULL,\s*deactivated_by = NULL,\s*updated_by = v_actor\.actor_id/i,
  );
  assert.match(setActiveSection, /'deactivated_by', v_updated\.deactivated_by/);
  assert.match(setActiveSection, /'prior_deactivated_at', v_team\.deactivated_at/);
  assert.match(setActiveSection, /'prior_deactivated_by', v_team\.deactivated_by/);

  // Audit logs for every admin mutation
  for (const auditAction of [
    "team_account.created",
    "team_account.password_reset",
    "team_account.deactivated",
    "team_account.activated",
    "team_session.revoked_by_admin",
    "team_session.all_revoked_by_admin",
  ]) {
    assert.match(
      migrationSql,
      new RegExp(`'${auditAction}'`),
      `Migration 0010 must write audit log for ${auditAction}`,
    );
  }

  // Session listing RPC must never expose supabase_session_id or auth_user_id
  const listSection = migrationSql.slice(
    migrationSql.indexOf("CREATE OR REPLACE FUNCTION public.admin_list_team_sessions"),
    migrationSql.indexOf("CREATE OR REPLACE FUNCTION public.admin_revoke_team_session"),
  );
  assert.equal(listSection.includes("'supabase_session_id'"), false);
  assert.equal(listSection.includes("'auth_user_id'"), false);
  assert.equal(listSection.includes("team.virtuoso.invalid"), false);

  // Revocation uses organiser_revoked reason and never deletes team_sessions or team_accounts
  assert.match(migrationSql, /revoked_reason = 'organiser_revoked'/);
  assert.equal(
    /\bDELETE\s+FROM\s+public\.(team_accounts|team_sessions)\b/i.test(
      migrationSql,
    ),
    false,
  );

  // Canonical lock order preserved in admin_set_team_account_active / revoke RPCs
  assert.match(
    migrationSql,
    /FROM public\.contingents c[\s\S]*FOR SHARE;[\s\S]*FROM public\.team_accounts ta[\s\S]*FOR UPDATE;[\s\S]*pg_catalog\.pg_advisory_xact_lock\(/i,
  );

  // CLI never passes actorUserId to RPCs and only creates service_role client for create / reset-password
  const cliSource = fs.readFileSync(
    path.join(ROOT_DIR, "scripts/team-account-cli.mjs"),
    "utf8",
  );
  assert.equal(cliSource.includes("p_actor_user_id"), false);
  assert.equal(cliSource.includes("listOrganiserProfiles"), false);
  assert.match(cliSource, /signInWithPassword/);
  assert.match(cliSource, /commandRequiresServiceRole/);

  // Client components must never import team-account-admin.ts or scripts
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
      assert.equal(content.includes("team-account-admin"), false);
      assert.equal(content.includes("team-account-cli"), false);
    }
  }
});
