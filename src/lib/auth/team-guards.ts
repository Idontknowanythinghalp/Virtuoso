import "server-only";
import { redirect } from "next/navigation";
import { isPublicSupabaseConfigured } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminSupabaseConfigured } from "@/lib/supabase/server-env";
import {
  assertLocalSignOutResult,
  authenticateTeamWithDeps,
  buildTeamLoginRedirectPath,
  escapePostgresLikePattern,
  isMissingAuthSessionError,
  logoutTeamWithDeps,
  resolveActiveTeamSessionWithDeps,
  sanitizeTeamRedirectPath,
  type TeamAccountLookupRow,
  type TeamContingentLookupRow,
  type TeamContingentSummaryRow,
  type TeamLoginOutcome,
  type TeamLogoutOutcome,
} from "@/lib/auth/team-account-rules";
import type {
  ActiveTeamSession,
  TeamSessionRegistrationResult,
} from "@/types/team-auth";

export class TeamAuthError extends Error {
  readonly code:
    | "config"
    | "unauthenticated"
    | "organiser_forbidden"
    | "invalid_team_session";
  readonly status: number;

  constructor(
    message: string,
    code:
      | "config"
      | "unauthenticated"
      | "organiser_forbidden"
      | "invalid_team_session",
    status: number,
  ) {
    super(message);
    this.name = "TeamAuthError";
    this.code = code;
    this.status = status;
  }
}

export async function signInTeamWithPassword(
  rawTeamCode: string,
  rawPassword: string,
  rawNextPath?: string | null,
): Promise<TeamLoginOutcome> {
  if (!isPublicSupabaseConfigured() || !isAdminSupabaseConfigured()) {
    return {
      ok: false,
      error:
        "Team authentication is not configured on the server. Contact an organiser.",
    };
  }

  const admin = createSupabaseAdminClient();
  const supabase = await createSupabaseServerClient();

  return authenticateTeamWithDeps({
    rawTeamCode,
    rawPassword,
    rawNextPath,
    deps: {
      async hasCurrentOrganiserSession() {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError) {
          if (isMissingAuthSessionError(userError)) {
            return { isOrganiser: false, error: null };
          }
          console.error(
            "[team-auth] current session user check failed:",
            userError.message,
          );
          return { isOrganiser: false, error: userError.message };
        }
        if (!user) {
          return { isOrganiser: false, error: null };
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", user.id)
          .maybeSingle<{ id: string }>();

        if (profileError) {
          console.error("[team-auth] current session organiser check failed");
          return { isOrganiser: false, error: profileError.message };
        }

        return { isOrganiser: Boolean(profile?.id), error: null };
      },

      async findContingentsByCode(normalizedTeamCode: string) {
        const pattern = escapePostgresLikePattern(normalizedTeamCode);
        const { data, error } = await admin
          .from("contingents")
          .select("id, contingent_code, is_active")
          .ilike("contingent_code", pattern)
          .limit(5);

        if (error) {
          console.error("[team-auth] contingent lookup failed");
          return { rows: [], error: error.message };
        }

        return {
          rows: (data ?? []) as TeamContingentLookupRow[],
          error: null,
        };
      },

      async findTeamAccountByContingentId(contingentId: string) {
        const { data, error } = await admin
          .from("team_accounts")
          .select("id, contingent_id, auth_user_id, is_active")
          .eq("contingent_id", contingentId)
          .maybeSingle<TeamAccountLookupRow>();

        if (error) {
          console.error("[team-auth] team account lookup failed");
          return { row: null, error: error.message };
        }

        return { row: data ?? null, error: null };
      },

      async hasOrganiserProfileByUserId(userId: string) {
        const { data, error } = await admin
          .from("profiles")
          .select("id")
          .eq("id", userId)
          .maybeSingle<{ id: string }>();

        if (error) {
          console.error("[team-auth] profile separation check failed");
          return { exists: false, error: error.message };
        }

        return { exists: Boolean(data?.id), error: null };
      },

      async signInWithPassword({ email, password }) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error || !data.user) {
          return {
            userId: null,
            error: error?.message ?? "Authentication failed",
          };
        }

        return {
          userId: data.user.id,
          error: null,
        };
      },

      async registerTeamSession() {
        const { data, error } = await supabase.rpc("register_team_session");
        if (error || !data) {
          return {
            contingentId: null,
            error: error?.message ?? "Failed to register team session",
          };
        }

        const parsed = data as Partial<TeamSessionRegistrationResult>;
        return {
          contingentId:
            typeof parsed.contingent_id === "string"
              ? parsed.contingent_id
              : null,
          error: null,
        };
      },

      async signOutLocal() {
        const signOutResult = await supabase.auth.signOut({ scope: "local" });
        if (signOutResult.error) {
          console.error("[team-auth] local sign-out cleanup failed");
        }
        assertLocalSignOutResult(signOutResult);
      },
    },
  });
}

export async function logoutCurrentTeamSession(): Promise<TeamLogoutOutcome> {
  if (!isPublicSupabaseConfigured()) {
    return {
      ok: true,
      revokedInDatabase: true,
      localSignOutSucceeded: true,
    };
  }

  const supabase = await createSupabaseServerClient();

  return logoutTeamWithDeps({
    async getAuthUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return { userId: user?.id ?? null };
    },

    async hasOwnOrganiserProfile(userId: string) {
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle<{ id: string }>();

      if (error) {
        console.error("[team-auth] organiser profile check failed during logout");
        return { exists: false, error: error.message };
      }

      return { exists: Boolean(data?.id), error: null };
    },

    async revokeCurrentTeamSession() {
      const { error } = await supabase.rpc("revoke_current_team_session");
      return { error: error?.message ?? null };
    },

    onRevocationError() {
      console.error("[team-auth] database session revocation failed during logout");
    },

    async signOutLocal() {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) {
        console.error("[team-auth] local sign-out failed during logout");
        return { error: error.message };
      }
      return { error: null };
    },
  });
}

export type CurrentTeamContextResult =
  | { ok: true; teamSession: ActiveTeamSession }
  | {
      ok: false;
      reason:
        | "config"
        | "unauthenticated"
        | "organiser_forbidden"
        | "invalid_team_session";
    };

export async function resolveCurrentTeamContext(): Promise<CurrentTeamContextResult> {
  if (!isPublicSupabaseConfigured() || !isAdminSupabaseConfigured()) {
    return { ok: false, reason: "config" };
  }

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  return resolveActiveTeamSessionWithDeps({
    async getAuthUser() {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        return { userId: null, error: error?.message ?? "Unauthenticated" };
      }
      return { userId: user.id, error: null };
    },

    async hasOwnOrganiserProfile(userId: string) {
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle<{ id: string }>();

      if (error) {
        return { exists: false, error: error.message };
      }
      return { exists: Boolean(data?.id), error: null };
    },

    async checkIsActiveTeamSession() {
      const { data, error } = await supabase.rpc("is_active_team_session");
      if (error) {
        return { active: false, error: error.message };
      }
      return { active: data === true, error: null };
    },

    async getCurrentTeamContingentId() {
      const { data, error } = await supabase.rpc("current_team_contingent_id");
      if (error || typeof data !== "string") {
        return {
          contingentId: null,
          error: error?.message ?? "No active contingent session",
        };
      }
      return { contingentId: data, error: null };
    },

    async verifyActiveTeamAccountForSession({ contingentId, authUserId }) {
      const { data, error } = await admin
        .from("team_accounts")
        .select("id, is_active")
        .eq("contingent_id", contingentId)
        .eq("auth_user_id", authUserId)
        .eq("is_active", true)
        .maybeSingle<{ id: string; is_active: boolean }>();

      if (error) {
        return { active: false, error: error.message };
      }
      return { active: Boolean(data?.id && data.is_active), error: null };
    },

    async findActiveContingentSummary(contingentId: string) {
      const { data, error } = await admin
        .from("contingents")
        .select("id, contingent_code, name, institution_name, is_active")
        .eq("id", contingentId)
        .eq("is_active", true)
        .maybeSingle<TeamContingentSummaryRow>();

      if (error) {
        return { contingent: null, error: error.message };
      }
      return { contingent: data ?? null, error: null };
    },
  });
}

/**
 * Authoritative server-side guard for team Server Components/Pages.
 * Verifies Supabase Auth, ensures the caller is not an organiser, checks
 * is_active_team_session() + current_team_contingent_id() on Postgres, and
 * never trusts client-supplied contingent or account identifiers.
 */
export async function requireActiveTeam(options?: {
  nextPath?: string;
}): Promise<ActiveTeamSession> {
  const result = await resolveCurrentTeamContext();

  if (result.ok) {
    return result.teamSession;
  }

  if (result.reason === "config") {
    redirect("/team/login?error=config");
  }

  if (result.reason === "organiser_forbidden") {
    redirect("/team/login?error=organiser_account");
  }

  const safeNext = sanitizeTeamRedirectPath(options?.nextPath, "/team");

  if (result.reason === "invalid_team_session") {
    redirect(
      buildTeamLoginRedirectPath({
        error: "session_ended",
        nextPath: safeNext,
      }),
    );
  }

  redirect(buildTeamLoginRedirectPath({ nextPath: safeNext }));
}

/**
 * Authoritative server-side guard for team Server Actions and Route Handlers.
 * Throws TeamAuthError instead of returning HTTP redirects.
 */
export async function requireActiveTeamForAction(): Promise<ActiveTeamSession> {
  const result = await resolveCurrentTeamContext();

  if (result.ok) {
    return result.teamSession;
  }

  if (result.reason === "config") {
    throw new TeamAuthError(
      "Team authentication is not configured on the server.",
      "config",
      503,
    );
  }

  if (result.reason === "organiser_forbidden") {
    throw new TeamAuthError(
      "Organiser accounts cannot access team actions.",
      "organiser_forbidden",
      403,
    );
  }

  if (result.reason === "invalid_team_session") {
    throw new TeamAuthError(
      "Your team session is no longer active. Please sign in again.",
      "invalid_team_session",
      401,
    );
  }

  throw new TeamAuthError(
    "Team authentication is required. Please sign in again.",
    "unauthenticated",
    401,
  );
}
