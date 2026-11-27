import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdminSupabaseConfigured } from "@/lib/supabase/server-env";
import {
  loadTeamLeaderboardsWithDeps,
  type ParticipantEventLeaderboard,
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
 * Server-only reader for published leaderboard standings for the authenticated team.
 * Derives the contingent strictly from the verified ActiveTeamSession returned by requireActiveTeam().
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
    async findEligibleEventEntries({ contingentId, statuses }) {
      const { data, error } = await admin
        .from("event_entries")
        .select("id, event_id, entry_type, contingent_id, status")
        .eq("contingent_id", contingentId)
        .eq("entry_type", "contingent")
        .in("status", [...statuses]);

      if (error) {
        return { rows: [], error: error.message };
      }
      return { rows: data ?? [], error: null };
    },

    async findEventsByIds(eventIds) {
      const { data, error } = await admin
        .from("events")
        .select("id, code, name, description, status")
        .in("id", eventIds);

      if (error) {
        return { rows: [], error: error.message };
      }
      return { rows: data ?? [], error: null };
    },

    async findPublishedLeaderboardEntries(eventIds) {
      const { data, error } = await admin
        .from("leaderboard_entries")
        .select("id, event_id, contingent_id, position, display_value, created_at, updated_at")
        .in("event_id", eventIds)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });

      if (error) {
        return { rows: [], error: error.message };
      }
      return { rows: data ?? [], error: null };
    },

    async findContingentsByIds(contingentIds) {
      const { data, error } = await admin
        .from("contingents")
        .select("id, contingent_code, name, institution_name")
        .in("id", contingentIds);

      if (error) {
        return { rows: [], error: error.message };
      }
      return { rows: data ?? [], error: null };
    },

    onError(context, detail) {
      console.error(`[team-portal-leaderboard] ${context}:`, detail ?? "");
    },
  });
}
