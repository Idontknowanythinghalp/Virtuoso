"use server";

import { revalidatePath } from "next/cache";
import {
  OrganiserAuthError,
  requireActiveUserForAction,
} from "@/lib/auth/guards";
import { SUPER_ADMIN_ONLY } from "@/lib/auth/policy";
import {
  revokeAllTeamSessionsWithDeps,
  revokeTeamSessionWithDeps,
  sanitizeSecretOutput,
} from "@/lib/auth/team-account-admin";
import { revokeAllTeamsSessionsWithDeps } from "@/lib/auth/team-session-management";
import {
  fetchTeamSessionDetails,
  fetchTeamSessionOverviews,
} from "@/lib/auth/team-sessions-read";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  TeamSessionDetailsPayload,
  TeamSessionOverviewPayload,
} from "@/types/team-auth";

export interface TeamSessionMutationActionResult {
  ok: boolean;
  message: string;
  overview?: TeamSessionOverviewPayload;
  details?: TeamSessionDetailsPayload | null;
}

export async function inspectTeamSessionsAction(
  rawContingentCode: string,
): Promise<
  | { ok: true; details: TeamSessionDetailsPayload }
  | { ok: false; error: string }
> {
  try {
    await requireActiveUserForAction(SUPER_ADMIN_ONLY, {
      actionName: "team_session.inspect",
    });

    const result = await fetchTeamSessionDetails(rawContingentCode);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    return { ok: true, details: result.data };
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, error: err.message };
    }
    return {
      ok: false,
      error: sanitizeSecretOutput(
        err instanceof Error
          ? err.message
          : "Unable to inspect team sessions right now.",
      ),
    };
  }
}

export async function refreshTeamSessionOverviewAction(): Promise<
  | { ok: true; overview: TeamSessionOverviewPayload }
  | { ok: false; error: string }
> {
  try {
    await requireActiveUserForAction(SUPER_ADMIN_ONLY, {
      actionName: "team_session.overview",
    });

    const result = await fetchTeamSessionOverviews();
    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    return { ok: true, overview: result.data };
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, error: err.message };
    }
    return {
      ok: false,
      error: sanitizeSecretOutput(
        err instanceof Error
          ? err.message
          : "Unable to refresh team session overview.",
      ),
    };
  }
}

export async function revokeSingleTeamSessionAction(params: {
  contingentCode: string;
  sessionId: string;
}): Promise<TeamSessionMutationActionResult> {
  try {
    const actor = await requireActiveUserForAction(SUPER_ADMIN_ONLY, {
      actionName: "team_session.revoke_single",
    });

    const supabase = await createSupabaseServerClient();

    const result = await revokeTeamSessionWithDeps({
      operator: {
        id: actor.userId,
        email: actor.profile.email,
      },
      rawContingentCode: params.contingentCode,
      rawSessionId: params.sessionId,
      deps: {
        async revokeTeamSessionRpc({ contingentCode, teamSessionId }) {
          const { data, error } = await supabase.rpc(
            "admin_revoke_team_session",
            {
              p_contingent_code: contingentCode,
              p_team_session_id: teamSessionId,
            },
          );
          return {
            data: data as {
              operation: "revoked" | "already_revoked";
              revoked: boolean;
              session_id: string;
              contingent_code: string;
              revoked_at: string;
              revoked_reason:
                | "logout"
                | "organiser_revoked"
                | "account_deactivated"
                | "contingent_deactivated"
                | "auth_session_expired"
                | null;
            } | null,
            error: error ? error.message : null,
          };
        },
      },
    });

    if (!result.ok) {
      return { ok: false, message: result.error };
    }

    revalidatePath("/admin/team-sessions");
    revalidatePath("/admin/audit-logs");

    const [overviewRes, detailsRes] = await Promise.all([
      fetchTeamSessionOverviews(),
      fetchTeamSessionDetails(result.contingentCode),
    ]);

    return {
      ok: true,
      message:
        result.operation === "revoked"
          ? `Revoked session ${result.sessionId} for ${result.contingentCode}. That device will be signed out on its next request.`
          : `Session ${result.sessionId} for ${result.contingentCode} was already revoked.`,
      overview: overviewRes.ok ? overviewRes.data : undefined,
      details: detailsRes.ok ? detailsRes.data : undefined,
    };
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    return {
      ok: false,
      message: sanitizeSecretOutput(
        err instanceof Error
          ? err.message
          : "Unexpected error while revoking team session.",
      ),
    };
  }
}

export async function revokeTeamAllDevicesAction(params: {
  contingentCode: string;
}): Promise<TeamSessionMutationActionResult> {
  try {
    const actor = await requireActiveUserForAction(SUPER_ADMIN_ONLY, {
      actionName: "team_session.revoke_team_all",
    });

    const supabase = await createSupabaseServerClient();

    const result = await revokeAllTeamSessionsWithDeps({
      operator: {
        id: actor.userId,
        email: actor.profile.email,
      },
      rawContingentCode: params.contingentCode,
      deps: {
        async revokeAllTeamSessionsRpc({ contingentCode }) {
          const { data, error } = await supabase.rpc(
            "admin_revoke_all_team_sessions",
            {
              p_contingent_code: contingentCode,
            },
          );
          return {
            data: data as {
              operation: "revoked_all" | "none_active";
              revoked_count: number;
              revoked_session_ids: string[];
              contingent_code: string;
            } | null,
            error: error ? error.message : null,
          };
        },
      },
    });

    if (!result.ok) {
      return { ok: false, message: result.error };
    }

    revalidatePath("/admin/team-sessions");
    revalidatePath("/admin/audit-logs");

    const [overviewRes, detailsRes] = await Promise.all([
      fetchTeamSessionOverviews(),
      fetchTeamSessionDetails(result.contingentCode),
    ]);

    return {
      ok: true,
      message:
        result.operation === "revoked_all"
          ? `Logged out ${result.revokedCount} active ${
              result.revokedCount === 1 ? "session" : "sessions"
            } for ${result.contingentCode}. Team credentials remain unchanged.`
          : `No active sessions were found for ${result.contingentCode}.`,
      overview: overviewRes.ok ? overviewRes.data : undefined,
      details: detailsRes.ok ? detailsRes.data : undefined,
    };
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    return {
      ok: false,
      message: sanitizeSecretOutput(
        err instanceof Error
          ? err.message
          : "Unexpected error while logging out team devices.",
      ),
    };
  }
}

export async function revokeAllTeamsGlobalAction(params: {
  confirmationText: string;
  selectedContingentCode?: string | null;
}): Promise<TeamSessionMutationActionResult> {
  try {
    const actor = await requireActiveUserForAction(SUPER_ADMIN_ONLY, {
      actionName: "team_session.revoke_global_all",
    });

    const supabase = await createSupabaseServerClient();

    const result = await revokeAllTeamsSessionsWithDeps({
      operator: {
        id: actor.userId,
        email: actor.profile.email,
      },
      rawConfirmationText: params.confirmationText,
      deps: {
        async revokeAllTeamsSessionsRpc() {
          const { data, error } = await supabase.rpc(
            "admin_revoke_all_teams_sessions",
          );
          return {
            data,
            error: error ? error.message : null,
          };
        },
      },
    });

    if (!result.ok) {
      return { ok: false, message: result.error };
    }

    revalidatePath("/admin/team-sessions");
    revalidatePath("/admin/audit-logs");

    const [overviewRes, detailsRes] = await Promise.all([
      fetchTeamSessionOverviews(),
      params.selectedContingentCode
        ? fetchTeamSessionDetails(params.selectedContingentCode)
        : Promise.resolve(null),
    ]);

    const message =
      result.operation === "revoked_all_teams"
        ? `Emergency global logout completed: revoked ${result.revokedCount} active ${
            result.revokedCount === 1 ? "session" : "sessions"
          } across ${result.affectedTeamCount} ${
            result.affectedTeamCount === 1 ? "team" : "teams"
          }.${
            result.expiredPrunedCount > 0
              ? ` (${result.expiredPrunedCount} already-expired stale ${
                  result.expiredPrunedCount === 1 ? "slot was" : "slots were"
                } also finalized.)`
              : ""
          }`
        : result.expiredPrunedCount > 0
          ? `No active team sessions were logged in (${result.expiredPrunedCount} stale expired ${
              result.expiredPrunedCount === 1 ? "slot was" : "slots were"
            } cleaned up).`
          : "No active team sessions were logged in across any team.";

    return {
      ok: true,
      message,
      overview: overviewRes.ok ? overviewRes.data : undefined,
      details: detailsRes && detailsRes.ok ? detailsRes.data : undefined,
    };
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    return {
      ok: false,
      message: sanitizeSecretOutput(
        err instanceof Error
          ? err.message
          : "Unexpected error during global team logout.",
      ),
    };
  }
}
