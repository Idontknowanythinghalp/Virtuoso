export const LEADERBOARD_POLL_INTERVAL_MS = 12_000;

export interface ParticipantLeaderboardPublicationDescriptor {
  eventId: string;
  eventStatus: string;
  isPublished: boolean;
  publishedAt: string | null;
}

export type ParticipantLeaderboardActionErrorReason =
  | "unauthenticated"
  | "organiser_forbidden"
  | "invalid_team_session"
  | "error";

export type ParticipantLeaderboardVersionCheckResult<TLeaderboard> =
  | {
      ok: true;
      versionToken: string;
    }
  | {
      ok: false;
      reason: ParticipantLeaderboardActionErrorReason;
      message: string;
      leaderboards?: TLeaderboard[];
    };

export type ParticipantLeaderboardSnapshotFetchResult<TLeaderboard> =
  | {
      ok: true;
      leaderboards: TLeaderboard[];
      refreshedAt: string;
      versionToken: string;
    }
  | {
      ok: false;
      reason: ParticipantLeaderboardActionErrorReason;
      message: string;
    };

export function isTerminalTeamAuthReason(
  reason: ParticipantLeaderboardActionErrorReason | string | undefined,
): boolean {
  return (
    reason === "unauthenticated" ||
    reason === "organiser_forbidden" ||
    reason === "invalid_team_session"
  );
}

/**
 * Normalizes ISO timestamps (+00:00 vs Z and trailing fractional zeroes) so
 * PostgREST column queries and JSONB RPC payloads produce identical tokens
 * while preserving microsecond precision.
 */
export function normalizePublishedAtToken(
  publishedAt: string | null | undefined,
): string {
  if (!publishedAt) return "";
  const trimmed = String(publishedAt).trim();
  if (!trimmed) return "";

  const utcNormalized = trimmed.replace(/\+00:00$/i, "Z");
  return utcNormalized
    .replace(/(\.\d*?[1-9])0+Z$/, "$1Z")
    .replace(/\.0+Z$/, "Z");
}

/**
 * Computes a deterministic version token representing the exact publication
 * state visible to a participant across all their eligible events.
 *
 * - Changes on initial publish, republish (new publishedAt), unpublish, or eligible event change.
 * - Unchanged on organiser draft edits (which never alter leaderboard_publications).
 */
export function computeParticipantLeaderboardVersionToken(
  items: readonly ParticipantLeaderboardPublicationDescriptor[],
): string {
  const canonicalByEventId = new Map<string, string>();

  for (const item of items) {
    if (!item || typeof item.eventId !== "string") continue;
    const normId = item.eventId.trim().toLowerCase();
    if (!normId) continue;

    const status = String(item.eventStatus ?? "").trim().toLowerCase();
    const isEffectivelyPublished =
      (status === "active" || status === "archived") &&
      item.isPublished === true &&
      typeof item.publishedAt === "string" &&
      item.publishedAt.trim().length > 0;

    const effectivePublishedAt = isEffectivelyPublished
      ? normalizePublishedAtToken(item.publishedAt)
      : "";

    canonicalByEventId.set(
      normId,
      `${normId}:${status}:${isEffectivelyPublished ? "1" : "0"}:${effectivePublishedAt}`,
    );
  }

  if (canonicalByEventId.size === 0) {
    return "empty";
  }

  return Array.from(canonicalByEventId.keys())
    .sort()
    .map((id) => canonicalByEventId.get(id)!)
    .join("|");
}

export interface ParticipantLeaderboardSyncControllerDeps<TLeaderboard> {
  initialVersionToken: string;
  checkVersion: () => Promise<
    ParticipantLeaderboardVersionCheckResult<TLeaderboard>
  >;
  fetchFullLeaderboards: () => Promise<
    ParticipantLeaderboardSnapshotFetchResult<TLeaderboard>
  >;
  onAutoUpdateStart?: () => void;
  onAutoUpdateEnd?: () => void;
  onAutoCheckSuccess?: () => void;
  onManualRefreshStart?: () => void;
  onManualRefreshEnd?: () => void;
  onLeaderboardsUpdated: (payload: {
    leaderboards: TLeaderboard[];
    refreshedAt: string;
    versionToken: string;
    source: "auto" | "manual";
  }) => void;
  onError?: (error: {
    message: string;
    isTerminalAuth: boolean;
    source: "auto" | "manual";
  }) => void;
}

export type SyncCheckOutcome =
  | "updated"
  | "unchanged"
  | "skipped"
  | "error"
  | "stopped";

export type ManualRefreshOutcome =
  | "updated"
  | "skipped"
  | "error"
  | "stopped";

export interface ParticipantLeaderboardSyncController {
  getVersionToken: () => string;
  isInFlight: () => boolean;
  isStopped: () => boolean;
  isAuthStopped: () => boolean;
  checkAndSync: () => Promise<SyncCheckOutcome>;
  manualRefresh: () => Promise<ManualRefreshOutcome>;
  stop: () => void;
}

/**
 * Coordinates lightweight participant leaderboard polling alongside manual refreshes.
 *
 * - Prevents overlapping concurrent version checks or full snapshot fetches.
 * - Fetches full published standings only when the publication version token changes.
 * - Preserves existing standings on transient network/server errors so the page
 *   remains usable and recovers on the next poll or manual refresh.
 * - Halts background polling on terminal auth errors or unmount (`stop()`).
 */
export function createParticipantLeaderboardSyncController<
  TLeaderboard extends ParticipantLeaderboardPublicationDescriptor,
>(
  deps: ParticipantLeaderboardSyncControllerDeps<TLeaderboard>,
): ParticipantLeaderboardSyncController {
  let currentVersionToken = deps.initialVersionToken;
  let inFlight = false;
  let stopped = false;
  let authStopped = false;

  async function checkAndSync(): Promise<SyncCheckOutcome> {
    if (stopped || authStopped || inFlight) {
      return "skipped";
    }

    inFlight = true;
    let autoUpdateStarted = false;

    try {
      const versionResult = await deps.checkVersion();
      if (stopped) {
        return "stopped";
      }

      if (!versionResult.ok) {
        const terminal = isTerminalTeamAuthReason(versionResult.reason);
        if (terminal) {
          authStopped = true;
        }
        deps.onError?.({
          message: versionResult.message,
          isTerminalAuth: terminal,
          source: "auto",
        });
        return "error";
      }

      if (versionResult.versionToken === currentVersionToken) {
        deps.onAutoCheckSuccess?.();
        return "unchanged";
      }

      autoUpdateStarted = true;
      deps.onAutoUpdateStart?.();

      const snapshotResult = await deps.fetchFullLeaderboards();
      if (stopped) {
        return "stopped";
      }

      if (!snapshotResult.ok) {
        const terminal = isTerminalTeamAuthReason(snapshotResult.reason);
        if (terminal) {
          authStopped = true;
        }
        deps.onError?.({
          message: snapshotResult.message,
          isTerminalAuth: terminal,
          source: "auto",
        });
        return "error";
      }

      currentVersionToken = snapshotResult.versionToken;
      deps.onLeaderboardsUpdated({
        leaderboards: snapshotResult.leaderboards,
        refreshedAt: snapshotResult.refreshedAt,
        versionToken: snapshotResult.versionToken,
        source: "auto",
      });

      return "updated";
    } catch {
      if (stopped) {
        return "stopped";
      }
      deps.onError?.({
        message:
          "Unable to check for leaderboard updates right now. Showing last loaded standings.",
        isTerminalAuth: false,
        source: "auto",
      });
      return "error";
    } finally {
      inFlight = false;
      if (autoUpdateStarted) {
        deps.onAutoUpdateEnd?.();
      }
    }
  }

  async function manualRefresh(): Promise<ManualRefreshOutcome> {
    if (stopped || inFlight) {
      return "skipped";
    }

    inFlight = true;
    deps.onManualRefreshStart?.();

    try {
      const snapshotResult = await deps.fetchFullLeaderboards();
      if (stopped) {
        return "stopped";
      }

      if (!snapshotResult.ok) {
        const terminal = isTerminalTeamAuthReason(snapshotResult.reason);
        if (terminal) {
          authStopped = true;
        }
        deps.onError?.({
          message: snapshotResult.message,
          isTerminalAuth: terminal,
          source: "manual",
        });
        return "error";
      }

      authStopped = false;
      currentVersionToken = snapshotResult.versionToken;
      deps.onLeaderboardsUpdated({
        leaderboards: snapshotResult.leaderboards,
        refreshedAt: snapshotResult.refreshedAt,
        versionToken: snapshotResult.versionToken,
        source: "manual",
      });

      return "updated";
    } catch {
      if (stopped) {
        return "stopped";
      }
      deps.onError?.({
        message:
          "Unable to refresh leaderboard standings right now. Please try again.",
        isTerminalAuth: false,
        source: "manual",
      });
      return "error";
    } finally {
      inFlight = false;
      deps.onManualRefreshEnd?.();
    }
  }

  function stop(): void {
    stopped = true;
  }

  return {
    getVersionToken: () => currentVersionToken,
    isInFlight: () => inFlight,
    isStopped: () => stopped,
    isAuthStopped: () => authStopped,
    checkAndSync,
    manualRefresh,
    stop,
  };
}
