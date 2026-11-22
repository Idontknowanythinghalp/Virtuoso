import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  ALL_ORGANISER_ROLES,
  evaluateOrganiserAccess,
} from "../src/lib/auth/policy.ts";
import {
  classifyRoundReleaseLoadError,
  deriveRoundReleaseState,
  evaluateFirstReleaseEligibility,
  evaluateReopenEligibility,
  formatDurationMinutes,
  formatRemainingCountdown,
  isSessionActiveAtTime,
  MAX_ROUND_DURATION_MINUTES,
  MIN_ROUND_DURATION_MINUTES,
  validateRoundDuration,
} from "../src/lib/competition/round-release.ts";
import {
  ROUND_CREATE_STATUSES,
  ROUND_STATUSES,
  validateRoundInput,
} from "../src/lib/competition/validation.ts";

const ROOT_DIR = process.cwd();

function makeSession(overrides = {}) {
  return {
    id: "ssss1111-1111-4111-8111-111111111111",
    event_id: "11111111-1111-4111-8111-111111111111",
    round_id: "22222222-2222-4222-8222-222222222222",
    session_number: 1,
    duration_minutes: 45,
    started_at: "2026-11-22T10:00:00.000Z",
    expires_at: "2026-11-22T10:45:00.000Z",
    closed_at: null,
    close_reason: null,
    released_by: "user-1",
    closed_by: null,
    notes: null,
    created_at: "2026-11-22T10:00:00.000Z",
    updated_at: "2026-11-22T10:00:00.000Z",
    ...overrides,
  };
}

test("Stage 2C (1): validates whole-minute duration from 1 to 1,440 inclusive and integrates into round input validation", () => {
  assert.equal(MIN_ROUND_DURATION_MINUTES, 1);
  assert.equal(MAX_ROUND_DURATION_MINUTES, 1440);

  assert.deepEqual(validateRoundDuration("1", { required: true }), {
    ok: true,
    value: 1,
  });
  assert.deepEqual(validateRoundDuration("45", { required: true }), {
    ok: true,
    value: 45,
  });
  assert.deepEqual(validateRoundDuration("1440", { required: true }), {
    ok: true,
    value: 1440,
  });
  assert.deepEqual(validateRoundDuration("", { required: false }), {
    ok: true,
    value: null,
  });
  assert.deepEqual(validateRoundDuration(null, { required: false }), {
    ok: true,
    value: null,
  });

  for (const invalid of ["", "0", "-10", "1.5", "1441", "45m", "NaN"]) {
    const res = validateRoundDuration(invalid, { required: true });
    assert.equal(
      res.ok,
      false,
      `Expected required duration "${invalid}" to fail`,
    );
  }

  for (const invalidOptional of ["0", "-1", "30.5", "1441", "abc"]) {
    const res = validateRoundDuration(invalidOptional, { required: false });
    assert.equal(
      res.ok,
      false,
      `Expected optional duration "${invalidOptional}" to fail`,
    );
  }

  assert.ok(ROUND_STATUSES.includes("closed"));
  assert.deepEqual(ROUND_CREATE_STATUSES, ["draft", "ready"]);

  const roundWithDuration = validateRoundInput({
    roundNumber: "1",
    name: "Preliminary Round",
    scoringMethod: "criteria_sum",
    attributionMode: "individual_judge",
    status: "ready",
    isLocked: false,
    durationMinutes: "90",
  });
  assert.equal(roundWithDuration.ok, true);
  if (roundWithDuration.ok) {
    assert.equal(roundWithDuration.value.duration_minutes, 90);
  }

  const roundBadDuration = validateRoundInput({
    roundNumber: "1",
    name: "Preliminary Round",
    scoringMethod: "criteria_sum",
    attributionMode: "individual_judge",
    status: "ready",
    isLocked: false,
    durationMinutes: "2000",
  });
  assert.equal(roundBadDuration.ok, false);
});

test("Stage 2C (2): enforces read-time expiry at exact boundary even before DB reconciliation", () => {
  const session = makeSession();
  const startedMs = Date.parse(session.started_at);
  const expiresMs = Date.parse(session.expires_at);

  // Before start -> not active
  assert.equal(isSessionActiveAtTime(session, startedMs - 1), false);
  // At exact start -> active
  assert.equal(isSessionActiveAtTime(session, startedMs), true);
  // One millisecond before expiry -> active
  assert.equal(isSessionActiveAtTime(session, expiresMs - 1), true);
  // At exact expiry -> NOT active (immediately expired at read time)
  assert.equal(isSessionActiveAtTime(session, expiresMs), false);
  // After expiry -> NOT active
  assert.equal(isSessionActiveAtTime(session, expiresMs + 60_000), false);

  // While live (round deployed, event active, now < expires_at)
  const liveState = deriveRoundReleaseState({
    round: { status: "deployed", duration_minutes: 45, is_locked: true },
    eventStatus: "active",
    sessions: [session],
    dbNowMs: expiresMs - 15_000,
  });
  assert.equal(liveState.effectiveState, "live");
  assert.equal(liveState.isTeamVisible, true);
  assert.equal(liveState.needsReconciliation, false);
  assert.equal(liveState.remainingSeconds, 15);

  // Read-time expiry: rounds.status is still 'deployed' and session.closed_at is still NULL,
  // yet once dbNowMs reaches expires_at the round is immediately NOT visible to teams
  const readTimeExpiredState = deriveRoundReleaseState({
    round: { status: "deployed", duration_minutes: 45, is_locked: true },
    eventStatus: "active",
    sessions: [session],
    dbNowMs: expiresMs,
  });
  assert.equal(readTimeExpiredState.effectiveState, "expired");
  assert.equal(readTimeExpiredState.isTeamVisible, false);
  assert.equal(readTimeExpiredState.needsReconciliation, true);
  assert.equal(readTimeExpiredState.remainingSeconds, 0);

  // Parent event not active -> hidden from teams even if session is open
  const pausedEventState = deriveRoundReleaseState({
    round: { status: "deployed", duration_minutes: 45, is_locked: true },
    eventStatus: "completed",
    sessions: [session],
    dbNowMs: expiresMs - 15_000,
  });
  assert.equal(pausedEventState.isTeamVisible, false);

  // Manually closed session
  const closedSession = makeSession({
    closed_at: "2026-11-22T10:20:00.000Z",
    close_reason: "manual",
    closed_by: "user-1",
  });
  assert.equal(isSessionActiveAtTime(closedSession, startedMs + 60_000), false);

  const manualClosedState = deriveRoundReleaseState({
    round: { status: "closed", duration_minutes: 45, is_locked: true },
    eventStatus: "active",
    sessions: [closedSession],
    dbNowMs: startedMs + 60_000,
  });
  assert.equal(manualClosedState.effectiveState, "closed");
  assert.equal(manualClosedState.isTeamVisible, false);
  assert.equal(manualClosedState.needsReconciliation, false);
});

test("Stage 2C (3): first release requires active event, ready round status, configured duration, and no prior release history", () => {
  // Blocked when parent event is draft/completed/archived
  for (const eventStatus of ["draft", "completed", "archived"]) {
    const blocked = evaluateFirstReleaseEligibility({
      eventStatus,
      round: { status: "ready", duration_minutes: 45 },
      hasReleaseHistory: false,
    });
    assert.equal(blocked.ok, false, `Expected ${eventStatus} event to block release`);
  }

  // Blocked directly from draft (or deployed/closed/completed/archived)
  for (const roundStatus of [
    "draft",
    "deployed",
    "closed",
    "completed",
    "archived",
  ]) {
    const blocked = evaluateFirstReleaseEligibility({
      eventStatus: "active",
      round: { status: roundStatus, duration_minutes: 45 },
      hasReleaseHistory: false,
    });
    assert.equal(
      blocked.ok,
      false,
      `Expected ${roundStatus} round to block first release`,
    );
  }

  // Blocked if duration is missing
  const missingDuration = evaluateFirstReleaseEligibility({
    eventStatus: "active",
    round: { status: "ready", duration_minutes: null },
    hasReleaseHistory: false,
  });
  assert.equal(missingDuration.ok, false);

  // Blocked if release history already exists (must use Reopen)
  const hasHistory = evaluateFirstReleaseEligibility({
    eventStatus: "active",
    round: { status: "ready", duration_minutes: 45 },
    hasReleaseHistory: true,
  });
  assert.equal(hasHistory.ok, false);

  // Allowed when event=active, round=ready, duration configured, and no prior sessions
  const eligible = evaluateFirstReleaseEligibility({
    eventStatus: "active",
    round: { status: "ready", duration_minutes: 45 },
    hasReleaseHistory: false,
  });
  assert.deepEqual(eligible, { ok: true, value: { durationMinutes: 45 } });
});

test("Stage 2C (4): reopen is a separate confirmed operation preserving or overriding duration and keeping history intact", () => {
  // Missing confirmation rejected
  const unconfirmed = evaluateReopenEligibility({
    eventStatus: "active",
    round: { status: "closed", duration_minutes: 45 },
    effectiveState: "closed",
    hasReleaseHistory: true,
    confirmReopen: false,
  });
  assert.equal(unconfirmed.ok, false);

  // Blocked while live
  const stillLive = evaluateReopenEligibility({
    eventStatus: "active",
    round: { status: "deployed", duration_minutes: 45 },
    effectiveState: "live",
    hasReleaseHistory: true,
    confirmReopen: true,
  });
  assert.equal(stillLive.ok, false);

  // Blocked for completed / archived / never-released draft or ready
  for (const [roundStatus, effectiveState, hasHistory] of [
    ["completed", "completed", true],
    ["archived", "archived", true],
    ["draft", "draft", false],
    ["ready", "ready", false],
  ]) {
    const blocked = evaluateReopenEligibility({
      eventStatus: "active",
      round: { status: roundStatus, duration_minutes: 45 },
      effectiveState,
      hasReleaseHistory: hasHistory,
      confirmReopen: true,
    });
    assert.equal(blocked.ok, false);
  }

  // Blocked when parent event is not active
  const inactiveEvent = evaluateReopenEligibility({
    eventStatus: "draft",
    round: { status: "closed", duration_minutes: 45 },
    effectiveState: "closed",
    hasReleaseHistory: true,
    confirmReopen: true,
  });
  assert.equal(inactiveEvent.ok, false);

  // Allowed for closed session preserving existing duration
  const reopenPreserved = evaluateReopenEligibility({
    eventStatus: "active",
    round: { status: "closed", duration_minutes: 45 },
    effectiveState: "closed",
    hasReleaseHistory: true,
    confirmReopen: true,
  });
  assert.deepEqual(reopenPreserved, {
    ok: true,
    value: { durationMinutes: 45 },
  });

  // Allowed for read-time expired session with explicit new duration
  const reopenOverride = evaluateReopenEligibility({
    eventStatus: "active",
    round: { status: "deployed", duration_minutes: 45 },
    effectiveState: "expired",
    hasReleaseHistory: true,
    confirmReopen: true,
    overrideDurationMinutes: "30",
  });
  assert.deepEqual(reopenOverride, {
    ok: true,
    value: { durationMinutes: 30 },
  });
});

test("Stage 2C (5): formatting and load-error helpers handle edge cases cleanly", () => {
  assert.equal(formatRemainingCountdown(0), "00:00:00");
  assert.equal(formatRemainingCountdown(-5), "00:00:00");
  assert.equal(formatRemainingCountdown(3661), "01:01:01");
  assert.equal(formatDurationMinutes(null), "Not configured");
  assert.equal(formatDurationMinutes(1), "1 minute");
  assert.equal(formatDurationMinutes(60), "60 minutes");

  assert.equal(classifyRoundReleaseLoadError(null), "none");
  assert.equal(
    classifyRoundReleaseLoadError({ code: "42P01", message: "missing table" }),
    "migration_missing",
  );
  assert.equal(
    classifyRoundReleaseLoadError({ code: "PGRST205", message: "schema cache" }),
    "migration_missing",
  );
  assert.equal(
    classifyRoundReleaseLoadError({ code: "42703", message: "missing column" }),
    "load_error",
  );
  assert.equal(
    classifyRoundReleaseLoadError({ code: "42501", message: "permission denied" }),
    "load_error",
  );
});

test("Stage 2C (6): migration 0007 enforces schema constraints, timestamptz consistency, statement_timestamp() read predicate, and no GUC bypass", () => {
  const sql = fs.readFileSync(
    path.join(
      ROOT_DIR,
      "supabase/migrations/202611220007_stage2c_round_release_management.sql",
    ),
    "utf8",
  );

  // Rounds extensions
  assert.match(sql, /ADD COLUMN IF NOT EXISTS duration_minutes integer NULL/i);
  assert.match(
    sql,
    /CHECK \(status IN \('draft', 'ready', 'deployed', 'closed', 'completed', 'archived'\)\)/i,
  );
  assert.match(
    sql,
    /CHECK \(duration_minutes IS NULL OR \(duration_minutes BETWEEN 1 AND 1440\)\)/i,
  );

  // No naive timezone('utc', now()) anywhere in 0007
  assert.doesNotMatch(sql, /timezone\(\s*'utc'/i);

  // No client-settable custom PostgreSQL GUC current_setting(...) bypass anywhere in 0007
  assert.doesNotMatch(sql, /current_setting\(/i);

  // Session table, composite FK, single open session partial unique index, and immutability
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.round_release_sessions/i);
  assert.match(
    sql,
    /FOREIGN KEY \(round_id, event_id\)\s+REFERENCES public\.rounds \(id, event_id\)/i,
  );
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS round_release_sessions_one_open_uidx\s+ON public\.round_release_sessions \(round_id\)\s+WHERE closed_at IS NULL/i,
  );
  assert.match(
    sql,
    /close_reason = 'expired' AND closed_by IS NULL AND closed_at = expires_at/i,
  );
  assert.match(
    sql,
    /close_reason IS NOT NULL[\s\S]*close_reason = 'manual'[\s\S]*AND closed_by IS NOT NULL[\s\S]*AND closed_at >= started_at[\s\S]*AND closed_at < expires_at/i,
  );

  // Session immutability trigger rejects deletes, locked updates after closure, and wrong expiry timestamp
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.enforce_round_release_session_immutability\(\)/i);
  assert.match(sql, /IF TG_OP = 'DELETE' THEN[\s\S]*RAISE EXCEPTION/i);
  assert.match(sql, /IF OLD\.closed_at IS NOT NULL THEN[\s\S]*RAISE EXCEPTION/i);
  assert.match(sql, /NEW\.closed_at <> OLD\.expires_at OR NEW\.closed_by IS NOT NULL/i);

  // Final Safeguard #2: Direct authenticated rounds.status tamper protection + permanent lock + duration immutability
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.protect_round_release_lifecycle\(\)/i);
  assert.match(sql, /IF current_user IN \('anon', 'authenticated'\) THEN/i);
  assert.match(
    sql,
    /IF OLD\.is_locked = true\s+AND NEW\.is_locked = false/i,
  );
  assert.match(
    sql,
    /IF v_has_any_session AND NEW\.duration_minutes IS DISTINCT FROM OLD\.duration_minutes THEN/i,
  );
  assert.match(
    sql,
    /IF NEW\.status = 'deployed' AND NOT v_has_open_session THEN/i,
  );

  // Race-safe database trigger preventing event deactivation while an unexpired open release session exists
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.protect_event_release_deactivation\(\)/i);
  assert.match(sql, /BEFORE UPDATE OF status ON public\.events/i);
  assert.match(
    sql,
    /protect_event_release_deactivation[\s\S]*virtuoso_event_release:[\s\S]*clock_timestamp\(\)/i,
  );

  // Final Safeguard #1: VOLATILE SECURITY DEFINER team-live predicate using statement_timestamp()
  const livePredStart = sql.indexOf("CREATE OR REPLACE FUNCTION public.is_round_currently_live_for_teams");
  assert.ok(livePredStart > 0);
  const livePredEnd = sql.indexOf("CREATE OR REPLACE FUNCTION public.get_db_server_timestamp");
  assert.ok(livePredEnd > livePredStart);
  const livePredSql = sql.slice(livePredStart, livePredEnd);

  assert.match(livePredSql, /\bVOLATILE\b/);
  assert.match(livePredSql, /SECURITY DEFINER/);
  assert.match(livePredSql, /SET search_path = public/);
  assert.match(livePredSql, /e\.status = 'active'/);
  assert.match(livePredSql, /r\.status = 'deployed'/);
  assert.match(livePredSql, /s\.closed_at IS NULL/);
  assert.match(livePredSql, /statement_timestamp\(\) >= s\.started_at/);
  assert.match(livePredSql, /statement_timestamp\(\) < s\.expires_at/);
  assert.doesNotMatch(livePredSql, /\bnow\(\)/);

  // Strict RLS & least-privilege table grants on round_release_sessions
  assert.match(sql, /REVOKE ALL ON public\.round_release_sessions FROM PUBLIC;/i);
  assert.match(sql, /REVOKE ALL ON public\.round_release_sessions FROM anon;/i);
  assert.match(sql, /REVOKE ALL ON public\.round_release_sessions FROM authenticated;/i);
  assert.match(sql, /GRANT SELECT ON public\.round_release_sessions TO authenticated;/i);
  assert.match(sql, /ALTER TABLE public\.round_release_sessions ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /public\.is_active_organiser\(\)/i);

  // Privileged RPCs with uniform lock hierarchy, post-lock clock_timestamp(), atomic audit logs, and strict grants
  for (const fnName of [
    "configure_round_duration",
    "release_round",
    "close_round_release",
    "reopen_round_release",
    "reconcile_expired_round_release",
  ]) {
    assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fnName}\\(`));
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fnName}\\([^)]+\\) TO authenticated`));

    const fnStart = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${fnName}`);
    const fnEnd = sql.indexOf("$$;", fnStart);
    assert.ok(fnStart > 0 && fnEnd > fnStart, `Missing function body for ${fnName}`);
    const fnSql = sql.slice(fnStart, fnEnd);

    const eventsShareIdx = fnSql.indexOf("FROM public.events");
    const eventAdvIdx = fnSql.indexOf("virtuoso_event_release:");
    const roundAdvIdx = fnSql.indexOf("virtuoso_round_release:");
    const roundsLockIdx = fnSql.indexOf("FROM public.rounds");
    const clockIdx = fnSql.indexOf("clock_timestamp()");

    assert.ok(
      eventsShareIdx > 0 &&
        eventAdvIdx > eventsShareIdx &&
        roundAdvIdx > eventAdvIdx &&
        roundsLockIdx > roundAdvIdx &&
        clockIdx > roundsLockIdx,
      `${fnName} must acquire locks in canonical order before capturing clock_timestamp()`,
    );

    if (
      fnName === "close_round_release" ||
      fnName === "reopen_round_release" ||
      fnName === "reconcile_expired_round_release"
    ) {
      const openSessionLockIdx = fnSql.indexOf("FROM public.round_release_sessions");
      assert.ok(
        openSessionLockIdx > roundsLockIdx && clockIdx > openSessionLockIdx,
        `${fnName} must lock open release session before capturing clock_timestamp()`,
      );
    }
  }

  assert.match(sql, /'round\.duration_configured'/);
  assert.match(sql, /'round\.released'/);
  assert.match(sql, /'round\.closed_manually'/);
  assert.match(sql, /'round\.release_expired'/);
  assert.match(sql, /'round\.reopened'/);
  assert.match(sql, /is_locked = true/);
});

test("Stage 2C (7): server actions, pages, and UI fail closed, enforce organiser authorisation, preserve duration immutability, and sync countdown safely", () => {
  const releaseActions = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/actions/round-release.ts"),
    "utf8",
  );
  const compActions = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/actions/competition.ts"),
    "utf8",
  );
  const roundPage = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/events/[eventId]/rounds/[roundId]/page.tsx"),
    "utf8",
  );
  const eventPage = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/events/[eventId]/page.tsx"),
    "utf8",
  );
  const releasePanel = fs.readFileSync(
    path.join(ROOT_DIR, "src/components/competition/RoundReleasePanel.tsx"),
    "utf8",
  );
  const eventManager = fs.readFileSync(
    path.join(ROOT_DIR, "src/components/competition/EventDetailManager.tsx"),
    "utf8",
  );
  const roundManager = fs.readFileSync(
    path.join(ROOT_DIR, "src/components/competition/RoundDetailManager.tsx"),
    "utf8",
  );

  // Every Stage 2C action (including getDbServerTimestampAction) enforces active organiser role guard
  const guardMatches = releaseActions.match(/requireActiveUserForAction\(ALL_ORGANISER_ROLES/g) ?? [];
  assert.equal(guardMatches.length, 6);

  // configureRoundDurationAction uses atomic RPC and blocks edits after any release history
  assert.match(releaseActions, /supabase\.rpc\("configure_round_duration"/);
  assert.match(releaseActions, /if \(sessionsErr\)[\s\S]*Unable to verify round release history/);
  assert.doesNotMatch(releaseActions, /Date\.now\(\)/);

  // Competition actions fail closed on session/clock errors, enforce event deactivation guard, and protect duration after any release
  assert.match(compActions, /Cannot change event status away from "Active" while a round has a live release session/);
  assert.match(compActions, /New rounds must be created as "Draft" or "Ready"/);
  assert.match(compActions, /Judging criteria lock cannot be removed after a round has been released/);
  assert.match(compActions, /Configured duration cannot be changed after release history exists/);
  assert.match(compActions, /if \(sessionsErr\)[\s\S]*Unable to verify round release history/);
  assert.doesNotMatch(compActions, /Date\.now\(\)/);
  assert.match(eventManager, /ROUND_CREATE_STATUSES/);

  // Pages load DB server time & sessions under active organiser auth and do NOT fall back to local new Date().toISOString()
  assert.match(roundPage, /requireActiveUser\(ALL_ORGANISER_ROLES/);
  assert.match(roundPage, /get_db_server_timestamp/);
  assert.match(roundPage, /round_release_sessions/);
  assert.doesNotMatch(roundPage, /new Date\(\)\.toISOString\(\)/);

  assert.match(eventPage, /requireActiveUser\(ALL_ORGANISER_ROLES/);
  assert.match(eventPage, /get_db_server_timestamp/);
  assert.match(eventPage, /round_release_sessions/);
  assert.doesNotMatch(eventPage, /new Date\(\)\.toISOString\(\)/);

  // UI countdown uses stabilised onExpiredRef, server clock sync, and monotonic performance.now() without Date.now()
  assert.match(releasePanel, /onExpiredRef/);
  assert.match(releasePanel, /getDbServerTimestampAction/);
  assert.match(releasePanel, /performance\.now\(\)/);
  assert.doesNotMatch(releasePanel, /Date\.now\(\)/);
  assert.match(releasePanel, /!hasReleaseHistory/);
  assert.match(releasePanel, /id="reopen-duration"[\s\S]*defaultValue=""/);
  assert.doesNotMatch(releasePanel, /id="reopen-duration"[\s\S]*\brequired\b/);

  // RoundDetailManager locks duration after any release history exists
  assert.match(roundManager, /releaseSessions\.length > 0/);
  assert.match(roundManager, /releaseLoadError=\{releaseLoadError\}/);

  // EventDetailManager fails closed without Date.now() fallback
  assert.doesNotMatch(eventManager, /Date\.now\(\)/);
  assert.match(eventManager, /Unavailable \(Load Error\)/);

  // Role policy sanity
  const pendingDenied = evaluateOrganiserAccess({
    authUserId: "u1",
    profile: {
      id: "u1",
      email: "pending@example.edu",
      full_name: "Pending",
      role: "pending_approval",
      scope_mode: "all",
      is_active: true,
      created_at: "2026-11-22T00:00:00Z",
      updated_at: "2026-11-22T00:00:00Z",
    },
    allowedRoles: ALL_ORGANISER_ROLES,
  });
  assert.equal(pendingDenied.ok, false);

  // UI safety: no window.alert / window.confirm / window.open and no team-portal/submission leakage
  for (const [label, src] of [
    ["RoundReleasePanel.tsx", releasePanel],
    ["EventDetailManager.tsx", eventManager],
    ["RoundDetailManager.tsx", roundManager],
  ]) {
    assert.equal(
      src.includes("window.alert") ||
        src.includes("window.confirm") ||
        src.includes("window.open"),
      false,
      `${label} must not call browser alert/confirm/open`,
    );
    assert.doesNotMatch(
      src,
      /SUPABASE_SERVICE_ROLE_KEY|createSupabaseAdminClient/,
      `${label} must not reference server secrets`,
    );
  }
});
