import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { AuthSessionMissingError } from "@supabase/supabase-js";
import {
  GENERIC_TEAM_LOGIN_ERROR,
  ORGANISER_TEAM_LOGIN_COLLISION_ERROR,
  TEAM_UNAVAILABLE_ERROR,
  authenticateTeamWithDeps,
  buildTeamLoginRedirectPath,
  isMissingAuthSessionError,
  normalizeTeamCodeInput,
  sanitizeTeamRedirectPath,
  validateTeamLoginInputs,
} from "../src/lib/auth/team-account-rules.ts";

const ROOT_DIR = process.cwd();

const CONTINGENT_UUID = "cccc1111-1111-4111-8111-111111111111";
const TEAM_ACCOUNT_UUID = "aaaa1111-1111-4111-8111-111111111111";
const AUTH_USER_UUID = "dddd1111-1111-4111-8111-111111111111";

function createTeamLoginDeps(overrides = {}) {
  const calls = {
    contingentLookup: 0,
    signInWithPassword: 0,
    registerTeamSession: 0,
    signOutLocal: 0,
  };

  const deps = {
    async hasCurrentOrganiserSession() {
      return { isOrganiser: false, error: null };
    },
    async findContingentsByCode(code) {
      calls.contingentLookup += 1;
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
    async findTeamAccountByContingentId() {
      return {
        row: {
          id: TEAM_ACCOUNT_UUID,
          contingent_id: CONTINGENT_UUID,
          auth_user_id: AUTH_USER_UUID,
          is_active: true,
        },
        error: null,
      };
    },
    async hasOrganiserProfileByUserId() {
      return { exists: false, error: null };
    },
    async signInWithPassword() {
      calls.signInWithPassword += 1;
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

test("Stage 4.4C (1) [Mocked Unit Test]: Authenticated organiser attempting team sign-in is blocked before contingent lookup or cookie overwrite, keeping organiser session intact", async () => {
  const { deps, calls } = createTeamLoginDeps({
    async hasCurrentOrganiserSession() {
      return { isOrganiser: true, error: null };
    },
  });

  const outcome = await authenticateTeamWithDeps({
    rawTeamCode: "SJCC-01",
    rawPassword: "ValidTeamPassword!2026",
    rawNextPath: "/team/rounds",
    deps,
  });

  assert.deepEqual(outcome, {
    ok: false,
    error: ORGANISER_TEAM_LOGIN_COLLISION_ERROR,
  });
  assert.equal(calls.contingentLookup, 0);
  assert.equal(calls.signInWithPassword, 0);
  assert.equal(calls.registerTeamSession, 0);
  assert.equal(calls.signOutLocal, 0);

  // Lookup error while checking organiser session also fails closed without overwriting cookies
  const lookupErr = createTeamLoginDeps({
    async hasCurrentOrganiserSession() {
      return { isOrganiser: false, error: "profiles check failed" };
    },
  });
  const errOutcome = await authenticateTeamWithDeps({
    rawTeamCode: "SJCC-01",
    rawPassword: "ValidTeamPassword!2026",
    deps: lookupErr.deps,
  });
  assert.deepEqual(errOutcome, { ok: false, error: TEAM_UNAVAILABLE_ERROR });
  assert.equal(lookupErr.calls.contingentLookup, 0);
  assert.equal(lookupErr.calls.signInWithPassword, 0);
  assert.equal(lookupErr.calls.signOutLocal, 0);
});

test("Stage 4.4C (1b) [Regression Test]: Supabase auth.getUser() error in organiser-session check fails closed and prevents contingent lookup, signInWithPassword, and cookie cleanup", async () => {
  const { deps, calls } = createTeamLoginDeps({
    async hasCurrentOrganiserSession() {
      return {
        isOrganiser: false,
        error: "Supabase auth.getUser() network error: connection reset",
      };
    },
  });

  const outcome = await authenticateTeamWithDeps({
    rawTeamCode: "SJCC-01",
    rawPassword: "ValidTeamPassword!2026",
    rawNextPath: "/team/rounds",
    deps,
  });

  assert.deepEqual(outcome, {
    ok: false,
    error: TEAM_UNAVAILABLE_ERROR,
  });
  assert.equal(
    calls.contingentLookup,
    0,
    "contingent lookup must not proceed on getUser error",
  );
  assert.equal(
    calls.signInWithPassword,
    0,
    "signInWithPassword must not proceed on getUser error",
  );
  assert.equal(
    calls.signOutLocal,
    0,
    "cookie cleanup must not proceed on getUser error",
  );
  assert.equal(
    calls.registerTeamSession,
    0,
    "session registration must not proceed on getUser error",
  );
});

test("Stage 4.4C (1c) [Regression Test]: Missing auth session error in hasCurrentOrganiserSession does NOT block normal team login", async () => {
  // Simulate the exact behaviour of hasCurrentOrganiserSession in team-guards.ts
  async function simulateHasCurrentOrganiserSession(mockGetUser) {
    const { data, error: userError } = await mockGetUser();
    if (userError) {
      if (isMissingAuthSessionError(userError)) {
        return { isOrganiser: false, error: null };
      }
      return { isOrganiser: false, error: userError.message };
    }
    if (!data?.user) {
      return { isOrganiser: false, error: null };
    }
    return { isOrganiser: false, error: null };
  }

  // 1. AuthSessionMissingError instance from @supabase/supabase-js
  const sessionCheckA = await simulateHasCurrentOrganiserSession(async () => ({
    data: { user: null },
    error: new AuthSessionMissingError(),
  }));
  assert.deepEqual(
    sessionCheckA,
    { isOrganiser: false, error: null },
    "AuthSessionMissingError must resolve to { isOrganiser: false, error: null }",
  );

  const { deps: depsA, calls: callsA } = createTeamLoginDeps({
    async hasCurrentOrganiserSession() {
      return sessionCheckA;
    },
  });
  const outcomeA = await authenticateTeamWithDeps({
    rawTeamCode: "SJCC-01",
    rawPassword: "ValidTeamPassword!2026",
    rawNextPath: "/team/rounds",
    deps: depsA,
  });
  assert.deepEqual(outcomeA, { ok: true, redirectTo: "/team/rounds" });
  assert.equal(callsA.contingentLookup, 1, "contingent lookup must proceed");
  assert.equal(callsA.signInWithPassword, 1, "signInWithPassword must proceed");
  assert.equal(callsA.registerTeamSession, 1, "registerTeamSession must proceed");
  assert.equal(callsA.signOutLocal, 0, "signOutLocal must not be called on success");

  // 2. Exact message: "Auth session missing!"
  const sessionCheckB = await simulateHasCurrentOrganiserSession(async () => ({
    data: { user: null },
    error: { name: "AuthSessionMissingError", message: "Auth session missing!", status: 400 },
  }));
  assert.deepEqual(sessionCheckB, { isOrganiser: false, error: null });

  // 3. Genuine network error does NOT get treated as missing session
  const networkCheck = await simulateHasCurrentOrganiserSession(async () => ({
    data: { user: null },
    error: new Error("ETIMEDOUT: Failed to reach Supabase Auth"),
  }));
  assert.equal(networkCheck.isOrganiser, false);
  assert.equal(networkCheck.error, "ETIMEDOUT: Failed to reach Supabase Auth");
});

test("Stage 4.4C (1d) [Unit Test]: isMissingAuthSessionError accurately distinguishes missing session from actual errors", () => {
  // Missing session variants
  assert.equal(isMissingAuthSessionError(new AuthSessionMissingError()), true);
  assert.equal(
    isMissingAuthSessionError({
      name: "AuthSessionMissingError",
      message: "Auth session missing!",
      status: 400,
    }),
    true,
  );
  assert.equal(
    isMissingAuthSessionError({
      code: "session_not_found",
      message: "User session was terminated",
    }),
    true,
  );
  assert.equal(
    isMissingAuthSessionError({
      code: "auth_session_missing",
      message: "No active session",
    }),
    true,
  );
  assert.equal(
    isMissingAuthSessionError({
      code: "session_missing",
      message: "Session missing",
    }),
    true,
  );
  assert.equal(
    isMissingAuthSessionError({ message: "Auth session missing!" }),
    true,
  );
  assert.equal(
    isMissingAuthSessionError({ message: "  auth session missing  " }),
    true,
  );

  // Actual auth/network/server errors must NOT be classified as missing session
  assert.equal(isMissingAuthSessionError(new Error("fetch failed")), false);
  assert.equal(
    isMissingAuthSessionError({
      name: "AuthApiError",
      message: "Database connection failed",
      status: 500,
      code: "unexpected_failure",
    }),
    false,
  );
  assert.equal(
    isMissingAuthSessionError({
      name: "AuthRetryableFetchError",
      message: "Connection timeout",
      status: 504,
    }),
    false,
  );
  assert.equal(
    isMissingAuthSessionError({
      name: "AuthApiError",
      message: "JWT expired",
      code: "bad_jwt",
      status: 401,
    }),
    false,
  );
  assert.equal(
    isMissingAuthSessionError({
      code: "PGRST001",
      message: "Postgres schema error",
    }),
    false,
  );
  assert.equal(isMissingAuthSessionError(null), false);
  assert.equal(isMissingAuthSessionError(undefined), false);
  assert.equal(isMissingAuthSessionError("Auth session missing!"), false);
  assert.equal(isMissingAuthSessionError(400), false);
});

test("Stage 4.4C (2) [Mocked Unit Test]: Team login continues working normally when no organiser session exists and restores safe destination", async () => {
  const { deps, calls } = createTeamLoginDeps();

  const successToRounds = await authenticateTeamWithDeps({
    rawTeamCode: "  sjcc-01 ",
    rawPassword: "ValidTeamPassword!2026",
    rawNextPath: "/team/rounds",
    deps,
  });

  assert.deepEqual(successToRounds, {
    ok: true,
    redirectTo: "/team/rounds",
  });
  assert.equal(calls.signInWithPassword, 1);
  assert.equal(calls.registerTeamSession, 1);

  const rejectedExternalNext = await authenticateTeamWithDeps({
    rawTeamCode: "SJCC-01",
    rawPassword: "ValidTeamPassword!2026",
    rawNextPath: "https://evil.example/team/rounds",
    deps,
  });
  assert.deepEqual(rejectedExternalNext, {
    ok: true,
    redirectTo: "/team",
  });
});

test("Stage 4.4C (3) [Mocked Unit Test]: Session-ended login redirect preserves valid internal team routes and rejects external, traversal, or non-team URLs", () => {
  assert.equal(
    buildTeamLoginRedirectPath({
      error: "session_ended",
      nextPath: "/team/rounds",
    }),
    "/team/login?error=session_ended&next=%2Fteam%2Frounds",
  );
  assert.equal(
    buildTeamLoginRedirectPath({
      error: "session_ended",
      nextPath: "/team",
    }),
    "/team/login?error=session_ended",
  );
  assert.equal(
    buildTeamLoginRedirectPath({
      nextPath: "/team/rounds",
    }),
    "/team/login?next=%2Fteam%2Frounds",
  );

  // External, protocol-relative, backslash, dot-traversal, encoded-traversal, and non-team paths must fall back to /team
  for (const unsafeCandidate of [
    "https://evil.example/steal",
    "http://evil.example/team/rounds",
    "//evil.example/team",
    "/team\\rounds",
    "/team/../admin/accounts",
    "/team/rounds/../../login",
    "/team/rounds%2F..%2Fadmin",
    "/admin/accounts",
    "/events",
    "/team-other",
    "/team/login?next=/team/rounds",
  ]) {
    assert.equal(
      sanitizeTeamRedirectPath(unsafeCandidate, "/team"),
      "/team",
      `Expected ${unsafeCandidate} to be sanitized to /team`,
    );
    assert.equal(
      buildTeamLoginRedirectPath({
        error: "session_ended",
        nextPath: unsafeCandidate,
      }),
      "/team/login?error=session_ended",
    );
  }
});

test("Stage 4.4C (4) [Mocked Unit Test]: Team-code normalization strips surrounding spaces and uppercases consistently", () => {
  assert.equal(normalizeTeamCodeInput("  sjcc-01 "), "SJCC-01");
  assert.equal(normalizeTeamCodeInput("\tsjcc_team_2\n"), "SJCC_TEAM_2");
  assert.deepEqual(validateTeamLoginInputs("  sjcc-01  ", "Secret123!"), {
    ok: true,
    teamCode: "SJCC-01",
    password: "Secret123!",
  });
  assert.deepEqual(validateTeamLoginInputs("a", "Secret123!"), {
    ok: false,
    error: GENERIC_TEAM_LOGIN_ERROR,
  });
});

test("Stage 4.4C (5) [Static Structural Check]: Proxy, team login page/form, and manual refresh button implement all Stage 4.4C corrections safely", () => {
  const proxySource = fs.readFileSync(
    path.join(ROOT_DIR, "src/proxy.ts"),
    "utf8",
  );
  const teamGuardsSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/lib/auth/team-guards.ts"),
    "utf8",
  );
  const teamLoginPageSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/team/login/page.tsx"),
    "utf8",
  );
  const teamLoginFormSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/components/auth/TeamLoginForm.tsx"),
    "utf8",
  );
  const refreshButtonSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/components/team/RefreshRoundsButton.tsx"),
    "utf8",
  );
  const roundsPageSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/team/rounds/page.tsx"),
    "utf8",
  );

  // Task 1: Organiser collision prevented across proxy, login page, and server sign-in guard
  assert.match(proxySource, /if \(pathname === "\/team\/login"\)/);
  assert.match(proxySource, /error.*organiser_account/);
  assert.match(teamLoginPageSource, /organiser_forbidden/);
  assert.match(teamLoginPageSource, /isSignedInAsOrganiser/);
  assert.match(teamLoginPageSource, /Return to Organiser CMS/);
  assert.match(teamGuardsSource, /hasCurrentOrganiserSession/);
  assert.match(teamGuardsSource, /isMissingAuthSessionError\(userError\)/);
  assert.match(
    teamGuardsSource,
    /if\s*\(\s*isMissingAuthSessionError\(userError\)\s*\)\s*\{\s*return\s*\{\s*isOrganiser:\s*false,\s*error:\s*null\s*\};/,
  );
  assert.match(
    teamGuardsSource,
    /return\s*\{\s*isOrganiser:\s*false,\s*error:\s*userError\.message\s*\};/,
  );
  assert.match(
    teamGuardsSource,
    /if\s*\(\s*!user\s*\)\s*\{\s*return\s*\{\s*isOrganiser:\s*false,\s*error:\s*null\s*\};/,
  );

  // Task 2: session_ended redirects preserve validated next destination without signing out organisers
  assert.match(proxySource, /buildTeamLoginRedirectPath\(\{\s*error:\s*"session_ended"/);
  assert.match(teamGuardsSource, /buildTeamLoginRedirectPath\(\{\s*error:\s*"session_ended"/);

  // Task 3: Show/hide password toggle + uppercase normalization in TeamLoginForm
  assert.match(teamLoginFormSource, /showPassword/);
  assert.match(teamLoginFormSource, /type=\{showPassword \? "text" : "password"\}/);
  assert.match(teamLoginFormSource, /aria-label=\{showPassword \? "Hide password" : "Show password"\}/);
  assert.match(teamLoginFormSource, /aria-pressed=\{showPassword\}/);
  assert.match(teamLoginFormSource, /normalizeTeamCodeInput/);
  assert.match(teamLoginFormSource, /onSubmit=\{handleFormSubmit\}/);
  assert.equal(teamLoginFormSource.includes("team-portal"), false);
  assert.equal(teamLoginFormSource.includes("supabase/admin"), false);

  // Task 4: Manual refresh uses Next.js router.refresh() + useTransition with zero polling/timers
  assert.match(refreshButtonSource, /^"use client";/m);
  assert.match(refreshButtonSource, /useRouter/);
  assert.match(refreshButtonSource, /useTransition/);
  assert.match(refreshButtonSource, /router\.refresh\(\)/);
  assert.match(refreshButtonSource, /disabled=\{isPending\}/);
  assert.equal(refreshButtonSource.includes("setInterval"), false);
  assert.equal(refreshButtonSource.includes("setTimeout"), false);
  assert.equal(refreshButtonSource.includes("useEffect"), false);
  assert.equal(refreshButtonSource.includes("team-portal"), false);
  assert.equal(refreshButtonSource.includes("supabase/admin"), false);
  assert.match(roundsPageSource, /<RefreshRoundsButton \/>/);
});

test("Stage 4.4C (6) [Hardened Signed URL TTL]: Signed URL TTL floors and clamps finite values between 15 and 120s, and falls back to 60s for non-finite and omitted values", () => {
  const storageSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/lib/documents/storage.ts"),
    "utf8",
  );

  // Static checks on src/lib/documents/storage.ts
  assert.match(storageSource, /clampCompetitionDocumentSignedViewTtl/);
  assert.match(storageSource, /Number\.isFinite/);
  assert.match(storageSource, /Math\.floor/);
  assert.match(storageSource, /Math\.min\(Math\.max\(/);
  assert.match(
    storageSource,
    /const clampedTtl = clampCompetitionDocumentSignedViewTtl\(\s*params\.expiresInSeconds,?\s*\);/,
  );
  assert.match(
    storageSource,
    /\.createSignedUrl\(params\.objectPath,\s*clampedTtl\)/,
  );

  // Extract and evaluate clampCompetitionDocumentSignedViewTtl body
  const bodyMatch = storageSource.match(
    /function clampCompetitionDocumentSignedViewTtl\([^)]*\)[^{]*\{([\s\S]*?)\n\}/,
  );
  assert.ok(
    bodyMatch,
    "clampCompetitionDocumentSignedViewTtl must be declared in storage.ts",
  );

  const clampFn = new Function("expiresInSeconds", bodyMatch[1]);

  // 1. Omitted / undefined defaults to 60 seconds
  assert.equal(clampFn(), 60, "omitted TTL must default to 60");
  assert.equal(clampFn(undefined), 60, "undefined TTL must default to 60");

  // 2. Non-finite values fall back to 60 seconds
  assert.equal(clampFn(NaN), 60, "NaN must fall back to 60");
  assert.equal(clampFn(Infinity), 60, "Infinity must fall back to 60");
  assert.equal(clampFn(-Infinity), 60, "-Infinity must fall back to 60");

  // 3. Finite values are floored and clamped between 15 and 120 seconds
  // Below lower bound (15)
  assert.equal(clampFn(0), 15, "0 must clamp to 15");
  assert.equal(clampFn(-10), 15, "-10 must clamp to 15");
  assert.equal(clampFn(10), 15, "10 must clamp to 15");
  assert.equal(clampFn(14.9), 15, "14.9 must floor to 14 then clamp to 15");

  // At lower bound
  assert.equal(clampFn(15), 15, "15 must return 15");
  assert.equal(clampFn(15.9), 15, "15.9 must floor to 15");

  // Within range (15 - 120)
  assert.equal(clampFn(45), 45, "45 must return 45");
  assert.equal(clampFn(45.8), 45, "45.8 must floor to 45");
  assert.equal(clampFn(60), 60, "60 must return 60");
  assert.equal(clampFn(119.99), 119, "119.99 must floor to 119");

  // At upper bound
  assert.equal(clampFn(120), 120, "120 must return 120");
  assert.equal(clampFn(120.9), 120, "120.9 must floor to 120");

  // Above upper bound (120)
  assert.equal(clampFn(121), 120, "121 must clamp to 120");
  assert.equal(clampFn(300), 120, "300 must clamp to 120");
});
