"use server";

import { TeamAuthError, requireActiveTeamForAction } from "@/lib/auth/team-guards";
import {
  computeParticipantLeaderboardVersionToken,
  type ParticipantLeaderboardActionErrorReason,
} from "@/lib/leaderboard/participant-polling";
import {
  loadParticipantLeaderboardsForTeam,
  type ParticipantEventLeaderboard,
} from "@/lib/team-portal/leaderboard-read";
import { loadParticipantLeaderboardVersionForTeam } from "@/lib/team-portal/leaderboard-version";

export type ParticipantLeaderboardRefreshResult =
  | {
      ok: true;
      leaderboards: ParticipantEventLeaderboard[];
      refreshedAt: string;
      versionToken: string;
    }
  | {
      ok: false;
      reason: ParticipantLeaderboardActionErrorReason;
      message: string;
    };

export type ParticipantLeaderboardVersionCheckActionResult =
  | {
      ok: true;
      versionToken: string;
    }
  | {
      ok: false;
      reason: ParticipantLeaderboardActionErrorReason;
      message: string;
    };

function mapTeamAuthActionError(
  err: unknown,
  context: "refresh" | "version",
): {
  ok: false;
  reason: ParticipantLeaderboardActionErrorReason;
  message: string;
} {
  if (err instanceof TeamAuthError) {
    if (err.code === "unauthenticated") {
      return {
        ok: false,
        reason: "unauthenticated",
        message: "Please sign in as a team to view updated standings.",
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
    `[team-leaderboard-action] unexpected ${context} error:`,
    err instanceof Error ? err.message : "Unknown error",
  );
  return {
    ok: false,
    reason: "error",
    message:
      context === "version"
        ? "Unable to check for leaderboard updates right now. Showing last loaded standings."
        : "Unable to refresh standings right now. Please try again.",
  };
}

/**
 * Lightweight Server Action for automatic participant polling.
 * Checks only eligible event publication metadata (is_published + published_at)
 * for the authenticated team's contingent without fetching full snapshot rows
 * or ever touching draft entries.
 */
export async function checkParticipantLeaderboardVersionAction(): Promise<ParticipantLeaderboardVersionCheckActionResult> {
  try {
    const team = await requireActiveTeamForAction();
    const result = await loadParticipantLeaderboardVersionForTeam(team);

    if (!result.ok) {
      return {
        ok: false,
        reason: "error",
        message: result.error,
      };
    }

    return {
      ok: true,
      versionToken: result.versionToken,
    };
  } catch (err) {
    return mapTeamAuthActionError(err, "version");
  }
}

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
      versionToken: computeParticipantLeaderboardVersionToken(
        result.leaderboards,
      ),
    };
  } catch (err) {
    return mapTeamAuthActionError(err, "refresh");
  }
}
