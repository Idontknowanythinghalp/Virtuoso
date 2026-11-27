"use server";

import { TeamAuthError, requireActiveTeamForAction } from "@/lib/auth/team-guards";
import {
  loadParticipantLeaderboardsForTeam,
  type ParticipantEventLeaderboard,
} from "@/lib/team-portal/leaderboard-read";

export type ParticipantLeaderboardRefreshResult =
  | {
      ok: true;
      leaderboards: ParticipantEventLeaderboard[];
      refreshedAt: string;
    }
  | {
      ok: false;
      reason:
        | "unauthenticated"
        | "organiser_forbidden"
        | "invalid_team_session"
        | "error";
      message: string;
    };

/**
 * Fetches the latest published leaderboard snapshots for the authenticated team's
 * contingent without reloading the page. Contingent scope is derived strictly
 * from the active server-verified team session.
 */
export async function refreshParticipantLeaderboardsAction(): Promise<ParticipantLeaderboardRefreshResult> {
  try {
    const team = await requireActiveTeamForAction();
    const result = await loadParticipantLeaderboardsForTeam(team);

    if (!result.ok) {
      return {
        ok: false,
        reason: "error",
        message: result.error,
      };
    }

    return {
      ok: true,
      leaderboards: result.leaderboards,
      refreshedAt: new Date().toISOString(),
    };
  } catch (err) {
    if (err instanceof TeamAuthError) {
      if (err.code === "unauthenticated") {
        return {
          ok: false,
          reason: "unauthenticated",
          message: "Please sign in as a team to refresh standings.",
        };
      }
      if (err.code === "organiser_forbidden") {
        return {
          ok: false,
          reason: "organiser_forbidden",
          message: "Organiser accounts cannot access participant standings.",
        };
      }
      if (err.code === "invalid_team_session") {
        return {
          ok: false,
          reason: "invalid_team_session",
          message:
            "Your team session is no longer active. Please sign in again.",
        };
      }
      return {
        ok: false,
        reason: "error",
        message:
          "Standings refresh is temporarily unavailable. Please contact a Virtuoso organiser.",
      };
    }

    console.error(
      "[team-leaderboard-action] unexpected refresh error:",
      err instanceof Error ? err.message : "Unknown error",
    );
    return {
      ok: false,
      reason: "error",
      message: "Unable to refresh standings right now. Please try again.",
    };
  }
}
