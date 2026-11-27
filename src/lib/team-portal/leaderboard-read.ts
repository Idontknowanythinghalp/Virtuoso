import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdminSupabaseConfigured } from "@/lib/supabase/server-env";
import {
  loadTeamLeaderboardsWithDeps,
  type ParticipantEventLeaderboard,
  type ParticipantLeaderboardRpcEventRow,
  type ParticipantLeaderboardsResult,
} from "@/lib/team-portal/leaderboard";
import type { ActiveTeamSession } from "@/types/team-auth";

if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/team-portal/leaderboard-read.ts contains server-only database access and cannot run in the browser.",
  );
}

export type { ParticipantEventLeaderboard, ParticipantLeaderboardsResult };

/**
 * Server-only reader for explicitly published leaderboard standings for an
 * authenticated team. Contingent scope comes strictly from ActiveTeamSession
 * returned by requireActiveTeam(), and publication state + entries are fetched
 * in a single PostgreSQL statement snapshot via get_participant_leaderboards_for_contingent.
 */
export async function loadParticipantLeaderboardsForTeam(
  team: ActiveTeamSession,
): Promise<ParticipantLeaderboardsResult> {
  if (!isAdminSupabaseConfigured()) {
    return {
      ok: false,
      error:
        "Leaderboard data is temporarily unavailable. Please contact a Virtuoso organiser.",
    };
  }

  const admin = createSupabaseAdminClient();

  return loadTeamLeaderboardsWithDeps(team.contingentId, {
    async fetchParticipantLeaderboardsSnapshot(contingentId) {
      const { data, error } = await admin.rpc(
        "get_participant_leaderboards_for_contingent",
        {
          p_contingent_id: contingentId,
        },
      );

      if (error) {
        return {
          rows: [],
          error: { code: error.code, message: error.message },
        };
      }

      if (!Array.isArray(data)) {
        return {
          rows: [],
          error: {
            code: null,
            message: "Unexpected response from participant leaderboard RPC",
          },
        };
      }

      return {
        rows: data as ParticipantLeaderboardRpcEventRow[],
        error: null,
      };
    },

    onError(context, detail) {
      console.error(`[team-portal-leaderboard] ${context}:`, detail ?? "");
    },
  });
}
