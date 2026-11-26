import { validateEmailInput } from "@/lib/auth/account-rules";
import {
  TEAM_SYNTHETIC_EMAIL_DOMAIN,
  buildTeamSyntheticEmail,
  isValidUuid,
  normalizeTeamCodeInput,
} from "@/lib/auth/team-account-rules";
import type { TeamSessionRevocationReason } from "@/types/team-auth";

export const FORBIDDEN_CLI_SECRET_FLAGS = [
  "--password",
  "-p",
  "--new-password",
  "--confirm-password",
  "--secret",
  "--token",
  "--service-role-key",
] as const;

export const TEAM_ADMIN_COMMANDS = [
  "create",
  "reset-password",
  "activate",
  "deactivate",
  "sessions",
  "revoke-session",
  "revoke-all-sessions",
  "help",
] as const;

export type TeamAdminCommand = (typeof TEAM_ADMIN_COMMANDS)[number];

export interface ParsedTeamAdminCliArgs {
  command: TeamAdminCommand;
  contingentCode?: string;
  sessionId?: string;
  actorEmail?: string;
  assumeYes: boolean;
}

export function sanitizeSecretOutput(message: string): string {
  return message
    .replace(
      /team-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@team\.virtuoso\.invalid/gi,
      "[redacted-internal-identity]",
    )
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted-token]")
    .replace(
      /team-[0-9a-f-]+@[a-z0-9.-]*virtuoso\.invalid/gi,
      "[redacted-internal-identity]",
    );
}

export function validateTeamCodeForAdmin(rawCode: string):
  | { ok: true; contingentCode: string }
  | { ok: false; error: string } {
  const normalized = normalizeTeamCodeInput(rawCode);
  if (normalized.length < 2 || normalized.length > 40) {
    return {
      ok: false,
      error: "Contingent code must be between 2 and 40 characters.",
    };
  }
  return { ok: true, contingentCode: normalized };
}

export function validateTeamPasswordChoice(
  rawPassword: string,
  rawConfirmPassword: string,
):
  | { ok: true; password: string }
  | { ok: false; error: string } {
  if (!rawPassword) {
    return { ok: false, error: "Password is required." };
  }
  if (rawPassword.length < 10) {
    return {
      ok: false,
      error: "Team password must be at least 10 characters.",
    };
  }
  if (rawPassword.length > 128) {
    return {
      ok: false,
      error: "Team password must be 128 characters or fewer.",
    };
  }
  if (rawPassword !== rawConfirmPassword) {
    return {
      ok: false,
      error: "Passwords do not match.",
    };
  }
  return { ok: true, password: rawPassword };
}

export function parseTeamAdminCliArgs(
  argv: readonly string[],
):
  | { ok: true; value: ParsedTeamAdminCliArgs }
  | { ok: false; error: string } {
  for (const arg of argv) {
    const flagName = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
    const lowerFlag = flagName.toLowerCase();
    if (
      (FORBIDDEN_CLI_SECRET_FLAGS as readonly string[]).includes(lowerFlag) ||
      lowerFlag.includes("password")
    ) {
      return {
        ok: false,
        error:
          "Do not pass passwords or secrets as command-line arguments. Sensitive values must be entered only at the interactive hidden prompt or read from .env.local.",
      };
    }
  }

  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h" || argv[0] === "help") {
    return {
      ok: true,
      value: {
        command: "help",
        assumeYes: false,
      },
    };
  }

  const rawCommand = argv[0];
  if (!(TEAM_ADMIN_COMMANDS as readonly string[]).includes(rawCommand)) {
    return {
      ok: false,
      error: `Unknown command "${rawCommand}". Run with "help" to see supported commands.`,
    };
  }

  const command = rawCommand as TeamAdminCommand;
  const positional: string[] = [];
  let actorEmail: string | undefined;
  let assumeYes = false;

  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--yes" || token === "-y") {
      assumeYes = true;
      continue;
    }

    if (token === "--actor") {
      const nextToken = argv[i + 1];
      if (!nextToken || nextToken.startsWith("-")) {
        return {
          ok: false,
          error: "Provide an email address after --actor.",
        };
      }
      const emailCheck = validateEmailInput(nextToken);
      if (!emailCheck.ok) {
        return { ok: false, error: emailCheck.error };
      }
      actorEmail = emailCheck.value;
      i += 1;
      continue;
    }

    if (token.startsWith("--actor=")) {
      const emailCheck = validateEmailInput(token.slice("--actor=".length));
      if (!emailCheck.ok) {
        return { ok: false, error: emailCheck.error };
      }
      actorEmail = emailCheck.value;
      continue;
    }

    if (token.startsWith("-")) {
      return {
        ok: false,
        error: `Unsupported flag "${token}". Run with "help" to see supported options.`,
      };
    }

    positional.push(token);
  }

  if (positional.length === 0) {
    return {
      ok: false,
      error: `Command "${command}" requires a contingent code.`,
    };
  }

  const codeCheck = validateTeamCodeForAdmin(positional[0]);
  if (!codeCheck.ok) {
    return { ok: false, error: codeCheck.error };
  }

  if (command === "revoke-session") {
    if (positional.length > 2) {
      return {
        ok: false,
        error:
          "Too many positional arguments. Usage: revoke-session <CONTINGENT_CODE> [TEAM_SESSION_ID]",
      };
    }
    const rawSessionId = positional[1];
    if (rawSessionId && !isValidUuid(rawSessionId)) {
      return {
        ok: false,
        error: "Session ID must be a valid Virtuoso team session UUID.",
      };
    }
    return {
      ok: true,
      value: {
        command,
        contingentCode: codeCheck.contingentCode,
        sessionId: rawSessionId?.trim().toLowerCase(),
        actorEmail,
        assumeYes,
      },
    };
  }

  if (positional.length > 1) {
    return {
      ok: false,
      error: `Command "${command}" accepts only one contingent code argument.`,
    };
  }

  return {
    ok: true,
    value: {
      command,
      contingentCode: codeCheck.contingentCode,
      actorEmail,
      assumeYes,
    },
  };
}

export interface SuperAdminActorProfile {
  id: string;
  email: string;
  role: "super_admin" | "event_coordinator";
  is_active: boolean;
}

export interface VerifiedSuperAdminOperator {
  id: string;
  email: string;
}

export type AuthenticateSuperAdminResult =
  | { ok: true; operator: VerifiedSuperAdminOperator }
  | { ok: false; error: string };

export interface SuperAdminOperatorAuthDeps {
  signInWithPassword: (credentials: {
    email: string;
    password: string;
  }) => Promise<{
    userId: string | null;
    email: string | null;
    error: string | null;
  }>;
  getOwnProfile: (userId: string) => Promise<{
    profile: SuperAdminActorProfile | null;
    error: string | null;
  }>;
  signOutLocal: () => Promise<{ error: string | null }>;
}

/**
 * Authenticates the human CLI operator against their real organiser Supabase
 * Auth account (via the public/anon Supabase client, never service_role),
 * verifies active Super Admin status from their own RLS-scoped profile, and
 * clears the temporary Auth session immediately if authorisation fails.
 */
export async function authenticateSuperAdminOperatorWithDeps(params: {
  rawOperatorEmail: string;
  rawOperatorPassword: string;
  deps: SuperAdminOperatorAuthDeps;
}): Promise<AuthenticateSuperAdminResult> {
  const emailCheck = validateEmailInput(params.rawOperatorEmail);
  if (!emailCheck.ok) {
    return { ok: false, error: emailCheck.error };
  }

  if (!params.rawOperatorPassword) {
    return { ok: false, error: "Super Admin password is required." };
  }

  const signInRes = await params.deps.signInWithPassword({
    email: emailCheck.value,
    password: params.rawOperatorPassword,
  });

  if (signInRes.error || !signInRes.userId || !isValidUuid(signInRes.userId)) {
    return {
      ok: false,
      error: sanitizeSecretOutput(
        signInRes.error
          ? `Super Admin authentication failed: ${signInRes.error}`
          : "Super Admin authentication failed.",
      ),
    };
  }

  const cleanupSession = async () => {
    try {
      await params.deps.signOutLocal();
    } catch {
      // Preserve explicit authorisation denial error
    }
  };

  const profileRes = await params.deps.getOwnProfile(signInRes.userId);
  if (profileRes.error) {
    await cleanupSession();
    return {
      ok: false,
      error: sanitizeSecretOutput(
        `Unable to verify Super Admin profile: ${profileRes.error}`,
      ),
    };
  }

  const profile = profileRes.profile;
  if (!profile) {
    await cleanupSession();
    return {
      ok: false,
      error:
        "Access denied: this Auth account does not have an active Super Admin organiser profile.",
    };
  }

  if (profile.role !== "super_admin") {
    await cleanupSession();
    return {
      ok: false,
      error:
        "Access denied: Event Coordinators cannot perform team account operations. An active Super Admin is required.",
    };
  }

  if (!profile.is_active) {
    await cleanupSession();
    return {
      ok: false,
      error: "Access denied: this Super Admin profile is inactive.",
    };
  }

  return {
    ok: true,
    operator: {
      id: profile.id,
      email: profile.email,
    },
  };
}

export function commandRequiresServiceRole(command: TeamAdminCommand): boolean {
  return command === "create" || command === "reset-password";
}

export interface CreateTeamAccountDeps {
  generateUuid: () => string;
  preflightCreateTeamAccount: (params: {
    contingentCode: string;
  }) => Promise<{
    contingent: {
      contingent_id: string;
      contingent_code: string;
      contingent_name: string;
      institution_name: string;
    } | null;
    error: string | null;
  }>;
  createAuthUser: (params: {
    email: string;
    password: string;
  }) => Promise<{ authUserId: string | null; error: string | null }>;
  insertTeamAccountRecord: (params: {
    teamAccountId: string;
    contingentId: string;
    authUserId: string;
  }) => Promise<{
    created: {
      team_account_id: string;
      contingent_id: string;
      contingent_code: string;
      contingent_name: string;
      auth_user_id: string;
      is_active: boolean;
      created_at: string;
    } | null;
    error: string | null;
  }>;
  deleteAuthUser?: (
    authUserId: string,
  ) => Promise<{ error: string | null }>;
}

export type CreateTeamAccountResult =
  | {
      ok: true;
      contingentCode: string;
      contingentName: string;
      institutionName: string;
      isActive: true;
      createdAt: string;
      actorEmail: string;
    }
  | {
      ok: false;
      error: string;
      reconciliationRequired?: boolean;
    };

function redactCreationSensitiveValues(
  message: string,
  values: {
    password?: string;
    teamAccountId?: string;
    authUserId?: string;
  },
): string {
  let safe = sanitizeSecretOutput(message);
  if (values.password) {
    safe = safe.split(values.password).join("[redacted-secret]");
  }
  if (values.teamAccountId) {
    safe = safe.replace(
      new RegExp(
        values.teamAccountId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "gi",
      ),
      "[redacted-id]",
    );
  }
  if (values.authUserId) {
    safe = safe.replace(
      new RegExp(
        values.authUserId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "gi",
      ),
      "[redacted-id]",
    );
  }
  return safe;
}

export async function createTeamAccountWithDeps(params: {
  operator: VerifiedSuperAdminOperator;
  rawContingentCode: string;
  rawPassword: string;
  rawConfirmPassword: string;
  deps: CreateTeamAccountDeps;
}): Promise<CreateTeamAccountResult> {
  const codeCheck = validateTeamCodeForAdmin(params.rawContingentCode);
  if (!codeCheck.ok) {
    return { ok: false, error: codeCheck.error };
  }

  const passwordCheck = validateTeamPasswordChoice(
    params.rawPassword,
    params.rawConfirmPassword,
  );
  if (!passwordCheck.ok) {
    return { ok: false, error: passwordCheck.error };
  }

  const preflight = await params.deps.preflightCreateTeamAccount({
    contingentCode: codeCheck.contingentCode,
  });
  if (preflight.error || !preflight.contingent) {
    return {
      ok: false,
      error: redactCreationSensitiveValues(
        preflight.error ?? "Unable to verify contingent eligibility.",
        { password: passwordCheck.password },
      ),
    };
  }

  const teamAccountId = params.deps.generateUuid().trim().toLowerCase();
  if (!isValidUuid(teamAccountId)) {
    return {
      ok: false,
      error: "Generated team account identifier was not a valid UUID.",
    };
  }

  const syntheticEmail = buildTeamSyntheticEmail(teamAccountId);
  if (!syntheticEmail.endsWith(`@${TEAM_SYNTHETIC_EMAIL_DOMAIN}`)) {
    return { ok: false, error: "Invalid internal team identity format." };
  }

  const authCreate = await params.deps.createAuthUser({
    email: syntheticEmail,
    password: passwordCheck.password,
  });
  if (
    authCreate.error ||
    !authCreate.authUserId ||
    !isValidUuid(authCreate.authUserId)
  ) {
    return {
      ok: false,
      error: redactCreationSensitiveValues(
        authCreate.error
          ? `Unable to create Auth login: ${authCreate.error}`
          : "Unable to create Auth login for this team.",
        {
          password: passwordCheck.password,
          teamAccountId,
        },
      ),
    };
  }

  const authUserId = authCreate.authUserId.trim().toLowerCase();
  const expectedContingentId = preflight.contingent.contingent_id
    .trim()
    .toLowerCase();

  const attemptInsert = async () => {
    try {
      return await params.deps.insertTeamAccountRecord({
        teamAccountId,
        contingentId: preflight.contingent!.contingent_id,
        authUserId,
      });
    } catch (err) {
      return {
        created: null,
        error:
          err instanceof Error
            ? err.message
            : "Database confirmation failed unexpectedly.",
      };
    }
  };

  let dbInsert = await attemptInsert();

  // If attempt 1 returned an error or an uncertain/incomplete record,
  // retry the exact same idempotent RPC once. Never delete the Auth user
  // after an uncertain database result because attempt 1 may have committed.
  if (dbInsert.error || !dbInsert.created) {
    dbInsert = await attemptInsert();
  }

  if (dbInsert.error || !dbInsert.created) {
    const baseError = redactCreationSensitiveValues(
      dbInsert.error ?? "Failed to confirm team account database record.",
      {
        password: passwordCheck.password,
        teamAccountId,
        authUserId,
      },
    );

    return {
      ok: false,
      reconciliationRequired: true,
      error: `${baseError} Team account confirmation remained uncertain after idempotent retry; Auth user was preserved. Reconcile database and Auth state for contingent ${preflight.contingent.contingent_code} before retrying.`,
    };
  }

  const returnedTeamAccountId =
    typeof dbInsert.created.team_account_id === "string"
      ? dbInsert.created.team_account_id.trim().toLowerCase()
      : "";
  const returnedAuthUserId =
    typeof dbInsert.created.auth_user_id === "string"
      ? dbInsert.created.auth_user_id.trim().toLowerCase()
      : "";
  const returnedContingentId =
    typeof dbInsert.created.contingent_id === "string"
      ? dbInsert.created.contingent_id.trim().toLowerCase()
      : "";

  if (
    returnedTeamAccountId !== teamAccountId ||
    returnedAuthUserId !== authUserId ||
    returnedContingentId !== expectedContingentId
  ) {
    return {
      ok: false,
      reconciliationRequired: true,
      error: `Database returned mismatched account identifiers for contingent ${preflight.contingent.contingent_code}. Auth user was preserved; operator reconciliation is required.`,
    };
  }

  if (dbInsert.created.is_active !== true) {
    return {
      ok: false,
      reconciliationRequired: true,
      error: `Matching team account for contingent ${preflight.contingent.contingent_code} is inactive, so active account creation could not be confirmed. Auth user was preserved; inspect account status before distributing credentials.`,
    };
  }

  return {
    ok: true,
    contingentCode: dbInsert.created.contingent_code,
    contingentName: dbInsert.created.contingent_name,
    institutionName: preflight.contingent.institution_name,
    isActive: true,
    createdAt: dbInsert.created.created_at,
    actorEmail: params.operator.email,
  };
}

export interface ResetTeamPasswordDeps {
  resolveActiveTeamAccount: (params: {
    contingentCode: string;
  }) => Promise<{
    account: {
      team_account_id: string;
      contingent_id: string;
      contingent_code: string;
      contingent_name: string;
      auth_user_id: string;
    } | null;
    error: string | null;
  }>;
  updateAuthUserPassword: (params: {
    authUserId: string;
    password: string;
  }) => Promise<{ error: string | null }>;
  recordPasswordResetAudit: (params: {
    contingentCode: string;
    teamAccountId: string;
  }) => Promise<{ error: string | null }>;
}

export type ResetTeamPasswordResult =
  | {
      ok: true;
      contingentCode: string;
      contingentName: string;
      actorEmail: string;
    }
  | {
      ok: false;
      error: string;
      passwordUpdated?: boolean;
      auditFailed?: boolean;
    };

export async function resetTeamPasswordWithDeps(params: {
  operator: VerifiedSuperAdminOperator;
  rawContingentCode: string;
  rawNewPassword: string;
  rawConfirmPassword: string;
  deps: ResetTeamPasswordDeps;
}): Promise<ResetTeamPasswordResult> {
  const codeCheck = validateTeamCodeForAdmin(params.rawContingentCode);
  if (!codeCheck.ok) {
    return { ok: false, error: codeCheck.error };
  }

  const passwordCheck = validateTeamPasswordChoice(
    params.rawNewPassword,
    params.rawConfirmPassword,
  );
  if (!passwordCheck.ok) {
    return { ok: false, error: passwordCheck.error };
  }

  const resolved = await params.deps.resolveActiveTeamAccount({
    contingentCode: codeCheck.contingentCode,
  });
  if (resolved.error || !resolved.account) {
    return {
      ok: false,
      error: sanitizeSecretOutput(
        resolved.error ?? "Active team account could not be resolved.",
      ),
    };
  }

  const authUpdate = await params.deps.updateAuthUserPassword({
    authUserId: resolved.account.auth_user_id,
    password: passwordCheck.password,
  });
  if (authUpdate.error) {
    return {
      ok: false,
      error: sanitizeSecretOutput(
        `Unable to update team password: ${authUpdate.error}`,
      ),
    };
  }

  const auditRes = await params.deps.recordPasswordResetAudit({
    contingentCode: resolved.account.contingent_code,
    teamAccountId: resolved.account.team_account_id,
  });

  if (auditRes.error) {
    return {
      ok: false,
      passwordUpdated: true,
      auditFailed: true,
      error: sanitizeSecretOutput(
        `Password was updated for ${resolved.account.contingent_code}, but audit logging failed: ${auditRes.error}`,
      ),
    };
  }

  return {
    ok: true,
    contingentCode: resolved.account.contingent_code,
    contingentName: resolved.account.contingent_name,
    actorEmail: params.operator.email,
  };
}

export interface SetTeamAccountActiveDeps {
  setTeamAccountActiveRpc: (params: {
    contingentCode: string;
    nextIsActive: boolean;
  }) => Promise<{
    result: {
      operation:
        | "activated"
        | "deactivated"
        | "already_active"
        | "already_inactive";
      contingent_code: string;
      contingent_is_active: boolean;
      is_active: boolean;
      revoked_session_count: number;
    } | null;
    error: string | null;
  }>;
}

export type SetTeamAccountActiveResult =
  | {
      ok: true;
      operation:
        | "activated"
        | "deactivated"
        | "already_active"
        | "already_inactive";
      contingentCode: string;
      contingentIsActive: boolean;
      isActive: boolean;
      revokedSessionCount: number;
      actorEmail: string;
    }
  | { ok: false; error: string };

export async function setTeamAccountActiveWithDeps(params: {
  operator: VerifiedSuperAdminOperator;
  rawContingentCode: string;
  nextIsActive: boolean;
  deps: SetTeamAccountActiveDeps;
}): Promise<SetTeamAccountActiveResult> {
  const codeCheck = validateTeamCodeForAdmin(params.rawContingentCode);
  if (!codeCheck.ok) {
    return { ok: false, error: codeCheck.error };
  }

  const rpcRes = await params.deps.setTeamAccountActiveRpc({
    contingentCode: codeCheck.contingentCode,
    nextIsActive: params.nextIsActive,
  });

  if (rpcRes.error || !rpcRes.result) {
    return {
      ok: false,
      error: sanitizeSecretOutput(
        rpcRes.error ?? "Unable to update team account status.",
      ),
    };
  }

  return {
    ok: true,
    operation: rpcRes.result.operation,
    contingentCode: rpcRes.result.contingent_code,
    contingentIsActive: rpcRes.result.contingent_is_active,
    isActive: rpcRes.result.is_active,
    revokedSessionCount: rpcRes.result.revoked_session_count,
    actorEmail: params.operator.email,
  };
}

export interface SanitizedTeamSessionSummary {
  sessionId: string;
  createdAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
  revokedReason: TeamSessionRevocationReason | null;
  isActive: boolean;
}

export interface ListTeamSessionsDeps {
  listTeamSessionsRpc: (params: {
    contingentCode: string;
  }) => Promise<{
    data: {
      contingent_code: string;
      contingent_name: string;
      contingent_is_active: boolean;
      team_account_is_active: boolean;
      sessions: Array<{
        session_id: string;
        created_at: string;
        last_seen_at: string;
        revoked_at: string | null;
        revoked_reason: TeamSessionRevocationReason | null;
        is_active: boolean;
      }>;
    } | null;
    error: string | null;
  }>;
}

export type ListTeamSessionsResult =
  | {
      ok: true;
      contingentCode: string;
      contingentName: string;
      contingentIsActive: boolean;
      teamAccountIsActive: boolean;
      sessions: SanitizedTeamSessionSummary[];
    }
  | { ok: false; error: string };

export async function listTeamSessionsWithDeps(params: {
  operator: VerifiedSuperAdminOperator;
  rawContingentCode: string;
  deps: ListTeamSessionsDeps;
}): Promise<ListTeamSessionsResult> {
  const codeCheck = validateTeamCodeForAdmin(params.rawContingentCode);
  if (!codeCheck.ok) {
    return { ok: false, error: codeCheck.error };
  }

  // Ensures verified operator context is present before querying
  if (!isValidUuid(params.operator.id)) {
    return { ok: false, error: "Authenticated Super Admin session is required." };
  }

  const rpcRes = await params.deps.listTeamSessionsRpc({
    contingentCode: codeCheck.contingentCode,
  });

  if (rpcRes.error || !rpcRes.data) {
    return {
      ok: false,
      error: sanitizeSecretOutput(
        rpcRes.error ?? "Unable to list team sessions.",
      ),
    };
  }

  // Whitelist strictly safe display fields so raw supabase_session_id,
  // auth_user_id, JWTs, or synthetic emails can never pass through.
  const sanitizedSessions: SanitizedTeamSessionSummary[] =
    rpcRes.data.sessions.map((s) => ({
      sessionId: s.session_id,
      createdAt: s.created_at,
      lastSeenAt: s.last_seen_at,
      revokedAt: s.revoked_at,
      revokedReason: s.revoked_reason,
      isActive: Boolean(s.is_active),
    }));

  return {
    ok: true,
    contingentCode: rpcRes.data.contingent_code,
    contingentName: rpcRes.data.contingent_name,
    contingentIsActive: Boolean(rpcRes.data.contingent_is_active),
    teamAccountIsActive: Boolean(rpcRes.data.team_account_is_active),
    sessions: sanitizedSessions,
  };
}

export interface RevokeTeamSessionDeps {
  revokeTeamSessionRpc: (params: {
    contingentCode: string;
    teamSessionId: string;
  }) => Promise<{
    data: {
      operation: "revoked" | "already_revoked";
      revoked: boolean;
      session_id: string;
      contingent_code: string;
      revoked_at: string;
      revoked_reason: TeamSessionRevocationReason | null;
    } | null;
    error: string | null;
  }>;
}

export type RevokeTeamSessionResult =
  | {
      ok: true;
      operation: "revoked" | "already_revoked";
      revoked: boolean;
      sessionId: string;
      contingentCode: string;
      revokedAt: string;
      revokedReason: TeamSessionRevocationReason | null;
      actorEmail: string;
    }
  | { ok: false; error: string };

export async function revokeTeamSessionWithDeps(params: {
  operator: VerifiedSuperAdminOperator;
  rawContingentCode: string;
  rawSessionId: string;
  deps: RevokeTeamSessionDeps;
}): Promise<RevokeTeamSessionResult> {
  const codeCheck = validateTeamCodeForAdmin(params.rawContingentCode);
  if (!codeCheck.ok) {
    return { ok: false, error: codeCheck.error };
  }

  const sessionId = params.rawSessionId.trim().toLowerCase();
  if (!isValidUuid(sessionId)) {
    return {
      ok: false,
      error: "Session ID must be a valid Virtuoso team session UUID.",
    };
  }

  const rpcRes = await params.deps.revokeTeamSessionRpc({
    contingentCode: codeCheck.contingentCode,
    teamSessionId: sessionId,
  });

  if (rpcRes.error || !rpcRes.data) {
    return {
      ok: false,
      error: sanitizeSecretOutput(
        rpcRes.error ?? "Unable to revoke team session.",
      ),
    };
  }

  return {
    ok: true,
    operation: rpcRes.data.operation,
    revoked: Boolean(rpcRes.data.revoked),
    sessionId: rpcRes.data.session_id,
    contingentCode: rpcRes.data.contingent_code,
    revokedAt: rpcRes.data.revoked_at,
    revokedReason: rpcRes.data.revoked_reason,
    actorEmail: params.operator.email,
  };
}

export interface RevokeAllTeamSessionsDeps {
  revokeAllTeamSessionsRpc: (params: {
    contingentCode: string;
  }) => Promise<{
    data: {
      operation: "revoked_all" | "none_active";
      revoked_count: number;
      revoked_session_ids: string[];
      contingent_code: string;
    } | null;
    error: string | null;
  }>;
}

export type RevokeAllTeamSessionsResult =
  | {
      ok: true;
      operation: "revoked_all" | "none_active";
      revokedCount: number;
      revokedSessionIds: string[];
      contingentCode: string;
      actorEmail: string;
    }
  | { ok: false; error: string };

export async function revokeAllTeamSessionsWithDeps(params: {
  operator: VerifiedSuperAdminOperator;
  rawContingentCode: string;
  deps: RevokeAllTeamSessionsDeps;
}): Promise<RevokeAllTeamSessionsResult> {
  const codeCheck = validateTeamCodeForAdmin(params.rawContingentCode);
  if (!codeCheck.ok) {
    return { ok: false, error: codeCheck.error };
  }

  const rpcRes = await params.deps.revokeAllTeamSessionsRpc({
    contingentCode: codeCheck.contingentCode,
  });

  if (rpcRes.error || !rpcRes.data) {
    return {
      ok: false,
      error: sanitizeSecretOutput(
        rpcRes.error ?? "Unable to revoke team sessions.",
      ),
    };
  }

  return {
    ok: true,
    operation: rpcRes.data.operation,
    revokedCount: rpcRes.data.revoked_count,
    revokedSessionIds: [...rpcRes.data.revoked_session_ids],
    contingentCode: rpcRes.data.contingent_code,
    actorEmail: params.operator.email,
  };
}
