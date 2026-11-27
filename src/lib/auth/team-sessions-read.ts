import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  sanitizeSecretOutput,
  validateTeamCodeForAdmin,
} from "@/lib/auth/team-account-admin";
import {
  sanitizeTeamSessionDetailsPayload,
  sanitizeTeamSessionOverviewPayload,
} from "@/lib/auth/team-session-management";
import type {
  TeamSessionDetailsPayload,
  TeamSessionOverviewPayload,
} from "@/types/team-auth";

export async function fetchTeamSessionOverviews(): Promise<
  | { ok: true; data: TeamSessionOverviewPayload }
  | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc(
      "admin_list_team_session_overviews",
    );

    if (error) {
      return {
        ok: false,
        error: sanitizeSecretOutput(
          error.message || "Unable to load team session overview.",
        ),
      };
    }

    return {
      ok: true,
      data: sanitizeTeamSessionOverviewPayload(data),
    };
  } catch (err) {
    return {
      ok: false,
      error: sanitizeSecretOutput(
        err instanceof Error
          ? err.message
          : "Unable to load team session overview.",
      ),
    };
  }
}

export async function fetchTeamSessionDetails(
  rawContingentCode: string,
): Promise<
  | { ok: true; data: TeamSessionDetailsPayload }
  | { ok: false; error: string }
> {
  const codeCheck = validateTeamCodeForAdmin(rawContingentCode);
  if (!codeCheck.ok) {
    return { ok: false, error: codeCheck.error };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc(
      "admin_get_team_session_details",
      {
        p_contingent_code: codeCheck.contingentCode,
      },
    );

    if (error) {
      return {
        ok: false,
        error: sanitizeSecretOutput(
          error.message || "Unable to load sessions for this team.",
        ),
      };
    }

    const sanitized = sanitizeTeamSessionDetailsPayload(data);
    if (!sanitized) {
      return {
        ok: false,
        error: "Unable to parse team session details.",
      };
    }

    return {
      ok: true,
      data: sanitized,
    };
  } catch (err) {
    return {
      ok: false,
      error: sanitizeSecretOutput(
        err instanceof Error
          ? err.message
          : "Unable to load sessions for this team.",
      ),
    };
  }
}
