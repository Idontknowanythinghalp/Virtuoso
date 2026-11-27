import { sanitizeSecretOutput } from "@/lib/auth/team-account-admin";
import {
  isValidUuid,
  type AuthSessionSnapshot,
} from "@/lib/auth/team-account-rules";
import {
  MAX_TEAM_CONCURRENT_SESSIONS,
  type GlobalTeamSessionRevokeResult,
  type TeamAccountRecord,
  type TeamSessionDetailItem,
  type TeamSessionDetailsPayload,
  type TeamSessionOverviewItem,
  type TeamSessionOverviewPayload,
  type TeamSessionRecord,
  type TeamSessionRevocationReason,
  type TeamSessionStatus,
} from "@/types/team-auth";

export const GLOBAL_LOGOUT_CONFIRMATION_PHRASE = "LOG OUT ALL TEAMS" as const;
export const TEAM_SESSION_FILTER_OPTIONS = [
  "all",
  "logged_in",
  "not_logged_in",
] as const;

export type TeamSessionLoginFilter =
  (typeof TEAM_SESSION_FILTER_OPTIONS)[number];

export const DEVICE_INFO_NOT_COLLECTED_LABEL = "Not collected" as const;

const VALID_REVOCATION_REASONS = new Set<TeamSessionRevocationReason>([
  "logout",
  "organiser_revoked",
  "account_deactivated",
  "contingent_deactivated",
  "auth_session_expired",
]);

function normalizeTimestampOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRevocationReason(
  value: unknown,
): TeamSessionRevocationReason | null {
  if (
    typeof value === "string" &&
    VALID_REVOCATION_REASONS.has(value as TeamSessionRevocationReason)
  ) {
    return value as TeamSessionRevocationReason;
  }
  return null;
}

export function formatTeamSessionRevocationReason(
  reason: TeamSessionRevocationReason | null,
): string {
  switch (reason) {
    case "logout":
      return "Team signed out";
    case "organiser_revoked":
      return "Revoked by Super Admin";
    case "account_deactivated":
      return "Team account deactivated";
    case "contingent_deactivated":
      return "Contingent deactivated";
    case "auth_session_expired":
      return "Auth session expired";
    default:
      return "Revoked";
  }
}

export function classifyTeamSessionStatus(params: {
  revokedAt: string | null;
  revokedReason: TeamSessionRevocationReason | null;
  teamAccountIsActive: boolean;
  contingentIsActive: boolean;
  authSessionExists: boolean;
  authSessionNotAfter: string | null;
  nowIso: string;
}): { isActive: boolean; status: TeamSessionStatus } {
  if (params.revokedAt !== null) {
    return {
      isActive: false,
      status:
        params.revokedReason === "auth_session_expired" ? "expired" : "revoked",
    };
  }

  const nowMs = Date.parse(params.nowIso);
  const notAfterMs =
    params.authSessionNotAfter !== null
      ? Date.parse(params.authSessionNotAfter)
      : null;

  const isAuthExpired =
    !params.authSessionExists ||
    (notAfterMs !== null && !Number.isNaN(notAfterMs) && notAfterMs <= nowMs);

  if (isAuthExpired) {
    return { isActive: false, status: "expired" };
  }

  if (!params.teamAccountIsActive || !params.contingentIsActive) {
    return { isActive: false, status: "revoked" };
  }

  return { isActive: true, status: "active" };
}

export function validateGlobalLogoutConfirmation(rawInput: string):
  | { ok: true }
  | { ok: false; error: string } {
  const normalized = rawInput.trim();
  if (normalized !== GLOBAL_LOGOUT_CONFIRMATION_PHRASE) {
    return {
      ok: false,
      error: `Type "${GLOBAL_LOGOUT_CONFIRMATION_PHRASE}" exactly to confirm logging out all teams.`,
    };
  }
  return { ok: true };
}

export function filterTeamSessionOverviews(
  teams: readonly TeamSessionOverviewItem[],
  rawQuery: string,
  loginFilter: TeamSessionLoginFilter,
): TeamSessionOverviewItem[] {
  const query = rawQuery.trim().toLowerCase();

  return teams.filter((team) => {
    if (loginFilter === "logged_in" && !team.isLoggedIn) {
      return false;
    }
    if (loginFilter === "not_logged_in" && team.isLoggedIn) {
      return false;
    }
    if (!query) {
      return true;
    }

    return (
      team.contingentCode.toLowerCase().includes(query) ||
      team.contingentName.toLowerCase().includes(query) ||
      team.institutionName.toLowerCase().includes(query)
    );
  });
}

export interface TeamSessionOverviewSummary {
  totalTeams: number;
  provisionedTeams: number;
  loggedInTeams: number;
  totalActiveSessions: number;
  totalExpiredUnprunedSessions: number;
}

export function buildTeamSessionOverviewSummary(
  teams: readonly TeamSessionOverviewItem[],
): TeamSessionOverviewSummary {
  let provisionedTeams = 0;
  let loggedInTeams = 0;
  let totalActiveSessions = 0;
  let totalExpiredUnprunedSessions = 0;

  for (const team of teams) {
    if (team.hasTeamAccount) provisionedTeams += 1;
    if (team.isLoggedIn) loggedInTeams += 1;
    totalActiveSessions += team.activeSessionCount;
    totalExpiredUnprunedSessions += team.expiredUnprunedCount;
  }

  return {
    totalTeams: teams.length,
    provisionedTeams,
    loggedInTeams,
    totalActiveSessions,
    totalExpiredUnprunedSessions,
  };
}

/**
 * Strictly whitelists overview fields returned from RPC so secret fields
 * (supabase_session_id, auth_user_id, JWTs, synthetic emails) can never leak.
 */
export function sanitizeTeamSessionOverviewPayload(
  raw: unknown,
): TeamSessionOverviewPayload {
  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawTeams = Array.isArray(record.teams) ? record.teams : [];

  const teams: TeamSessionOverviewItem[] = rawTeams
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object"),
    )
    .map((item) => {
      const activeCount =
        typeof item.active_session_count === "number" &&
        Number.isFinite(item.active_session_count)
          ? Math.max(0, Math.trunc(item.active_session_count))
          : 0;
      const maxSessions =
        typeof item.max_sessions === "number" && Number.isFinite(item.max_sessions)
          ? Math.max(1, Math.trunc(item.max_sessions))
          : MAX_TEAM_CONCURRENT_SESSIONS;

      return {
        contingentId:
          typeof item.contingent_id === "string" ? item.contingent_id : "",
        contingentCode:
          typeof item.contingent_code === "string"
            ? sanitizeSecretOutput(item.contingent_code)
            : "",
        contingentName:
          typeof item.contingent_name === "string"
            ? sanitizeSecretOutput(item.contingent_name)
            : "",
        institutionName:
          typeof item.institution_name === "string"
            ? sanitizeSecretOutput(item.institution_name)
            : "",
        contingentIsActive: Boolean(item.contingent_is_active),
        hasTeamAccount: Boolean(item.has_team_account),
        teamAccountIsActive: Boolean(item.team_account_is_active),
        activeSessionCount: activeCount,
        maxSessions,
        isLoggedIn: activeCount > 0,
        expiredUnprunedCount:
          typeof item.expired_unpruned_count === "number" &&
          Number.isFinite(item.expired_unpruned_count)
            ? Math.max(0, Math.trunc(item.expired_unpruned_count))
            : 0,
        totalSessionCount:
          typeof item.total_session_count === "number" &&
          Number.isFinite(item.total_session_count)
            ? Math.max(0, Math.trunc(item.total_session_count))
            : 0,
        mostRecentActiveAt: normalizeTimestampOrNull(
          item.most_recent_active_at,
        ),
        mostRecentActivityAt: normalizeTimestampOrNull(
          item.most_recent_activity_at,
        ),
      };
    });

  return {
    generatedAt:
      normalizeTimestampOrNull(record.generated_at) ?? new Date().toISOString(),
    maxSessions:
      typeof record.max_sessions === "number" &&
      Number.isFinite(record.max_sessions)
        ? Math.max(1, Math.trunc(record.max_sessions))
        : MAX_TEAM_CONCURRENT_SESSIONS,
    teams,
  };
}

/**
 * Strictly whitelists per-team session detail fields returned from RPC so
 * supabase_session_id, auth_user_id, JWTs, or synthetic emails never pass through.
 */
export function sanitizeTeamSessionDetailsPayload(
  raw: unknown,
): TeamSessionDetailsPayload | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const rawSessions = Array.isArray(record.sessions) ? record.sessions : [];

  const sessions: TeamSessionDetailItem[] = rawSessions
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object"),
    )
    .map((item) => {
      const revokedAt = normalizeTimestampOrNull(item.revoked_at);
      const revokedReason = normalizeRevocationReason(item.revoked_reason);
      const isActive = Boolean(item.is_active) && revokedAt === null;
      const rawStatus = item.status;
      const status: TeamSessionStatus =
        rawStatus === "active" ||
        rawStatus === "expired" ||
        rawStatus === "revoked"
          ? rawStatus
          : isActive
            ? "active"
            : revokedReason === "auth_session_expired"
              ? "expired"
              : "revoked";

      return {
        sessionId:
          typeof item.session_id === "string" && isValidUuid(item.session_id)
            ? item.session_id.trim().toLowerCase()
            : "",
        deviceInfoStatus: DEVICE_INFO_NOT_COLLECTED_LABEL,
        createdAt: normalizeTimestampOrNull(item.created_at) ?? "",
        lastSeenAt: normalizeTimestampOrNull(item.last_seen_at) ?? "",
        expiresAt: normalizeTimestampOrNull(item.expires_at),
        revokedAt,
        revokedReason,
        isActive,
        status,
      };
    })
    .filter((s) => s.sessionId.length > 0);

  const activeCount =
    typeof record.active_session_count === "number" &&
    Number.isFinite(record.active_session_count)
      ? Math.max(0, Math.trunc(record.active_session_count))
      : sessions.filter((s) => s.isActive).length;

  return {
    contingentId:
      typeof record.contingent_id === "string" ? record.contingent_id : "",
    contingentCode:
      typeof record.contingent_code === "string"
        ? sanitizeSecretOutput(record.contingent_code)
        : "",
    contingentName:
      typeof record.contingent_name === "string"
        ? sanitizeSecretOutput(record.contingent_name)
        : "",
    institutionName:
      typeof record.institution_name === "string"
        ? sanitizeSecretOutput(record.institution_name)
        : "",
    contingentIsActive: Boolean(record.contingent_is_active),
    teamAccountIsActive: Boolean(record.team_account_is_active),
    activeSessionCount: activeCount,
    maxSessions:
      typeof record.max_sessions === "number" &&
      Number.isFinite(record.max_sessions)
        ? Math.max(1, Math.trunc(record.max_sessions))
        : MAX_TEAM_CONCURRENT_SESSIONS,
    sessions,
  };
}

export function sanitizeGlobalRevokeResult(
  raw: unknown,
): GlobalTeamSessionRevokeResult | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const revokedCount =
    typeof record.revoked_count === "number" &&
    Number.isFinite(record.revoked_count)
      ? Math.max(0, Math.trunc(record.revoked_count))
      : 0;
  const expiredPrunedCount =
    typeof record.expired_pruned_count === "number" &&
    Number.isFinite(record.expired_pruned_count)
      ? Math.max(0, Math.trunc(record.expired_pruned_count))
      : 0;
  const affectedTeamCount =
    typeof record.affected_team_count === "number" &&
    Number.isFinite(record.affected_team_count)
      ? Math.max(0, Math.trunc(record.affected_team_count))
      : 0;
  const rawCodes = Array.isArray(record.affected_contingent_codes)
    ? record.affected_contingent_codes
    : [];
  const affectedContingentCodes = rawCodes
    .filter((code): code is string => typeof code === "string")
    .map((code) => sanitizeSecretOutput(code.trim()));

  return {
    operation:
      record.operation === "revoked_all_teams" && revokedCount > 0
        ? "revoked_all_teams"
        : "none_active",
    revokedCount,
    expiredPrunedCount,
    affectedTeamCount,
    affectedContingentCodes,
    revokedAt:
      normalizeTimestampOrNull(record.revoked_at) ?? new Date().toISOString(),
  };
}

/**
 * Pure reference evaluator mirroring PostgreSQL `admin_revoke_all_teams_sessions()`
 * for unit testing global emergency logout alongside Stage 3B.1/3B.3 session rules.
 */
export function evaluateGlobalRevokeAllTeamsSessions(params: {
  actorProfileId: string;
  accounts: readonly TeamAccountRecord[];
  contingents: readonly {
    id: string;
    contingent_code: string;
    is_active: boolean;
  }[];
  sessions: readonly TeamSessionRecord[];
  authSessions: readonly AuthSessionSnapshot[];
  nowIso: string;
}): {
  sessions: TeamSessionRecord[];
  operation: "revoked_all_teams" | "none_active";
  revokedCount: number;
  expiredPrunedCount: number;
  affectedTeamCount: number;
  affectedContingentCodes: string[];
  revokedSessionIds: string[];
} {
  const nowMs = Date.parse(params.nowIso);
  const accountById = new Map(params.accounts.map((a) => [a.id, a]));
  const contingentById = new Map(params.contingents.map((c) => [c.id, c]));
  const authById = new Map(params.authSessions.map((a) => [a.id, a]));

  let expiredPrunedCount = 0;
  let revokedCount = 0;
  const affectedContingentIds = new Set<string>();
  const revokedSessionIds: string[] = [];

  const nextSessions = params.sessions.map((session) => {
    if (session.revoked_at !== null) {
      return session;
    }

    const account = accountById.get(session.team_account_id);
    const authRow = authById.get(session.supabase_session_id);
    const notAfterMs =
      authRow?.not_after != null ? Date.parse(authRow.not_after) : null;
    const isAuthExpired =
      !account ||
      !authRow ||
      authRow.user_id !== account.auth_user_id ||
      (notAfterMs !== null && !Number.isNaN(notAfterMs) && notAfterMs <= nowMs);

    const effectiveRevokedAt =
      Date.parse(params.nowIso) >= Date.parse(session.created_at)
        ? params.nowIso
        : session.created_at;

    if (isAuthExpired) {
      expiredPrunedCount += 1;
      return {
        ...session,
        revoked_at: effectiveRevokedAt,
        revoked_reason: "auth_session_expired" as const,
        revoked_by: null,
      };
    }

    revokedCount += 1;
    affectedContingentIds.add(session.contingent_id);
    revokedSessionIds.push(session.id);

    return {
      ...session,
      revoked_at: effectiveRevokedAt,
      revoked_reason: "organiser_revoked" as const,
      revoked_by: params.actorProfileId,
    };
  });

  const affectedContingentCodes = [...affectedContingentIds]
    .map((id) => contingentById.get(id)?.contingent_code ?? id)
    .sort((a, b) => a.localeCompare(b));

  return {
    sessions: nextSessions,
    operation: revokedCount > 0 ? "revoked_all_teams" : "none_active",
    revokedCount,
    expiredPrunedCount,
    affectedTeamCount: affectedContingentIds.size,
    affectedContingentCodes,
    revokedSessionIds: revokedSessionIds.sort(),
  };
}

export interface RevokeAllTeamsSessionsDeps {
  revokeAllTeamsSessionsRpc: () => Promise<{
    data: unknown;
    error: string | null;
  }>;
}

export type RevokeAllTeamsSessionsActionResult =
  | ({
      ok: true;
      actorEmail: string;
    } & GlobalTeamSessionRevokeResult)
  | { ok: false; error: string };

export async function revokeAllTeamsSessionsWithDeps(params: {
  operator: { id: string; email: string };
  rawConfirmationText: string;
  deps: RevokeAllTeamsSessionsDeps;
}): Promise<RevokeAllTeamsSessionsActionResult> {
  if (!isValidUuid(params.operator.id)) {
    return {
      ok: false,
      error: "Authenticated Super Admin session is required.",
    };
  }

  const confirmCheck = validateGlobalLogoutConfirmation(
    params.rawConfirmationText,
  );
  if (!confirmCheck.ok) {
    return { ok: false, error: confirmCheck.error };
  }

  const rpcRes = await params.deps.revokeAllTeamsSessionsRpc();
  if (rpcRes.error) {
    return {
      ok: false,
      error: sanitizeSecretOutput(rpcRes.error),
    };
  }

  const sanitized = sanitizeGlobalRevokeResult(rpcRes.data);
  if (!sanitized) {
    return {
      ok: false,
      error: "Unable to confirm global team logout response from database.",
    };
  }

  return {
    ok: true,
    actorEmail: params.operator.email,
    ...sanitized,
  };
}

