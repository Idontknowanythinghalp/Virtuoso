import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminSupabaseConfigured } from "@/lib/supabase/server-env";
import {
  loadTeamCurrentRoundsWithDeps,
  type ParticipantCurrentRoundItem,
  type TeamCurrentRoundsResult,
  type TeamVisibleEventLookupRow,
  type TeamVisibleRoundLookupRow,
} from "@/lib/team-portal/rounds";
import type { RoundReleaseSessionRecord } from "@/types/competition";
import type { ActiveTeamSession } from "@/types/team-auth";

if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/team-portal/rounds-read.ts contains server-only database access and cannot run in the browser.",
  );
}

export type { ParticipantCurrentRoundItem, TeamCurrentRoundsResult };

/**
 * Server-only reader for currently released and open rounds visible to any
 * authenticated team. Enforces visibility at both the database query level
 * (active event + deployed round + open unexpired release session against DB
 * server time) and in loadTeamCurrentRoundsWithDeps().
 */
export async function loadTeamCurrentRoundsForTeam(
  team: ActiveTeamSession,
): Promise<TeamCurrentRoundsResult> {
  if (!isAdminSupabaseConfigured()) {
    return {
      ok: false,
      error:
        "Current rounds data is temporarily unavailable. Please contact a Virtuoso organiser.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  return loadTeamCurrentRoundsWithDeps(team.contingentId, {
    async getDbServerTimestamp() {
      const { data, error } = await supabase.rpc("get_db_server_timestamp");
      if (error || typeof data !== "string") {
        return {
          timestampIso: null,
          error: error?.message ?? "Unable to verify database server time",
        };
      }
      return { timestampIso: data, error: null };
    },

    async findOpenReleaseSessions({ dbNowIso }) {
      const { data, error } = await admin
        .from("round_release_sessions")
        .select(
          "id, event_id, round_id, session_number, duration_minutes, started_at, expires_at, closed_at, close_reason, released_by, closed_by, notes, created_at, updated_at",
        )
        .is("closed_at", null)
        .lte("started_at", dbNowIso)
        .gt("expires_at", dbNowIso)
        .returns<RoundReleaseSessionRecord[]>();

      if (error) {
        return { rows: [], error: error.message };
      }

      return { rows: data ?? [], error: null };
    },

    async findActiveEventsByIds(eventIds) {
      const { data, error } = await admin
        .from("events")
        .select("id, code, name, status")
        .eq("status", "active")
        .in("id", eventIds)
        .returns<TeamVisibleEventLookupRow[]>();

      if (error) {
        return { rows: [], error: error.message };
      }

      return { rows: data ?? [], error: null };
    },

    async findDeployedRoundsByIds(roundIds) {
      const { data, error } = await admin
        .from("rounds")
        .select(
          "id, event_id, round_number, name, description, status, duration_minutes, is_locked",
        )
        .eq("status", "deployed")
        .in("id", roundIds)
        .order("round_number", { ascending: true })
        .returns<TeamVisibleRoundLookupRow[]>();

      if (error) {
        return { rows: [], error: error.message };
      }

      return { rows: data ?? [], error: null };
    },

    onError(context) {
      console.error(`[team-portal-rounds] ${context}`);
    },
  });
}
