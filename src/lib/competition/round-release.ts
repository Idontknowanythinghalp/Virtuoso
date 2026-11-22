import type { ValidationResult } from "@/lib/competition/validation";
import type {
  EventStatus,
  RoundRecord,
  RoundReleaseEffectiveState,
  RoundReleaseSessionRecord,
} from "@/types/competition";

export const MIN_ROUND_DURATION_MINUTES = 1;
export const MAX_ROUND_DURATION_MINUTES = 1440;

export function classifyRoundReleaseLoadError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): "none" | "migration_missing" | "load_error" {
  if (!error) return "none";
  const code = (error.code ?? "").trim().toUpperCase();
  if (code === "42P01" || code === "PGRST205") {
    return "migration_missing";
  }
  return "load_error";
}

export function validateRoundDuration(
  raw: string | number | null | undefined,
  options: { required: true },
): ValidationResult<number>;
export function validateRoundDuration(
  raw: string | number | null | undefined,
  options?: { required?: false },
): ValidationResult<number | null>;
export function validateRoundDuration(
  raw: string | number | null | undefined,
  options?: { required?: boolean },
): ValidationResult<number | null> {
  const required = Boolean(options?.required);
  const str = raw === null || raw === undefined ? "" : String(raw).trim();

  if (str === "") {
    if (required) {
      return {
        ok: false,
        error: `Round duration is required (${MIN_ROUND_DURATION_MINUTES} to ${MAX_ROUND_DURATION_MINUTES} minutes).`,
      };
    }
    return { ok: true, value: null };
  }

  if (!/^\d+$/.test(str)) {
    return {
      ok: false,
      error: `Round duration must be a whole number between ${MIN_ROUND_DURATION_MINUTES} and ${MAX_ROUND_DURATION_MINUTES} minutes.`,
    };
  }

  const parsed = Number(str);
  if (
    !Number.isInteger(parsed) ||
    parsed < MIN_ROUND_DURATION_MINUTES ||
    parsed > MAX_ROUND_DURATION_MINUTES
  ) {
    return {
      ok: false,
      error: `Round duration must be between ${MIN_ROUND_DURATION_MINUTES} and ${MAX_ROUND_DURATION_MINUTES} minutes.`,
    };
  }

  return { ok: true, value: parsed };
}

export function isSessionActiveAtTime(
  session: Pick<
    RoundReleaseSessionRecord,
    "started_at" | "expires_at" | "closed_at"
  > | null | undefined,
  dbNowMs: number,
): boolean {
  if (!session || session.closed_at !== null) {
    return false;
  }
  const startedMs = Date.parse(session.started_at);
  const expiresMs = Date.parse(session.expires_at);
  if (!Number.isFinite(startedMs) || !Number.isFinite(expiresMs)) {
    return false;
  }
  return dbNowMs >= startedMs && dbNowMs < expiresMs;
}

export interface DerivedRoundReleaseState {
  effectiveState: RoundReleaseEffectiveState;
  isTeamVisible: boolean;
  needsReconciliation: boolean;
  openSession: RoundReleaseSessionRecord | null;
  latestSession: RoundReleaseSessionRecord | null;
  sessionCount: number;
  remainingSeconds: number | null;
}

export function deriveRoundReleaseState(params: {
  round: Pick<RoundRecord, "status" | "duration_minutes" | "is_locked">;
  eventStatus: EventStatus;
  sessions: readonly RoundReleaseSessionRecord[];
  dbNowMs: number;
}): DerivedRoundReleaseState {
  const { round, eventStatus, sessions, dbNowMs } = params;

  const sorted = [...sessions].sort(
    (a, b) => b.session_number - a.session_number,
  );
  const latestSession = sorted[0] ?? null;
  const openSession = sorted.find((s) => s.closed_at === null) ?? null;

  if (round.status === "archived") {
    return {
      effectiveState: "archived",
      isTeamVisible: false,
      needsReconciliation: Boolean(openSession),
      openSession,
      latestSession,
      sessionCount: sorted.length,
      remainingSeconds: null,
    };
  }

  if (round.status === "completed") {
    return {
      effectiveState: "completed",
      isTeamVisible: false,
      needsReconciliation: Boolean(openSession),
      openSession,
      latestSession,
      sessionCount: sorted.length,
      remainingSeconds: null,
    };
  }

  if (openSession) {
    const expiresMs = Date.parse(openSession.expires_at);
    const live = isSessionActiveAtTime(openSession, dbNowMs);

    if (live) {
      const remainingSeconds = Math.max(
        0,
        Math.ceil((expiresMs - dbNowMs) / 1000),
      );
      return {
        effectiveState: "live",
        isTeamVisible: eventStatus === "active" && round.status === "deployed",
        needsReconciliation: false,
        openSession,
        latestSession,
        sessionCount: sorted.length,
        remainingSeconds,
      };
    }

    // Read-time enforcement: past expires_at is immediately expired even before DB reconciliation
    if (Number.isFinite(expiresMs) && dbNowMs >= expiresMs) {
      return {
        effectiveState: "expired",
        isTeamVisible: false,
        needsReconciliation: true,
        openSession,
        latestSession,
        sessionCount: sorted.length,
        remainingSeconds: 0,
      };
    }
  }

  if (round.status === "closed" || (latestSession && latestSession.closed_at !== null)) {
    return {
      effectiveState:
        latestSession?.close_reason === "expired" ? "expired" : "closed",
      isTeamVisible: false,
      needsReconciliation: false,
      openSession: null,
      latestSession,
      sessionCount: sorted.length,
      remainingSeconds: null,
    };
  }

  return {
    effectiveState: round.status === "ready" ? "ready" : "draft",
    isTeamVisible: false,
    needsReconciliation: false,
    openSession: null,
    latestSession,
    sessionCount: sorted.length,
    remainingSeconds: null,
  };
}

export function evaluateFirstReleaseEligibility(params: {
  eventStatus: EventStatus;
  round: Pick<RoundRecord, "status" | "duration_minutes">;
  hasReleaseHistory: boolean;
  overrideDurationMinutes?: string | number | null;
}): ValidationResult<{ durationMinutes: number }> {
  if (params.eventStatus !== "active") {
    return {
      ok: false,
      error:
        'Parent event must have status "Active" before a round can be released.',
    };
  }

  if (params.hasReleaseHistory) {
    return {
      ok: false,
      error:
        "This round has previous release history. Use Reopen to start a new release session.",
    };
  }

  if (params.round.status !== "ready") {
    return {
      ok: false,
      error:
        'Round must be explicitly marked "Ready" before its first release. Draft rounds cannot be released directly.',
    };
  }

  const candidate =
    params.overrideDurationMinutes !== undefined &&
    params.overrideDurationMinutes !== null &&
    String(params.overrideDurationMinutes).trim() !== ""
      ? params.overrideDurationMinutes
      : params.round.duration_minutes;

  const durationCheck = validateRoundDuration(candidate, { required: true });
  if (!durationCheck.ok) {
    return durationCheck;
  }

  return {
    ok: true,
    value: { durationMinutes: durationCheck.value },
  };
}

export function evaluateReopenEligibility(params: {
  eventStatus: EventStatus;
  round: Pick<RoundRecord, "status" | "duration_minutes">;
  effectiveState: RoundReleaseEffectiveState;
  hasReleaseHistory: boolean;
  confirmReopen: boolean;
  overrideDurationMinutes?: string | number | null;
}): ValidationResult<{ durationMinutes: number }> {
  if (!params.confirmReopen) {
    return {
      ok: false,
      error:
        "Explicit confirmation is required before reopening a closed round.",
    };
  }

  if (params.eventStatus !== "active") {
    return {
      ok: false,
      error:
        'Parent event must have status "Active" before a round can be reopened.',
    };
  }

  if (params.effectiveState === "live") {
    return {
      ok: false,
      error:
        "This round currently has an active release session. Close it before reopening.",
    };
  }

  if (
    params.round.status === "completed" ||
    params.round.status === "archived"
  ) {
    return {
      ok: false,
      error: `Rounds with status "${params.round.status}" cannot be reopened.`,
    };
  }

  if (
    !params.hasReleaseHistory ||
    (params.effectiveState !== "closed" && params.effectiveState !== "expired")
  ) {
    return {
      ok: false,
      error: "Only a previously released and closed round can be reopened.",
    };
  }

  const candidate =
    params.overrideDurationMinutes !== undefined &&
    params.overrideDurationMinutes !== null &&
    String(params.overrideDurationMinutes).trim() !== ""
      ? params.overrideDurationMinutes
      : params.round.duration_minutes;

  const durationCheck = validateRoundDuration(candidate, { required: true });
  if (!durationCheck.ok) {
    return durationCheck;
  }

  return {
    ok: true,
    value: { durationMinutes: durationCheck.value },
  };
}

export function formatRemainingCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function formatDurationMinutes(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) {
    return "Not configured";
  }
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

export const EFFECTIVE_RELEASE_STATE_LABELS: Record<
  RoundReleaseEffectiveState,
  string
> = {
  draft: "Prepared (Draft · Hidden)",
  ready: "Ready to Release (Hidden)",
  live: "Live (Active & Visible to Teams)",
  expired: "Expired (Auto-Closed)",
  closed: "Closed Manually",
  completed: "Completed (Evaluation Done)",
  archived: "Archived",
};
