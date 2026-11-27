import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdminSupabaseConfigured } from "@/lib/supabase/server-env";
import {
  loadTeamLeaderboardVersionWithDeps,
  type ParticipantLeaderboardPublicationDescriptor,
  type ParticipantLeaderboardVersionResult,
} from "@/lib/team-portal/leaderboard";
import type { ActiveTeamSession } from "@/types/team-auth";

if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/team-portal/leaderboard-version.ts contains server-only database access and cannot run in the browser.",
  );
}

export type { ParticipantLeaderboardVersionResult };

interface EligibleEventEntryRow {
  event_id: string;
  events:
    | {
        id: string;
        status: string;
        entry_mode: string;
      }
    | Array<{
        id: string;
        status: string;
        entry_mode: string;
      }>
    | null;
}

interface PublicationMetaRow {
  event_id: string;
  is_published: boolean;
  published_at: string | null;
}

/**
 * Lightweight server-only publication metadata reader for participant polling.
 *
 * Fetches only the contingent's eligible event IDs/statuses and their
 * leaderboard publication metadata (is_published, published_at) without reading
 * draft score rows or full published snapshot rows.
 */
export async function loadParticipantLeaderboardVersionForTeam(
  team: ActiveTeamSession,
): Promise<ParticipantLeaderboardVersionResult> {
  if (!isAdminSupabaseConfigured()) {
    return {
      ok: false,
      error:
        "Leaderboard data is temporarily unavailable. Please contact a Virtuoso organiser.",
    };
  }

  const admin = createSupabaseAdminClient();

  return loadTeamLeaderboardVersionWithDeps(team.contingentId, {
    async fetchPublicationDescriptors(contingentId) {
      const { data: eligibleRows, error: eligibleError } = await admin
        .from("event_entries")
        .select("event_id, events!inner(id, status, entry_mode)")
        .eq("contingent_id", contingentId)
        .eq("entry_type", "contingent")
        .in("status", ["registered", "checked_in"])
        .in("events.entry_mode", ["contingent", "hybrid"]);

      if (eligibleError) {
        return {
          rows: [],
          error: { code: eligibleError.code, message: eligibleError.message },
        };
      }

      const eventStatusById = new Map<string, string>();
      for (const row of (eligibleRows ?? []) as EligibleEventEntryRow[]) {
        const joinedEvent = Array.isArray(row.events)
          ? row.events[0]
          : row.events;
        if (!row.event_id || !joinedEvent?.status) {
          continue;
        }
        const entryMode = String(joinedEvent.entry_mode ?? "");
        if (entryMode !== "contingent" && entryMode !== "hybrid") {
          continue;
        }
        eventStatusById.set(
          row.event_id.trim().toLowerCase(),
          joinedEvent.status,
        );
      }

      const eventIds = Array.from(eventStatusById.keys());
      if (eventIds.length === 0) {
        return { rows: [], error: null };
      }

      const { data: pubRows, error: pubError } = await admin
        .from("leaderboard_publications")
        .select("event_id, is_published, published_at")
        .in("event_id", eventIds);

      if (pubError) {
        return {
          rows: [],
          error: { code: pubError.code, message: pubError.message },
        };
      }

      const publicationByEventId = new Map<string, PublicationMetaRow>();
      for (const pub of (pubRows ?? []) as PublicationMetaRow[]) {
        if (pub.event_id) {
          publicationByEventId.set(pub.event_id.trim().toLowerCase(), pub);
        }
      }

      const descriptors: ParticipantLeaderboardPublicationDescriptor[] =
        eventIds.map((eventId) => {
          const pub = publicationByEventId.get(eventId);
          return {
            eventId,
            eventStatus: eventStatusById.get(eventId) ?? "",
            isPublished: pub?.is_published === true,
            publishedAt: pub?.published_at ?? null,
          };
        });

      return { rows: descriptors, error: null };
    },

    onError(context, detail) {
      console.error(
        `[team-portal-leaderboard-version] ${context}:`,
        detail ?? "",
      );
    },
  });
}
