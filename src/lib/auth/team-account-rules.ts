import {
  MAX_TEAM_CONCURRENT_SESSIONS,
  type TeamAccountRecord,
  type TeamSessionRecord,
} from "@/types/team-auth";

export const TEAM_SYNTHETIC_EMAIL_DOMAIN = "team.virtuoso.invalid" as const;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  return UUID_REGEX.test(value.trim());
}

/**
 * Generates an immutable, server-internal synthetic email address for a team
 * Auth user from its permanent team_accounts UUID. Because contingent codes
 * can be edited by organisers, synthetic auth emails must NEVER depend on
 * mutable contingent_code values or be shown in team/UI/audit email fields.
 */
export function buildTeamSyntheticEmail(teamAccountId: string): string {
  const normalized = teamAccountId.trim().toLowerCase();
  if (!UUID_REGEX.test(normalized)) {
    throw new Error("Team account UUID must be a valid UUID.");
  }
  return `team-${normalized}@${TEAM_SYNTHETIC_EMAIL_DOMAIN}`;
}

export interface TeamAccountEligibilityInput {
  authUserId: string | null | undefined;
  jwtSessionId: string | null | undefined;
  hasOrganiserProfile: boolean;
  teamAccount: Pick<
    TeamAccountRecord,
    "id" | "contingent_id" | "auth_user_id" | "is_active"
  > | null;
  contingentIsActive: boolean;
}

export type TeamAccountEligibilityResult =
  | {
      ok: true;
      teamAccountId: string;
      contingentId: string;
      supabaseSessionId: string;
    }
  | {
      ok: false;
      reason:
        | "unauthenticated"
        | "organiser_forbidden"
        | "missing_team_account"
        | "account_inactive"
        | "contingent_inactive";
    };

export function evaluateTeamAccountEligibility(
  input: TeamAccountEligibilityInput,
): TeamAccountEligibilityResult {
  if (!isValidUuid(input.authUserId) || !isValidUuid(input.jwtSessionId)) {
    return { ok: false, reason: "unauthenticated" };
  }

  if (input.hasOrganiserProfile) {
    return { ok: false, reason: "organiser_forbidden" };
  }

  const account = input.teamAccount;
  if (!account || account.auth_user_id !== input.authUserId!.trim()) {
    return { ok: false, reason: "missing_team_account" };
  }

  if (!account.is_active) {
    return { ok: false, reason: "account_inactive" };
  }

  if (!input.contingentIsActive) {
    return { ok: false, reason: "contingent_inactive" };
  }

  return {
    ok: true,
    teamAccountId: account.id,
    contingentId: account.contingent_id,
    supabaseSessionId: input.jwtSessionId!.trim().toLowerCase(),
  };
}

export interface AuthSessionSnapshot {
  id: string;
  user_id: string;
  not_after: string | null;
}

export function isAuthSessionCurrentlyValid(
  authSession: AuthSessionSnapshot | null | undefined,
  authUserId: string,
  nowIso: string,
): boolean {
  if (!authSession) {
    return false;
  }
  if (authSession.user_id !== authUserId) {
    return false;
  }
  if (authSession.not_after === null) {
    return true;
  }
  return Date.parse(authSession.not_after) > Date.parse(nowIso);
}

export interface TeamSessionRegistrationEvalInput {
  eligibility: TeamAccountEligibilityInput;
  sessions: TeamSessionRecord[];
  authSessions: AuthSessionSnapshot[];
  nowIso: string;
  newSessionRowId?: string;
}

export type TeamSessionRegistrationEvalResult =
  | {
      ok: true;
      operation: "registered" | "refreshed";
      contingentId: string;
      activeSessionCount: number;
      maxSessions: number;
      stalePrunedCount: number;
      sessions: TeamSessionRecord[];
    }
  | {
      ok: false;
      reason:
        | "unauthenticated"
        | "organiser_forbidden"
        | "missing_team_account"
        | "account_inactive"
        | "contingent_inactive"
        | "auth_session_invalid"
        | "session_belongs_to_other_team"
        | "session_revoked"
        | "max_concurrent_sessions_reached";
      sessions: TeamSessionRecord[];
    };

/**
 * Pure reference model matching public.register_team_session() semantics for
 * deterministic unit testing (4-session cap, stale auth cleanup, no eviction).
 */
export function evaluateTeamSessionRegistration(
  input: TeamSessionRegistrationEvalInput,
): TeamSessionRegistrationEvalResult {
  const eligibility = evaluateTeamAccountEligibility(input.eligibility);
  if (!eligibility.ok) {
    return {
      ok: false,
      reason: eligibility.reason,
      sessions: input.sessions.map((s) => ({ ...s })),
    };
  }

  const authUserId = input.eligibility.authUserId!.trim();
  const currentAuth = input.authSessions.find(
    (a) => a.id.toLowerCase() === eligibility.supabaseSessionId,
  );
  if (!isAuthSessionCurrentlyValid(currentAuth, authUserId, input.nowIso)) {
    return {
      ok: false,
      reason: "auth_session_invalid",
      sessions: input.sessions.map((s) => ({ ...s })),
    };
  }

  const authById = new Map(
    input.authSessions.map((a) => [a.id.toLowerCase(), a] as const),
  );

  let stalePrunedCount = 0;
  const nextSessions: TeamSessionRecord[] = input.sessions.map((session) => {
    if (
      session.team_account_id === eligibility.teamAccountId &&
      session.revoked_at === null &&
      session.supabase_session_id.toLowerCase() !== eligibility.supabaseSessionId
    ) {
      const linkedAuth = authById.get(session.supabase_session_id.toLowerCase());
      if (!isAuthSessionCurrentlyValid(linkedAuth, authUserId, input.nowIso)) {
        stalePrunedCount += 1;
        return {
          ...session,
          revoked_at: input.nowIso,
          revoked_reason: "auth_session_expired",
          revoked_by: null,
        };
      }
    }
    return { ...session };
  });

  const existingIndex = nextSessions.findIndex(
    (s) =>
      s.supabase_session_id.toLowerCase() === eligibility.supabaseSessionId,
  );

  if (existingIndex !== -1) {
    const existing = nextSessions[existingIndex];
    if (existing.team_account_id !== eligibility.teamAccountId) {
      return {
        ok: false,
        reason: "session_belongs_to_other_team",
        sessions: nextSessions,
      };
    }

    if (existing.revoked_at !== null) {
      return {
        ok: false,
        reason: "session_revoked",
        sessions: nextSessions,
      };
    }

    const updatedLastSeen =
      Date.parse(input.nowIso) > Date.parse(existing.last_seen_at)
        ? input.nowIso
        : existing.last_seen_at;
    nextSessions[existingIndex] = {
      ...existing,
      last_seen_at: updatedLastSeen,
    };

    const activeCount = nextSessions.filter(
      (s) =>
        s.team_account_id === eligibility.teamAccountId && s.revoked_at === null,
    ).length;

    return {
      ok: true,
      operation: "refreshed",
      contingentId: eligibility.contingentId,
      activeSessionCount: activeCount,
      maxSessions: MAX_TEAM_CONCURRENT_SESSIONS,
      stalePrunedCount,
      sessions: nextSessions,
    };
  }

  const activeCount = nextSessions.filter(
    (s) =>
      s.team_account_id === eligibility.teamAccountId && s.revoked_at === null,
  ).length;

  if (activeCount >= MAX_TEAM_CONCURRENT_SESSIONS) {
    return {
      ok: false,
      reason: "max_concurrent_sessions_reached",
      sessions: nextSessions,
    };
  }

  const newSession: TeamSessionRecord = {
    id: input.newSessionRowId ?? `session-${nextSessions.length + 1}`,
    team_account_id: eligibility.teamAccountId,
    contingent_id: eligibility.contingentId,
    supabase_session_id: eligibility.supabaseSessionId,
    created_at: input.nowIso,
    last_seen_at: input.nowIso,
    revoked_at: null,
    revoked_reason: null,
    revoked_by: null,
  };

  nextSessions.push(newSession);

  return {
    ok: true,
    operation: "registered",
    contingentId: eligibility.contingentId,
    activeSessionCount: activeCount + 1,
    maxSessions: MAX_TEAM_CONCURRENT_SESSIONS,
    stalePrunedCount,
    sessions: nextSessions,
  };
}

export function evaluateCurrentTeamSessionAccess(input: {
  eligibility: TeamAccountEligibilityInput;
  sessions: TeamSessionRecord[];
  authSessions: AuthSessionSnapshot[];
  nowIso: string;
  requestedContingentId?: string | null;
}): {
  isActive: boolean;
  contingentId: string | null;
} {
  const eligibility = evaluateTeamAccountEligibility(input.eligibility);
  if (!eligibility.ok) {
    return { isActive: false, contingentId: null };
  }

  if (
    input.requestedContingentId &&
    input.requestedContingentId !== eligibility.contingentId
  ) {
    return { isActive: false, contingentId: null };
  }

  const authUserId = input.eligibility.authUserId!.trim();
  const authRow = input.authSessions.find(
    (a) => a.id.toLowerCase() === eligibility.supabaseSessionId,
  );
  if (!isAuthSessionCurrentlyValid(authRow, authUserId, input.nowIso)) {
    return { isActive: false, contingentId: null };
  }

  const sessionRow = input.sessions.find(
    (s) =>
      s.team_account_id === eligibility.teamAccountId &&
      s.contingent_id === eligibility.contingentId &&
      s.supabase_session_id.toLowerCase() === eligibility.supabaseSessionId &&
      s.revoked_at === null,
  );

  if (!sessionRow) {
    return { isActive: false, contingentId: null };
  }

  return { isActive: true, contingentId: eligibility.contingentId };
}

export function evaluateRevokeCurrentTeamSession(input: {
  eligibility: TeamAccountEligibilityInput;
  sessions: TeamSessionRecord[];
  nowIso: string;
}): {
  ok: boolean;
  revoked: boolean;
  sessions: TeamSessionRecord[];
} {
  if (
    !isValidUuid(input.eligibility.authUserId) ||
    !isValidUuid(input.eligibility.jwtSessionId) ||
    input.eligibility.hasOrganiserProfile ||
    !input.eligibility.teamAccount ||
    input.eligibility.teamAccount.auth_user_id !==
      input.eligibility.authUserId!.trim()
  ) {
    return {
      ok: false,
      revoked: false,
      sessions: input.sessions.map((s) => ({ ...s })),
    };
  }

  const teamAccountId = input.eligibility.teamAccount.id;
  const sessionId = input.eligibility.jwtSessionId!.trim().toLowerCase();
  let revoked = false;

  const nextSessions = input.sessions.map((session) => {
    if (
      session.team_account_id === teamAccountId &&
      session.supabase_session_id.toLowerCase() === sessionId &&
      session.revoked_at === null
    ) {
      revoked = true;
      return {
        ...session,
        revoked_at: input.nowIso,
        revoked_reason: "logout" as const,
        revoked_by: null,
      };
    }
    return { ...session };
  });

  return {
    ok: true,
    revoked,
    sessions: nextSessions,
  };
}

/**
 * Pure reference model matching the AFTER UPDATE OF is_active trigger
 * revoke_team_sessions_on_deactivation() on public.team_accounts.
 * Transitioning active -> inactive revokes every unrevoked session with
 * revoked_reason = 'account_deactivated' while preserving historical sessions.
 */
export function evaluateDeactivateTeamAccount(input: {
  account: TeamAccountRecord;
  sessions: TeamSessionRecord[];
  deactivatedByProfileId: string | null;
  nowIso: string;
}): {
  account: TeamAccountRecord;
  sessions: TeamSessionRecord[];
  revokedCount: number;
} {
  const wasActive = input.account.is_active;
  const nextAccount: TeamAccountRecord = {
    ...input.account,
    is_active: false,
    deactivated_at: input.account.deactivated_at ?? input.nowIso,
    deactivated_by: input.deactivatedByProfileId,
    updated_by: input.deactivatedByProfileId,
    updated_at: input.nowIso,
  };

  let revokedCount = 0;
  const nextSessions = input.sessions.map((session) => {
    if (
      wasActive &&
      session.team_account_id === input.account.id &&
      session.revoked_at === null
    ) {
      revokedCount += 1;
      const revokedAt =
        Date.parse(input.nowIso) >= Date.parse(session.created_at)
          ? input.nowIso
          : session.created_at;
      return {
        ...session,
        revoked_at: revokedAt,
        revoked_reason: "account_deactivated" as const,
        revoked_by: input.deactivatedByProfileId,
      };
    }
    return { ...session };
  });

  return {
    account: nextAccount,
    sessions: nextSessions,
    revokedCount,
  };
}

/**
 * Pure reference model for reactivating a team account: restores account
 * eligibility for future logins, while never un-revoking prior sessions.
 */
export function evaluateReactivateTeamAccount(input: {
  account: TeamAccountRecord;
  sessions: TeamSessionRecord[];
  reactivatedByProfileId: string | null;
  nowIso: string;
}): {
  account: TeamAccountRecord;
  sessions: TeamSessionRecord[];
} {
  return {
    account: {
      ...input.account,
      is_active: true,
      deactivated_at: null,
      deactivated_by: null,
      updated_by: input.reactivatedByProfileId,
      updated_at: input.nowIso,
    },
    sessions: input.sessions.map((s) => ({ ...s })),
  };
}

/**
 * Reference model matching Super Admin-only SELECT RLS on public.team_accounts
 * and public.team_sessions (public.is_active_super_admin()).
 */
export function canAccessTeamSessionRecords(actor: {
  kind: "super_admin" | "event_coordinator" | "team" | "anonymous";
  isActive: boolean;
}): boolean {
  return actor.kind === "super_admin" && actor.isActive;
}

/**
 * Pure reference model matching the AFTER UPDATE OF is_active trigger
 * revoke_team_sessions_on_contingent_deactivation() on public.contingents.
 * Safely no-ops when a contingent has no linked team account, and revokes all
 * unrevoked sessions with revoked_reason = 'contingent_deactivated' otherwise.
 */
export function evaluateDeactivateContingent(input: {
  contingentId: string;
  contingentWasActive: boolean;
  teamAccount: TeamAccountRecord | null;
  sessions: TeamSessionRecord[];
  actorProfileId: string | null;
  nowIso: string;
}): {
  contingentIsActive: boolean;
  sessions: TeamSessionRecord[];
  revokedCount: number;
} {
  if (
    !input.contingentWasActive ||
    !input.teamAccount ||
    input.teamAccount.contingent_id !== input.contingentId
  ) {
    return {
      contingentIsActive: false,
      sessions: input.sessions.map((s) => ({ ...s })),
      revokedCount: 0,
    };
  }

  let revokedCount = 0;
  const nextSessions = input.sessions.map((session) => {
    if (
      session.team_account_id === input.teamAccount!.id &&
      session.revoked_at === null
    ) {
      revokedCount += 1;
      const revokedAt =
        Date.parse(input.nowIso) >= Date.parse(session.created_at)
          ? input.nowIso
          : session.created_at;
      return {
        ...session,
        revoked_at: revokedAt,
        revoked_reason: "contingent_deactivated" as const,
        revoked_by: input.actorProfileId,
      };
    }
    return { ...session };
  });

  return {
    contingentIsActive: false,
    sessions: nextSessions,
    revokedCount,
  };
}

/**
 * Pure reference model for reactivating a contingent: restores eligibility for
 * new logins while never un-revoking previously revoked sessions.
 */
export function evaluateReactivateContingent(input: {
  sessions: TeamSessionRecord[];
}): {
  contingentIsActive: boolean;
  sessions: TeamSessionRecord[];
} {
  return {
    contingentIsActive: true,
    sessions: input.sessions.map((s) => ({ ...s })),
  };
}

// ============================================================================
// STAGE 3B.2: TEAM LOGIN, SESSION RESOLUTION & LOCAL LOGOUT FLOWS
// ============================================================================

export const GENERIC_TEAM_LOGIN_ERROR = "Invalid team code or password." as const;

export const TEAM_SESSION_LIMIT_ERROR =
  "This team already has 4 active device sessions. Sign out from one of those devices before signing in here." as const;

export const TEAM_UNAVAILABLE_ERROR =
  "Unable to verify team credentials right now. Please try again." as const;

export const TEAM_SESSION_START_ERROR =
  "Unable to start a team session right now. Please try again." as const;

export const TEAM_SESSION_CLEANUP_ERROR =
  "Unable to finish signing in or clear the temporary device session. Please clear your browser cookies and try again." as const;

export const ORGANISER_TEAM_LOGIN_COLLISION_ERROR =
  "You are currently signed in with an organiser account. Return to the Organiser CMS or sign out of your organiser session before signing in as a team." as const;

export function assertLocalSignOutResult(result: {
  error: { message?: string } | null;
}): void {
  if (result.error) {
    throw new Error("Local session cleanup failed.");
  }
}

export function normalizeTeamCodeInput(rawCode: string): string {
  return rawCode.trim().toUpperCase();
}

export function validateTeamLoginInputs(
  rawTeamCode: string,
  rawPassword: string,
):
  | { ok: true; teamCode: string; password: string }
  | { ok: false; error: string } {
  const trimmedCode = rawTeamCode.trim();
  if (!trimmedCode || !rawPassword) {
    return {
      ok: false,
      error: "Enter both your team code and password.",
    };
  }

  const teamCode = normalizeTeamCodeInput(rawTeamCode);
  if (
    teamCode.length < 2 ||
    teamCode.length > 40 ||
    rawPassword.length > 128
  ) {
    return { ok: false, error: GENERIC_TEAM_LOGIN_ERROR };
  }

  return {
    ok: true,
    teamCode,
    password: rawPassword,
  };
}

export function sanitizeTeamRedirectPath(
  candidate: string | null | undefined,
  fallback = "/team",
): string {
  if (!candidate) {
    return fallback;
  }

  const trimmed = candidate.trim();
  if (
    !trimmed.startsWith("/team") ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\") ||
    trimmed.includes("..") ||
    /[\u0000-\u001f\u007f]/.test(trimmed)
  ) {
    return fallback;
  }

  const pathOnly = trimmed.split(/[?#]/, 1)[0];
  if (pathOnly !== "/team" && !pathOnly.startsWith("/team/")) {
    return fallback;
  }

  if (
    pathOnly
      .split("/")
      .some((segment) => segment === "." || segment === "..")
  ) {
    return fallback;
  }

  if (pathOnly === "/team/login" || pathOnly.startsWith("/team/login/")) {
    return fallback;
  }

  return trimmed;
}

export function buildTeamLoginRedirectPath(params: {
  error?: string | null;
  nextPath?: string | null;
}): string {
  const searchParams = new URLSearchParams();
  if (params.error) {
    searchParams.set("error", params.error);
  }
  const safeNext = sanitizeTeamRedirectPath(params.nextPath, "/team");
  if (safeNext !== "/team") {
    searchParams.set("next", safeNext);
  }
  const query = searchParams.toString();
  return query ? `/team/login?${query}` : "/team/login";
}

export function escapePostgresLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

export function mapRegisterTeamSessionError(
  errorMessage: string | null | undefined,
): string {
  const msg = errorMessage ?? "";
  if (
    /maximum of 4 concurrent team sessions/i.test(msg) ||
    /4 concurrent/i.test(msg)
  ) {
    return TEAM_SESSION_LIMIT_ERROR;
  }

  if (
    /inactive/i.test(msg) ||
    /does not exist/i.test(msg) ||
    /organiser accounts/i.test(msg)
  ) {
    return GENERIC_TEAM_LOGIN_ERROR;
  }

  return TEAM_SESSION_START_ERROR;
}

export interface TeamContingentLookupRow {
  id: string;
  contingent_code: string;
  is_active: boolean;
}

export interface TeamAccountLookupRow {
  id: string;
  contingent_id: string;
  auth_user_id: string;
  is_active: boolean;
}

export interface TeamLoginDeps {
  hasCurrentOrganiserSession?: () => Promise<{
    isOrganiser: boolean;
    error: string | null;
  }>;
  findContingentsByCode: (
    normalizedTeamCode: string,
  ) => Promise<{ rows: TeamContingentLookupRow[]; error: string | null }>;
  findTeamAccountByContingentId: (
    contingentId: string,
  ) => Promise<{ row: TeamAccountLookupRow | null; error: string | null }>;
  hasOrganiserProfileByUserId: (
    userId: string,
  ) => Promise<{ exists: boolean; error: string | null }>;
  signInWithPassword: (credentials: {
    email: string;
    password: string;
  }) => Promise<{ userId: string | null; error: string | null }>;
  registerTeamSession: () => Promise<{
    contingentId: string | null;
    error: string | null;
  }>;
  signOutLocal: () => Promise<void | { error: string | null }>;
}

export type TeamLoginOutcome =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string; cleanupFailed?: boolean };

async function runLocalCleanup(
  signOutLocal: TeamLoginDeps["signOutLocal"],
): Promise<boolean> {
  try {
    const result = await signOutLocal();
    if (
      result &&
      typeof result === "object" &&
      "error" in result &&
      result.error
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function authenticateTeamWithDeps(params: {
  rawTeamCode: string;
  rawPassword: string;
  rawNextPath?: string | null;
  deps: TeamLoginDeps;
}): Promise<TeamLoginOutcome> {
  if (params.deps.hasCurrentOrganiserSession) {
    const currentOrganiser = await params.deps.hasCurrentOrganiserSession();
    if (currentOrganiser.error) {
      return { ok: false, error: TEAM_UNAVAILABLE_ERROR };
    }
    if (currentOrganiser.isOrganiser) {
      return { ok: false, error: ORGANISER_TEAM_LOGIN_COLLISION_ERROR };
    }
  }

  const inputCheck = validateTeamLoginInputs(
    params.rawTeamCode,
    params.rawPassword,
  );
  if (!inputCheck.ok) {
    return { ok: false, error: inputCheck.error };
  }

  const nextPath = sanitizeTeamRedirectPath(params.rawNextPath, "/team");

  const contingentLookup = await params.deps.findContingentsByCode(
    inputCheck.teamCode,
  );
  if (contingentLookup.error) {
    return { ok: false, error: TEAM_UNAVAILABLE_ERROR };
  }

  const exactContingents = contingentLookup.rows.filter(
    (row) => normalizeTeamCodeInput(row.contingent_code) === inputCheck.teamCode,
  );
  if (exactContingents.length !== 1) {
    return { ok: false, error: GENERIC_TEAM_LOGIN_ERROR };
  }

  const contingent = exactContingents[0];
  if (!contingent.is_active || !isValidUuid(contingent.id)) {
    return { ok: false, error: GENERIC_TEAM_LOGIN_ERROR };
  }

  const accountLookup = await params.deps.findTeamAccountByContingentId(
    contingent.id,
  );
  if (accountLookup.error) {
    return { ok: false, error: TEAM_UNAVAILABLE_ERROR };
  }

  const account = accountLookup.row;
  if (
    !account ||
    !account.is_active ||
    account.contingent_id !== contingent.id ||
    !isValidUuid(account.id) ||
    !isValidUuid(account.auth_user_id)
  ) {
    return { ok: false, error: GENERIC_TEAM_LOGIN_ERROR };
  }

  const organiserCheck = await params.deps.hasOrganiserProfileByUserId(
    account.auth_user_id,
  );
  if (organiserCheck.error) {
    return { ok: false, error: TEAM_UNAVAILABLE_ERROR };
  }
  if (organiserCheck.exists) {
    return { ok: false, error: GENERIC_TEAM_LOGIN_ERROR };
  }

  const syntheticEmail = buildTeamSyntheticEmail(account.id);
  const signInResult = await params.deps.signInWithPassword({
    email: syntheticEmail,
    password: inputCheck.password,
  });

  if (signInResult.error || !signInResult.userId) {
    return { ok: false, error: GENERIC_TEAM_LOGIN_ERROR };
  }

  if (signInResult.userId !== account.auth_user_id) {
    const cleaned = await runLocalCleanup(params.deps.signOutLocal);
    if (!cleaned) {
      return {
        ok: false,
        error: TEAM_SESSION_CLEANUP_ERROR,
        cleanupFailed: true,
      };
    }
    return { ok: false, error: GENERIC_TEAM_LOGIN_ERROR };
  }

  const regResult = await params.deps.registerTeamSession();
  if (regResult.error || regResult.contingentId !== contingent.id) {
    const cleaned = await runLocalCleanup(params.deps.signOutLocal);
    if (!cleaned) {
      return {
        ok: false,
        error: TEAM_SESSION_CLEANUP_ERROR,
        cleanupFailed: true,
      };
    }
    if (regResult.error) {
      return { ok: false, error: mapRegisterTeamSessionError(regResult.error) };
    }
    return { ok: false, error: TEAM_SESSION_START_ERROR };
  }

  return {
    ok: true,
    redirectTo: nextPath,
  };
}

export interface TeamContingentSummaryRow {
  id: string;
  contingent_code: string;
  name: string;
  institution_name: string;
  is_active: boolean;
}

export interface TeamGuardDeps {
  getAuthUser: () => Promise<{ userId: string | null; error: string | null }>;
  hasOwnOrganiserProfile: (
    userId: string,
  ) => Promise<{ exists: boolean; error: string | null }>;
  checkIsActiveTeamSession: () => Promise<{
    active: boolean;
    error: string | null;
  }>;
  getCurrentTeamContingentId: () => Promise<{
    contingentId: string | null;
    error: string | null;
  }>;
  verifyActiveTeamAccountForSession: (params: {
    contingentId: string;
    authUserId: string;
  }) => Promise<{ active: boolean; error: string | null }>;
  findActiveContingentSummary: (contingentId: string) => Promise<{
    contingent: TeamContingentSummaryRow | null;
    error: string | null;
  }>;
}

export type TeamSessionResolution =
  | {
      ok: true;
      teamSession: {
        contingentId: string;
        contingentCode: string;
        contingentName: string;
        institutionName: string;
      };
    }
  | {
      ok: false;
      reason: "unauthenticated" | "organiser_forbidden" | "invalid_team_session";
    };

export async function resolveActiveTeamSessionWithDeps(
  deps: TeamGuardDeps,
): Promise<TeamSessionResolution> {
  const authRes = await deps.getAuthUser();
  if (authRes.error || !authRes.userId || !isValidUuid(authRes.userId)) {
    return { ok: false, reason: "unauthenticated" };
  }

  const profileRes = await deps.hasOwnOrganiserProfile(authRes.userId);
  if (profileRes.error) {
    return { ok: false, reason: "invalid_team_session" };
  }
  if (profileRes.exists) {
    return { ok: false, reason: "organiser_forbidden" };
  }

  const activeSessionRes = await deps.checkIsActiveTeamSession();
  if (activeSessionRes.error || !activeSessionRes.active) {
    return { ok: false, reason: "invalid_team_session" };
  }

  const contingentIdRes = await deps.getCurrentTeamContingentId();
  if (
    contingentIdRes.error ||
    !contingentIdRes.contingentId ||
    !isValidUuid(contingentIdRes.contingentId)
  ) {
    return { ok: false, reason: "invalid_team_session" };
  }

  const contingentId = contingentIdRes.contingentId;

  const accountActiveRes = await deps.verifyActiveTeamAccountForSession({
    contingentId,
    authUserId: authRes.userId,
  });
  if (accountActiveRes.error || !accountActiveRes.active) {
    return { ok: false, reason: "invalid_team_session" };
  }

  const contingentRes = await deps.findActiveContingentSummary(contingentId);
  if (
    contingentRes.error ||
    !contingentRes.contingent ||
    !contingentRes.contingent.is_active ||
    contingentRes.contingent.id !== contingentId
  ) {
    return { ok: false, reason: "invalid_team_session" };
  }

  return {
    ok: true,
    teamSession: {
      contingentId: contingentRes.contingent.id,
      contingentCode: contingentRes.contingent.contingent_code,
      contingentName: contingentRes.contingent.name,
      institutionName: contingentRes.contingent.institution_name,
    },
  };
}

export interface TeamLogoutDeps {
  getAuthUser: () => Promise<{ userId: string | null }>;
  hasOwnOrganiserProfile: (
    userId: string,
  ) => Promise<{ exists: boolean; error: string | null }>;
  revokeCurrentTeamSession: () => Promise<{ error: string | null }>;
  signOutLocal: () => Promise<{ error: string | null }>;
  onRevocationError?: () => void;
}

export type TeamLogoutOutcome =
  | {
      ok: true;
      revokedInDatabase: true;
      localSignOutSucceeded: true;
    }
  | {
      ok: false;
      reason:
        | "organiser_forbidden"
        | "profile_lookup_failed"
        | "revocation_failed"
        | "local_signout_failed";
      revokedInDatabase: boolean;
      localSignOutSucceeded: boolean;
    };

export async function logoutTeamWithDeps(
  deps: TeamLogoutDeps,
): Promise<TeamLogoutOutcome> {
  const { userId } = await deps.getAuthUser();
  if (userId) {
    let organiserCheck: { exists: boolean; error: string | null };
    try {
      organiserCheck = await deps.hasOwnOrganiserProfile(userId);
    } catch {
      return {
        ok: false,
        reason: "profile_lookup_failed",
        revokedInDatabase: false,
        localSignOutSucceeded: false,
      };
    }

    if (organiserCheck.error) {
      return {
        ok: false,
        reason: "profile_lookup_failed",
        revokedInDatabase: false,
        localSignOutSucceeded: false,
      };
    }

    if (organiserCheck.exists) {
      return {
        ok: false,
        reason: "organiser_forbidden",
        revokedInDatabase: false,
        localSignOutSucceeded: false,
      };
    }
  }

  let revokedInDatabase = false;
  try {
    const revokeResult = await deps.revokeCurrentTeamSession();
    revokedInDatabase = !revokeResult.error;
  } catch {
    revokedInDatabase = false;
  }

  if (!revokedInDatabase) {
    deps.onRevocationError?.();
  }

  let localSignOutSucceeded = false;
  try {
    const signOutResult = await deps.signOutLocal();
    localSignOutSucceeded = !signOutResult.error;
  } catch {
    localSignOutSucceeded = false;
  }

  if (!revokedInDatabase) {
    return {
      ok: false,
      reason: "revocation_failed",
      revokedInDatabase: false,
      localSignOutSucceeded,
    };
  }

  if (!localSignOutSucceeded) {
    return {
      ok: false,
      reason: "local_signout_failed",
      revokedInDatabase: true,
      localSignOutSucceeded: false,
    };
  }

  return {
    ok: true,
    revokedInDatabase: true,
    localSignOutSucceeded: true,
  };
}

export function resolveTeamLogoutRedirect(result: TeamLogoutOutcome): string {
  if (!result.ok) {
    if (result.reason === "organiser_forbidden") {
      return "/team/login?error=organiser_account";
    }
    if (result.reason === "revocation_failed" && result.localSignOutSucceeded) {
      return "/team/login?error=revocation_failed";
    }
    if (
      result.reason === "profile_lookup_failed" ||
      !result.localSignOutSucceeded
    ) {
      return "/team/login?error=logout_failed";
    }
    return "/team/login?error=logout_failed";
  }

  return "/team/login?message=logged_out";
}


