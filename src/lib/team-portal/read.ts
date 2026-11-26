import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdminSupabaseConfigured } from "@/lib/supabase/server-env";
import {
  loadTeamRegisteredEventsWithDeps,
  type TeamDashboardEventsResult,
  type TeamEventDetailLookupRow,
  type TeamEventEntryLookupRow,
  type TeamRegisteredEventItem,
} from "@/lib/team-portal/rules";
import type { ActiveTeamSession } from "@/types/team-auth";

if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/team-portal/read.ts contains server-only database access and cannot run in the browser.",
  );
}

export type { TeamDashboardEventsResult, TeamRegisteredEventItem };

/**
 * Server-only reader for the authenticated team's registered events.
 * Always derives the target contingent from the verified server-side session
 * returned by requireActiveTeam() and never accepts client-supplied IDs.
 */
export async function loadTeamRegisteredEventsForTeam(
  team: ActiveTeamSession,
): Promise<TeamDashboardEventsResult> {
  if (!isAdminSupabaseConfigured()) {
    return {
      ok: false,
      error:
        "Team dashboard data is temporarily unavailable. Please contact a Virtuoso organiser.",
    };
  }

  const admin = createSupabaseAdminClient();

  return loadTeamRegisteredEventsWithDeps(team.contingentId, {
    async findEligibleEventEntries({ contingentId, statuses }) {
      const { data, error } = await admin
        .from("event_entries")
        .select("id, event_id, entry_type, contingent_id, status")
        .eq("contingent_id", contingentId)
        .eq("entry_type", "contingent")
        .in("status", [...statuses])
        .returns<TeamEventEntryLookupRow[]>();

      if (error) {
        return { rows: [], error: error.message };
      }

      return { rows: data ?? [], error: null };
    },

    async findEventsByIds(eventIds) {
      const { data, error } = await admin
        .from("events")
        .select("id, code, name, description, status")
        .in("id", eventIds)
        .returns<TeamEventDetailLookupRow[]>();

      if (error) {
        return { rows: [], error: error.message };
      }

      return { rows: data ?? [], error: null };
    },

    onError(context) {
      console.error(`[team-portal] ${context}`);
    },
  });
}
