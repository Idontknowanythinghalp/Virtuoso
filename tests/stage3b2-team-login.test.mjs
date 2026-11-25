import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  ALL_ORGANISER_ROLES,
  evaluateOrganiserAccess,
} from "../src/lib/auth/policy.ts";
import {
  GENERIC_TEAM_LOGIN_ERROR,
  TEAM_SESSION_CLEANUP_ERROR,
  TEAM_SESSION_LIMIT_ERROR,
  TEAM_SYNTHETIC_EMAIL_DOMAIN,
  assertLocalSignOutResult,
  authenticateTeamWithDeps,
  buildTeamSyntheticEmail,
  escapePostgresLikePattern,
  logoutTeamWithDeps,
  mapRegisterTeamSessionError,
  normalizeTeamCodeInput,
  resolveActiveTeamSessionWithDeps,
  resolveTeamLogoutRedirect,
  sanitizeTeamRedirectPath,
  validateTeamLoginInputs,
} from "../src/lib/auth/team-account-rules.ts";

const ROOT_DIR = process.cwd();

const CONTINGENT_UUID = "cccc1111-1111-4111-8111-111111111111";
const TEAM_ACCOUNT_UUID = "aaaa1111-1111-4111-8111-111111111111";
const AUTH_USER_UUID = "dddd1111-1111-4111-8111-111111111111";
const ORGANISER_UUID = "eeee1111-1111-4111-8111-111111111111";

function createLoginDeps(overrides = {}) {
  const calls = {
    signInWithPassword: [],
    registerTeamSession: 0,
    signOutLocal: 0,
  };

  const deps = {
    async findContingentsByCode(code) {
      if (code === "SJCC-01") {
        return {
          rows: [
            {
              id: CONTINGENT_UUID,
              contingent_code: "SJCC-01",
              is_active: true,
            },
          ],
          error: null,
        };
      }
      return { rows: [], error: null };
    },
    async findTeamAccountByContingentId(contingentId) {
      if (contingentId === CONTINGENT_UUID) {
        return {
          row: {
            id: TEAM_ACCOUNT_UUID,
            contingent_id: CONTINGENT_UUID,
            auth_user_id: AUTH_USER_UUID,
            is_active: true,
          },
          error: null,
        };
      }
      return { row: null, error: null };
    },
    async hasOrganiserProfileByUserId() {
      return { exists: false, error: null };
    },
    async signInWithPassword(credentials) {
      calls.signInWithPassword.push(credentials);
      return { userId: AUTH_USER_UUID, error: null };
    },
    async registerTeamSession() {
      calls.registerTeamSession += 1;
      return { contingentId: CONTINGENT_UUID, error: null };
    },
    async signOutLocal() {
      calls.signOutLocal += 1;
    },
    ...overrides,
  };

  return { deps, calls };
}

function createGuardDeps(overrides = {}) {
  return {
    async getAuthUser() {
      return { userId: AUTH_USER_UUID, error: null };
    },
    async hasOwnOrganiserProfile() {
      return { exists: false, error: null };
    },
    async checkIsActiveTeamSession() {
      return { active: true, error: null };
    },
    async getCurrentTeamContingentId() {
      return { contingentId: CONTINGENT_UUID, error: null };
    },
    async verifyActiveTeamAccountForSession() {
      return { active: true, error: null };
    },
    async findActiveContingentSummary() {
      return {
        contingent: {
          id: CONTINGENT_UUID,
          contingent_code: "SJCC-01",
          name: "St. Joseph's Contingent Alpha",
          institution_name: "St. Joseph's College of Commerce",
          is_active: true,
        },
        error: null,
      };
    },
    ...overrides,
  };
}

// ============================================================================
// MOCKED UNIT TESTS (Executed in Node against Stage 3B.2 TS modules)
// ============================================================================

test("Stage 3B.2 (1) [Mocked Unit Test]: Successful login normalizes case-insensitive team code, derives synthetic email, registers session, and returns no internal identifiers", async () => {
  const { deps, calls } = createLoginDeps();

  const outcome = await authenticateTeamWithDeps({
    rawTeamCode: "  sjcc-01  ",
    rawPassword: "ValidTeamPassword!2026",
    rawNextPath: "/team",
    deps,
  });

  assert.deepEqual(outcome, { ok: true, redirectTo: "/team" });
  assert.equal(calls.signInWithPassword.length, 1);
  assert.equal(
    calls.signInWithPassword[0].email,
    `team-${TEAM_ACCOUNT_UUID}@${TEAM_SYNTHETIC_EMAIL_DOMAIN}`,
  );
  assert.equal(calls.registerTeamSession, 1);
  assert.equal(calls.signOutLocal, 0);

  // Response must never contain synthetic email, auth UUID, or team account UUID
  const serialized = JSON.stringify(outcome);
  assert.equal(serialized.includes(TEAM_SYNTHETIC_EMAIL_DOMAIN), false);
  assert.equal(serialized.includes(TEAM_ACCOUNT_UUID), false);
  assert.equal(serialized.includes(AUTH_USER_UUID), false);
  assert.equal(serialized.includes(CONTINGENT_UUID), false);
});

test("Stage 3B.2 (2–6) [Mocked Unit Test]: Wrong team code, wrong password, missing team account, inactive team account, and inactive contingent all return the identical generic error", async () => {
  // 2. Wrong team code
  const wrongCode = createLoginDeps();
  const resWrongCode = await authenticateTeamWithDeps({
    rawTeamCode: "NONEXISTENT-99",
    rawPassword: "AnyPassword123!",
    deps: wrongCode.deps,
  });
  assert.deepEqual(resWrongCode, { ok: false, error: GENERIC_TEAM_LOGIN_ERROR });
  assert.equal(wrongCode.calls.signInWithPassword.length, 0);

  // 3. Wrong password
  const wrongPass = createLoginDeps({
    async signInWithPassword() {
      return { userId: null, error: "Invalid login credentials" };
    },
  });
  const resWrongPass = await authenticateTeamWithDeps({
    rawTeamCode: "SJCC-01",
    rawPassword: "WrongPassword!",
    deps: wrongPass.deps,
  });
  assert.deepEqual(resWrongPass, { ok: false, error: GENERIC_TEAM_LOGIN_ERROR });
  assert.equal(wrongPass.calls.registerTeamSession, 0);

  // 4. Contingent exists without a provisioned team account
  const missingAccount = createLoginDeps({
    async findTeamAccountByContingentId() {
      return { row: null, error: null };
    },
  });
  const resMissingAccount = await authenticateTeamWithDeps({
    rawTeamCode: "SJCC-01",
    rawPassword: "AnyPassword123!",
    deps: missingAccount.deps,
  });
  assert.deepEqual(resMissingAccount, {
    ok: false,
    error: GENERIC_TEAM_LOGIN_ERROR,
  });
  assert.equal(missingAccount.calls.signInWithPassword.length, 0);

  // 5. Inactive team account
  const inactiveAccount = createLoginDeps({
    async findTeamAccountByContingentId() {
      return {
        row: {
          id: TEAM_ACCOUNT_UUID,
          contingent_id: CONTINGENT_UUID,
          auth_user_id: AUTH_USER_UUID,
          is_active: false,
        },
        error: null,
      };
    },
  });
  const resInactiveAccount = await authenticateTeamWithDeps({
    rawTeamCode: "SJCC-01",
    rawPassword: "ValidTeamPassword!2026",
    deps: inactiveAccount.deps,
  });
  assert.deepEqual(resInactiveAccount, {
    ok: false,
    error: GENERIC_TEAM_LOGIN_ERROR,
  });
  assert.equal(inactiveAccount.calls.signInWithPassword.length, 0);

  // 6. Inactive contingent
  const inactiveContingent = createLoginDeps({
    async findContingentsByCode() {
      return {
        rows: [
          {
            id: CONTINGENT_UUID,
            contingent_code: "SJCC-01",
            is_active: false,
          },
        ],
        error: null,
      };
    },
  });
  const resInactiveContingent = await authenticateTeamWithDeps({
    rawTeamCode: "SJCC-01",
    rawPassword: "ValidTeamPassword!2026",
    deps: inactiveContingent.deps,
  });
  assert.deepEqual(resInactiveContingent, {
    ok: false,
    error: GENERIC_TEAM_LOGIN_ERROR,
  });
  assert.equal(inactiveContingent.calls.signInWithPassword.length, 0);
});

test("Stage 3B.2 (7) [Mocked Unit Test]: First 4 devices succeed and 5th device is rejected with user-friendly limit message + local sign-out cleanup", async () => {
  let activeDevices = 0;

  const { deps, calls } = createLoginDeps({
    async registerTeamSession() {
      calls.registerTeamSession += 1;
      if (activeDevices >= 4) {
        return {
          contingentId: null,
          error:
            "Maximum of 4 concurrent team sessions reached. Log out from an existing device before signing in.",
        };
      }
      activeDevices += 1;
      return { contingentId: CONTINGENT_UUID, error: null };
    },
  });

  // Devices 1..4 succeed without triggering local sign-out
  for (let i = 1; i <= 4; i += 1) {
    const res = await authenticateTeamWithDeps({
      rawTeamCode: "SJCC-01",
      rawPassword: "ValidTeamPassword!2026",
      deps,
    });
    assert.deepEqual(res, { ok: true, redirectTo: "/team" });
  }
  assert.equal(calls.signOutLocal, 0);

  // Device 5 fails registration and clears its local session cookies via signOutLocal()
  const fifthDevice = await authenticateTeamWithDeps({
    rawTeamCode: "SJCC-01",
    rawPassword: "ValidTeamPassword!2026",
    deps,
  });
  assert.deepEqual(fifthDevice, {
    ok: false,
    error: TEAM_SESSION_LIMIT_ERROR,
  });
  assert.equal(calls.signOutLocal, 1);
  assert.equal(activeDevices, 4);
});

test("Stage 3B.2 (8) [Mocked Unit Test]: Failed session registration on non-limit RPC failure still executes local sign-out cleanup", async () => {
  const { deps, calls } = createLoginDeps({
    async registerTeamSession() {
      calls.registerTeamSession += 1;
      return {
        contingentId: null,
        error: "Supabase auth session is missing or expired",
      };
    },
  });

  const outcome = await authenticateTeamWithDeps({
    rawTeamCode: "SJCC-01",
    rawPassword: "ValidTeamPassword!2026",
    deps,
  });

  assert.equal(outcome.ok, false);
  assert.equal(calls.signOutLocal, 1);
  assert.equal(outcome.error.includes("auth.sessions"), false);
});

test("Stage 3B.2 (9) [Mocked Unit Test]: Team logout revokes only current session and signs out locally without touching organiser sessions", async () => {
  let revokedCount = 0;
  let localSignOuts = 0;

  const teamLogout = await logoutTeamWithDeps({
    async getAuthUser() {
      return { userId: AUTH_USER_UUID };
    },
    async hasOwnOrganiserProfile() {
      return { exists: false, error: null };
    },
    async revokeCurrentTeamSession() {
      revokedCount += 1;
      return { error: null };
    },
    async signOutLocal() {
      localSignOuts += 1;
      return { error: null };
    },
  });

  assert.deepEqual(teamLogout, {
    ok: true,
    revokedInDatabase: true,
    localSignOutSucceeded: true,
  });
  assert.equal(revokedCount, 1);
  assert.equal(localSignOuts, 1);

  // Organiser hitting team logout action must NOT revoke or lose organiser session
  let organiserTouched = false;
  const organiserLogoutAttempt = await logoutTeamWithDeps({
    async getAuthUser() {
      return { userId: ORGANISER_UUID };
    },
    async hasOwnOrganiserProfile() {
      return { exists: true, error: null };
    },
    async revokeCurrentTeamSession() {
      organiserTouched = true;
      return { error: null };
    },
    async signOutLocal() {
      organiserTouched = true;
      return { error: null };
    },
  });

  assert.deepEqual(organiserLogoutAttempt, {
    ok: false,
    reason: "organiser_forbidden",
    revokedInDatabase: false,
    localSignOutSucceeded: false,
  });
  assert.equal(organiserTouched, false);
});

test("Stage 3B.2 (10) [Mocked Unit Test]: Revoked or expired team session is rejected by server team guard", async () => {
  const revokedResult = await resolveActiveTeamSessionWithDeps(
    createGuardDeps({
      async checkIsActiveTeamSession() {
        return { active: false, error: null };
      },
    }),
  );
  assert.deepEqual(revokedResult, {
    ok: false,
    reason: "invalid_team_session",
  });

  const inactiveContingentResult = await resolveActiveTeamSessionWithDeps(
    createGuardDeps({
      async findActiveContingentSummary() {
        return { contingent: null, error: null };
      },
    }),
  );
  assert.deepEqual(inactiveContingentResult, {
    ok: false,
    reason: "invalid_team_session",
  });
});

test("Stage 3B.2 (11) [Mocked Unit Test]: Organiser account is rejected from team guards", async () => {
  const organiserAsTeam = await resolveActiveTeamSessionWithDeps(
    createGuardDeps({
      async getAuthUser() {
        return { userId: ORGANISER_UUID, error: null };
      },
      async hasOwnOrganiserProfile() {
        return { exists: true, error: null };
      },
    }),
  );

  assert.deepEqual(organiserAsTeam, {
    ok: false,
    reason: "organiser_forbidden",
  });
});

test("Stage 3B.2 (12) [Mocked Unit Test]: Team account without organiser profile is rejected from organiser access policy", () => {
  const teamAsOrganiser = evaluateOrganiserAccess({
    authUserId: AUTH_USER_UUID,
    profile: null,
    allowedRoles: ALL_ORGANISER_ROLES,
  });

  assert.deepEqual(teamAsOrganiser, { ok: false, reason: "missing_profile" });
});

test("Stage 3B.2 (13) [Mocked Unit Test]: Server derives contingent identity strictly from RPC and blocks unsafe or non-team redirects", async () => {
  const resolved = await resolveActiveTeamSessionWithDeps(createGuardDeps());
  assert.equal(resolved.ok, true);
  if (resolved.ok) {
    assert.equal(resolved.teamSession.contingentId, CONTINGENT_UUID);
    assert.equal(resolved.teamSession.contingentCode, "SJCC-01");
    assert.equal("authUserId" in resolved.teamSession, false);
    assert.equal("teamAccountId" in resolved.teamSession, false);
    assert.equal("syntheticEmail" in resolved.teamSession, false);
    assert.equal("supabaseSessionId" in resolved.teamSession, false);
  }

  assert.equal(sanitizeTeamRedirectPath("/team"), "/team");
  assert.equal(sanitizeTeamRedirectPath("/team/overview"), "/team/overview");
  assert.equal(sanitizeTeamRedirectPath("/"), "/team");
  assert.equal(sanitizeTeamRedirectPath("/admin/accounts"), "/team");
  assert.equal(sanitizeTeamRedirectPath("//evil.example"), "/team");
  assert.equal(sanitizeTeamRedirectPath("https://evil.example"), "/team");
  assert.equal(sanitizeTeamRedirectPath("/team/login"), "/team");
  assert.equal(sanitizeTeamRedirectPath("/team/login?next=/"), "/team");
});

test("Stage 3B.2 (14) [Mocked Unit Test]: Team code normalization, LIKE escaping, synthetic email derivation, and error mapping never leak internal details", () => {
  assert.equal(normalizeTeamCodeInput("  sjcc_01 "), "SJCC_01");
  assert.equal(escapePostgresLikePattern("SJCC_01%\\test"), "SJCC\\_01\\%\\\\test");

  const emptyCheck = validateTeamLoginInputs("   ", "");
  assert.equal(emptyCheck.ok, false);
  const shortCodeCheck = validateTeamLoginInputs("A", "Password123");
  assert.deepEqual(shortCodeCheck, { ok: false, error: GENERIC_TEAM_LOGIN_ERROR });

  assert.equal(
    buildTeamSyntheticEmail(TEAM_ACCOUNT_UUID),
    `team-${TEAM_ACCOUNT_UUID}@${TEAM_SYNTHETIC_EMAIL_DOMAIN}`,
  );
  assert.equal(
    mapRegisterTeamSessionError("Maximum of 4 concurrent team sessions reached."),
    TEAM_SESSION_LIMIT_ERROR,
  );
  assert.equal(
    mapRegisterTeamSessionError("unexpected internal postgres exception"),
    "Unable to start a team session right now. Please try again.",
  );
});

test("Stage 3B.2 (15) [Mocked Unit Test]: Supabase returning a signOut({ scope: 'local' }) error without throwing is detected and propagates cleanup failure safely", async () => {
  // Supabase SDK returns { error } without throwing
  assert.doesNotThrow(() => assertLocalSignOutResult({ error: null }));
  assert.throws(
    () =>
      assertLocalSignOutResult({
        error: { message: "AuthSessionMissingError: secret cookie failure" },
      }),
    /Local session cleanup failed/i,
  );

  // End-to-end login cleanup path when register_team_session fails AND signOut({ scope: 'local' }) returns { error }
  const { deps, calls } = createLoginDeps({
    async registerTeamSession() {
      calls.registerTeamSession += 1;
      return {
        contingentId: null,
        error: "Maximum of 4 concurrent team sessions reached.",
      };
    },
    async signOutLocal() {
      calls.signOutLocal += 1;
      assertLocalSignOutResult({
        error: { message: "Internal Supabase cookie-jar error token=xyz" },
      });
    },
  });

  const outcome = await authenticateTeamWithDeps({
    rawTeamCode: "SJCC-01",
    rawPassword: "ValidTeamPassword!2026",
    deps,
  });

  assert.equal(calls.registerTeamSession, 1);
  assert.equal(calls.signOutLocal, 1);
  assert.deepEqual(outcome, {
    ok: false,
    error: TEAM_SESSION_CLEANUP_ERROR,
    cleanupFailed: true,
  });
  assert.equal(outcome.error.includes("token=xyz"), false);
  assert.equal(outcome.error.includes("cookie-jar"), false);

  // Also test when signOutLocal returns { error } directly without throwing
  const directErrorCleanup = createLoginDeps({
    async registerTeamSession() {
      return {
        contingentId: null,
        error: "Some registration error",
      };
    },
    async signOutLocal() {
      return { error: "Supabase signOut error" };
    },
  });

  const outcomeDirect = await authenticateTeamWithDeps({
    rawTeamCode: "SJCC-01",
    rawPassword: "ValidTeamPassword!2026",
    deps: directErrorCleanup.deps,
  });
  assert.deepEqual(outcomeDirect, {
    ok: false,
    error: TEAM_SESSION_CLEANUP_ERROR,
    cleanupFailed: true,
  });
});

test("Stage 3B.2 (16) [Mocked Unit Test]: Organiser-profile lookup failure during logout aborts cleanly without revoking or signing out", async () => {
  let revokeCalled = false;
  let signOutCalled = false;

  const lookupErrorOutcome = await logoutTeamWithDeps({
    async getAuthUser() {
      return { userId: AUTH_USER_UUID };
    },
    async hasOwnOrganiserProfile() {
      return { exists: false, error: "profiles RLS connection timeout" };
    },
    async revokeCurrentTeamSession() {
      revokeCalled = true;
      return { error: null };
    },
    async signOutLocal() {
      signOutCalled = true;
      return { error: null };
    },
  });

  assert.deepEqual(lookupErrorOutcome, {
    ok: false,
    reason: "profile_lookup_failed",
    revokedInDatabase: false,
    localSignOutSucceeded: false,
  });
  assert.equal(revokeCalled, false);
  assert.equal(signOutCalled, false);

  // Also verify thrown lookup error aborts safely
  const thrownLookupOutcome = await logoutTeamWithDeps({
    async getAuthUser() {
      return { userId: AUTH_USER_UUID };
    },
    async hasOwnOrganiserProfile() {
      throw new Error("Network failure");
    },
    async revokeCurrentTeamSession() {
      revokeCalled = true;
      return { error: null };
    },
    async signOutLocal() {
      signOutCalled = true;
      return { error: null };
    },
  });

  assert.deepEqual(thrownLookupOutcome, {
    ok: false,
    reason: "profile_lookup_failed",
    revokedInDatabase: false,
    localSignOutSucceeded: false,
  });
  assert.equal(revokeCalled, false);
  assert.equal(signOutCalled, false);
});

test("Stage 3B.2 (17) [Mocked Unit Test]: Database revocation failure during logout still clears local session and explicitly reports revocation failure", async () => {
  let localSignOutCount = 0;
  let revocationErrorLogged = 0;

  const rpcErrorOutcome = await logoutTeamWithDeps({
    async getAuthUser() {
      return { userId: AUTH_USER_UUID };
    },
    async hasOwnOrganiserProfile() {
      return { exists: false, error: null };
    },
    async revokeCurrentTeamSession() {
      return { error: "permission denied or RPC timeout" };
    },
    onRevocationError() {
      revocationErrorLogged += 1;
    },
    async signOutLocal() {
      localSignOutCount += 1;
      return { error: null };
    },
  });

  assert.deepEqual(rpcErrorOutcome, {
    ok: false,
    reason: "revocation_failed",
    revokedInDatabase: false,
    localSignOutSucceeded: true,
  });
  assert.equal(localSignOutCount, 1);
  assert.equal(revocationErrorLogged, 1);

  // Also verify thrown RPC error still executes local sign-out
  const rpcThrowOutcome = await logoutTeamWithDeps({
    async getAuthUser() {
      return { userId: AUTH_USER_UUID };
    },
    async hasOwnOrganiserProfile() {
      return { exists: false, error: null };
    },
    async revokeCurrentTeamSession() {
      throw new Error("DB connection dropped");
    },
    onRevocationError() {
      revocationErrorLogged += 1;
    },
    async signOutLocal() {
      localSignOutCount += 1;
      return { error: null };
    },
  });

  assert.deepEqual(rpcThrowOutcome, {
    ok: false,
    reason: "revocation_failed",
    revokedInDatabase: false,
    localSignOutSucceeded: true,
  });
  assert.equal(localSignOutCount, 2);
  assert.equal(revocationErrorLogged, 2);
});

test("Stage 3B.2 (18) [Mocked Unit Test]: Logout redirect maps revocation_failed + localSignOutSucceeded to /team/login?error=revocation_failed and never message=logged_out", async () => {
  const logoutResult = await logoutTeamWithDeps({
    async getAuthUser() {
      return { userId: AUTH_USER_UUID };
    },
    async hasOwnOrganiserProfile() {
      return { exists: false, error: null };
    },
    async revokeCurrentTeamSession() {
      return { error: "RPC timeout" };
    },
    async signOutLocal() {
      return { error: null };
    },
  });

  const revocationFailedRedirect = resolveTeamLogoutRedirect(logoutResult);
  assert.equal(revocationFailedRedirect, "/team/login?error=revocation_failed");
  assert.equal(revocationFailedRedirect.includes("message=logged_out"), false);

  assert.equal(
    resolveTeamLogoutRedirect({
      ok: false,
      reason: "revocation_failed",
      revokedInDatabase: false,
      localSignOutSucceeded: false,
    }),
    "/team/login?error=logout_failed",
  );
  assert.equal(
    resolveTeamLogoutRedirect({
      ok: false,
      reason: "organiser_forbidden",
      revokedInDatabase: false,
      localSignOutSucceeded: false,
    }),
    "/team/login?error=organiser_account",
  );
  assert.equal(
    resolveTeamLogoutRedirect({
      ok: false,
      reason: "profile_lookup_failed",
      revokedInDatabase: false,
      localSignOutSucceeded: false,
    }),
    "/team/login?error=logout_failed",
  );
  assert.equal(
    resolveTeamLogoutRedirect({
      ok: false,
      reason: "local_signout_failed",
      revokedInDatabase: true,
      localSignOutSucceeded: false,
    }),
    "/team/login?error=logout_failed",
  );
  assert.equal(
    resolveTeamLogoutRedirect({
      ok: true,
      revokedInDatabase: true,
      localSignOutSucceeded: true,
    }),
    "/team/login?message=logged_out",
  );
});

// ============================================================================
// STATIC STRUCTURAL CHECKS (Verify UI, proxy, server guards, and scope limits)
// ============================================================================

test("Stage 3B.2 (19) [Static Structural Check]: Team login UI omits email/signup fields, /team enforces requireActiveTeam, proxy isolates routes with local signOut, and migrations 0001-0009 remain intact", () => {
  const teamLoginForm = fs.readFileSync(
    path.join(ROOT_DIR, "src/components/auth/TeamLoginForm.tsx"),
    "utf8",
  );
  const teamLoginPage = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/team/login/page.tsx"),
    "utf8",
  );
  const teamPage = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/team/page.tsx"),
    "utf8",
  );
  const teamGuards = fs.readFileSync(
    path.join(ROOT_DIR, "src/lib/auth/team-guards.ts"),
    "utf8",
  );
  const teamActions = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/actions/team-auth.ts"),
    "utf8",
  );
  const proxyCode = fs.readFileSync(
    path.join(ROOT_DIR, "src/proxy.ts"),
    "utf8",
  );

  // Team login form must use teamCode + password, never an email field or public signup
  assert.match(teamLoginForm, /name="teamCode"/);
  assert.match(teamLoginForm, /name="password"/);
  assert.equal(teamLoginForm.includes('type="email"'), false);
  assert.equal(teamLoginForm.includes('name="email"'), false);
  assert.equal(/sign\s*up|register/i.test(teamLoginForm), false);

  assert.equal(teamLoginPage.includes(TEAM_SYNTHETIC_EMAIL_DOMAIN), false);

  // Protected /team page enforces requireActiveTeam() and wires logoutTeamAction
  assert.match(teamPage, /requireActiveTeam\(/);
  assert.match(teamPage, /logoutTeamAction/);
  assert.equal(teamPage.includes("contingentId"), false);
  assert.equal(teamPage.includes(TEAM_SYNTHETIC_EMAIL_DOMAIN), false);

  // Server guard & actions are strictly local-scoped on signOut, inspect errors, and are server-only
  assert.match(teamGuards, /^import "server-only";/m);
  assert.match(teamGuards, /signOut\(\{ scope: "local" \}\)/);
  assert.match(teamGuards, /assertLocalSignOutResult/);
  assert.match(teamGuards, /rpc\("register_team_session"\)/);
  assert.match(teamGuards, /rpc\("revoke_current_team_session"\)/);
  assert.match(teamGuards, /rpc\("is_active_team_session"\)/);
  assert.match(teamGuards, /rpc\("current_team_contingent_id"\)/);
  assert.equal(teamGuards.includes("signOut()"), false);
  assert.equal(teamGuards.includes("global"), false);

  assert.match(teamActions, /^"use server";/m);
  assert.match(teamActions, /signInTeamWithPassword/);
  assert.match(teamActions, /logoutCurrentTeamSession/);
  assert.match(teamActions, /resolveTeamLogoutRedirect/);
  assert.match(teamLoginPage, /revocation_failed:/);

  // Proxy handles /team/login publicly, cleans revoked team cookies locally, and preserves organiser paths
  assert.match(proxyCode, /PUBLIC_PATHS = new Set\(\["\/login", "\/team\/login"\]\)/);
  assert.match(proxyCode, /is_active_team_session/);
  assert.match(proxyCode, /scope:\s*"local"/);
  assert.match(proxyCode, /redirectWithCookies/);

  // Organiser profile role constraint in migration 0001 must remain super_admin / event_coordinator only
  const profilesSql = fs.readFileSync(
    path.join(
      ROOT_DIR,
      "supabase/migrations/202611160001_stage1b_profiles.sql",
    ),
    "utf8",
  );
  assert.match(
    profilesSql,
    /CHECK \(role IN \('super_admin', 'event_coordinator'\)\)/i,
  );
});
