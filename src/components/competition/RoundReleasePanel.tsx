"use client";

import React, {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Lock,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
} from "lucide-react";
import {
  closeRoundReleaseAction,
  configureRoundDurationAction,
  getDbServerTimestampAction,
  reconcileRoundExpiryAction,
  releaseRoundAction,
  reopenRoundReleaseAction,
} from "@/app/actions/round-release";
import type { CompetitionActionResult } from "@/app/actions/competition";
import {
  deriveRoundReleaseState,
  EFFECTIVE_RELEASE_STATE_LABELS,
  formatDurationMinutes,
  formatRemainingCountdown,
  MAX_ROUND_DURATION_MINUTES,
  MIN_ROUND_DURATION_MINUTES,
} from "@/lib/competition/round-release";
import { formatIstTimestamp } from "@/lib/date-time";
import type {
  EventRecord,
  RoundRecord,
  RoundReleaseSessionRecord,
} from "@/types/competition";

interface LiveCountdownDisplayProps {
  sessionId: string;
  dbServerNowIso: string;
  expiresAtIso: string;
  onExpired: () => void;
}

function LiveCountdownDisplay({
  sessionId,
  dbServerNowIso,
  expiresAtIso,
  onExpired,
}: LiveCountdownDisplayProps) {
  const timerKey = `${sessionId}:${expiresAtIso}`;
  const [tickState, setTickState] = useState<{
    key: string;
    seconds: number;
  } | null>(null);
  const onExpiredRef = useRef(onExpired);

  useEffect(() => {
    onExpiredRef.current = onExpired;
  }, [onExpired]);

  useEffect(() => {
    const expiresMs = Date.parse(expiresAtIso);
    if (!Number.isFinite(expiresMs)) {
      return;
    }

    let cancelled = false;
    let expiredNotified = false;

    const initialServerMs = Date.parse(dbServerNowIso);
    let anchorServerMs: number | null = Number.isFinite(initialServerMs)
      ? initialServerMs
      : null;
    let anchorPerfMs = performance.now();

    const notifyExpiredOnce = () => {
      if (!expiredNotified) {
        expiredNotified = true;
        onExpiredRef.current();
      }
    };

    // Synchronise with a fresh server timestamp on mount so cached renders do not skew the countdown
    getDbServerTimestampAction().then((res) => {
      if (cancelled || !res.ok) return;
      const syncedMs = Date.parse(res.timestampIso);
      if (!Number.isFinite(syncedMs)) return;

      anchorServerMs = syncedMs;
      anchorPerfMs = performance.now();

      const nextSec = Math.max(0, Math.ceil((expiresMs - syncedMs) / 1000));
      setTickState({ key: timerKey, seconds: nextSec });
      if (syncedMs >= expiresMs) {
        notifyExpiredOnce();
      }
    });

    const interval = window.setInterval(() => {
      if (anchorServerMs === null) return;
      const elapsedMs = Math.max(0, performance.now() - anchorPerfMs);
      const currentServerMs = anchorServerMs + elapsedMs;
      const nextSec = Math.max(
        0,
        Math.ceil((expiresMs - currentServerMs) / 1000),
      );
      setTickState({ key: timerKey, seconds: nextSec });

      if (currentServerMs >= expiresMs) {
        window.clearInterval(interval);
        notifyExpiredOnce();
      }
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [timerKey, dbServerNowIso, expiresAtIso]);

  const initialServerMs = Date.parse(dbServerNowIso);
  const expiresMs = Date.parse(expiresAtIso);
  const initialRemaining =
    Number.isFinite(initialServerMs) && Number.isFinite(expiresMs)
      ? Math.max(0, Math.ceil((expiresMs - initialServerMs) / 1000))
      : 0;

  const remainingSeconds =
    tickState && tickState.key === timerKey
      ? tickState.seconds
      : initialRemaining;

  return (
    <span className="font-mono text-2xl font-bold tabular-nums text-emerald-900">
      {formatRemainingCountdown(remainingSeconds)}
    </span>
  );
}

interface RoundReleasePanelProps {
  event: Pick<EventRecord, "id" | "code" | "name" | "status">;
  round: RoundRecord;
  sessions: RoundReleaseSessionRecord[];
  dbServerNowIso: string | null;
  releaseMigrationMissing: boolean;
  releaseLoadError?: string | null;
}

export function RoundReleasePanel({
  event,
  round,
  sessions,
  dbServerNowIso,
  releaseMigrationMissing,
  releaseLoadError = null,
}: RoundReleasePanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [reconcileFeedback, setReconcileFeedback] =
    useState<CompetitionActionResult | null>(null);

  const dbNowMs = dbServerNowIso ? Date.parse(dbServerNowIso) : NaN;
  const hasClockError =
    !releaseMigrationMissing && (!dbServerNowIso || !Number.isFinite(dbNowMs));
  const releaseDataUnavailable =
    releaseMigrationMissing || Boolean(releaseLoadError) || hasClockError;

  const effective =
    !releaseDataUnavailable && Number.isFinite(dbNowMs)
      ? deriveRoundReleaseState({
          round,
          eventStatus: event.status,
          sessions,
          dbNowMs,
        })
      : null;

  const [durationState, durationFormAction, durationPending] = useActionState<
    CompetitionActionResult | null,
    FormData
  >(async (prev, formData) => {
    const result = await configureRoundDurationAction(prev, formData);
    if (result.ok) {
      router.refresh();
    }
    return result;
  }, null);

  const [releaseState, releaseFormAction, releasePending] = useActionState<
    CompetitionActionResult | null,
    FormData
  >(async (prev, formData) => {
    const result = await releaseRoundAction(prev, formData);
    if (result.ok) {
      router.refresh();
    }
    return result;
  }, null);

  const [closeState, closeFormAction, closePending] = useActionState<
    CompetitionActionResult | null,
    FormData
  >(async (prev, formData) => {
    const result = await closeRoundReleaseAction(prev, formData);
    if (result.ok) {
      setConfirmingClose(false);
      router.refresh();
    }
    return result;
  }, null);

  const [reopenState, reopenFormAction, reopenPending] = useActionState<
    CompetitionActionResult | null,
    FormData
  >(async (prev, formData) => {
    const result = await reopenRoundReleaseAction(prev, formData);
    if (result.ok) {
      setConfirmReopen(false);
      router.refresh();
    }
    return result;
  }, null);

  function handleFinalizeExpired() {
    setReconcileFeedback(null);
    startTransition(async () => {
      const result = await reconcileRoundExpiryAction(event.id, round.id);
      setReconcileFeedback(result);
      if (result.ok) {
        router.refresh();
      }
    });
  }

  const stateBadgeClasses = (() => {
    switch (effective?.effectiveState) {
      case "live":
        return "border-emerald-200 bg-emerald-50 text-emerald-900";
      case "ready":
        return "border-sky-200 bg-sky-50 text-sky-900";
      case "expired":
      case "closed":
        return "border-amber-200 bg-amber-50 text-amber-900";
      case "completed":
      case "archived":
      case "draft":
      default:
        return "border-slate-200 bg-slate-100 text-slate-800";
    }
  })();

  const hasReleaseHistory = (effective?.sessionCount ?? sessions.length) > 0;
  const canEditDuration =
    !releaseDataUnavailable &&
    !hasReleaseHistory &&
    effective !== null &&
    effective.effectiveState !== "live" &&
    effective.effectiveState !== "completed" &&
    effective.effectiveState !== "archived";

  const canAttemptFirstRelease =
    !releaseDataUnavailable &&
    !hasReleaseHistory &&
    event.status === "active" &&
    round.status === "ready" &&
    round.duration_minutes !== null &&
    round.duration_minutes >= MIN_ROUND_DURATION_MINUTES &&
    round.duration_minutes <= MAX_ROUND_DURATION_MINUTES;

  const canAttemptReopen =
    !releaseDataUnavailable &&
    hasReleaseHistory &&
    effective !== null &&
    event.status === "active" &&
    (effective.effectiveState === "closed" ||
      effective.effectiveState === "expired");

  return (
    <section
      aria-labelledby="round-release-heading"
      className="space-y-6 rounded-lg border border-slate-200 bg-white p-6"
    >
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2
            id="round-release-heading"
            className="font-display text-lg font-semibold text-slate-900"
          >
            Round Release Control &amp; Timer
          </h2>
          <p className="text-sm text-slate-600">
            Manually release this round, monitor the server-authoritative
            countdown, close early, or reopen with full session history.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-semibold ${stateBadgeClasses}`}
          >
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {effective
                ? EFFECTIVE_RELEASE_STATE_LABELS[effective.effectiveState]
                : releaseMigrationMissing
                  ? "Migration 0007 Required"
                  : "Release Status Unavailable"}
            </span>
          </span>
          {round.is_locked ? (
            <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900">
              <Lock className="h-3 w-3" aria-hidden="true" />
              <span>Criteria Locked</span>
            </span>
          ) : null}
        </div>
      </div>

      {releaseMigrationMissing ? (
        <div
          role="status"
          className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          Round release database migration{" "}
          <code className="font-mono text-xs">
            supabase/migrations/202611220007_stage2c_round_release_management.sql
          </code>{" "}
          is not applied yet. Apply it to Supabase to enable round duration
          configuration, release controls, and session history.
        </div>
      ) : releaseLoadError || hasClockError ? (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          {releaseLoadError ??
            "Unable to read authoritative database timestamp. Release controls are temporarily unavailable until database connectivity is verified."}
        </div>
      ) : null}

      {/* Summary Strip */}
      <dl className="grid grid-cols-1 gap-4 rounded-md border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-4">
        <div>
          <dt className="text-xs font-medium text-slate-500">
            Configured Duration
          </dt>
          <dd className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-900">
            {formatDurationMinutes(round.duration_minutes)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">
            Parent Event Status
          </dt>
          <dd className="mt-1 text-sm font-medium capitalize text-slate-900">
            {event.status}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">
            Team Portal Visibility
          </dt>
          <dd className="mt-1 text-sm font-medium text-slate-900">
            {!effective ? (
              <span className="text-red-800">Unavailable (Load Error)</span>
            ) : effective.isTeamVisible ? (
              <span className="text-emerald-800">Visible to Teams Now</span>
            ) : (
              <span className="text-slate-600">Hidden from Teams</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">
            Release Sessions
          </dt>
          <dd className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-900">
            {effective ? effective.sessionCount : "—"}
          </dd>
        </div>
      </dl>

      {/* Duration Preparation Form */}
      <div className="rounded-md border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-900">
          Configure Release Duration
        </h3>
        <p className="mt-0.5 text-xs text-slate-600">
          Whole minutes between {MIN_ROUND_DURATION_MINUTES} and{" "}
          {MAX_ROUND_DURATION_MINUTES.toLocaleString()}.{" "}
          {hasReleaseHistory
            ? "Locked once release history exists; override duration only when reopening the round."
            : "Set before first release."}
        </p>

        <form
          action={durationFormAction}
          className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <input type="hidden" name="eventId" value={event.id} />
          <input type="hidden" name="roundId" value={round.id} />

          <div className="w-full space-y-1 sm:max-w-xs">
            <label
              htmlFor="release-duration-minutes"
              className="block text-xs font-medium text-slate-700"
            >
              Duration (minutes)
            </label>
            <input
              id="release-duration-minutes"
              name="durationMinutes"
              type="number"
              required
              min={MIN_ROUND_DURATION_MINUTES}
              max={MAX_ROUND_DURATION_MINUTES}
              step={1}
              disabled={!canEditDuration || durationPending}
              defaultValue={round.duration_minutes ?? ""}
              placeholder="e.g. 45"
              className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20 disabled:bg-slate-100 disabled:text-slate-500"
            />
          </div>

          <button
            type="submit"
            disabled={!canEditDuration || durationPending}
            className="min-h-10 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium whitespace-nowrap text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
          >
            {durationPending ? "Saving..." : "Save Duration"}
          </button>
        </form>

        {durationState ? (
          <div
            role={durationState.ok ? "status" : "alert"}
            aria-live="polite"
            className={`mt-3 rounded-md border px-3 py-2 text-xs ${
              durationState.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-red-200 bg-red-50 text-red-900"
            }`}
          >
            {durationState.message}
          </div>
        ) : null}
      </div>

      {/* Case 1: Prepared (Never Released Yet) */}
      {effective &&
      !hasReleaseHistory &&
      round.status !== "completed" &&
      round.status !== "archived" ? (
        <div className="space-y-4 rounded-md border border-slate-200 p-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-900">
              First Release (Prepared Round)
            </h3>
            <p className="text-xs text-slate-600">
              Prepared rounds remain hidden from teams until an organiser clicks
              Release. Releasing immediately locks judging criteria structure.
            </p>
          </div>

          <ul className="space-y-1.5 text-xs">
            <li className="flex items-center gap-2">
              {event.status === "active" ? (
                <CheckCircle2
                  className="h-3.5 w-3.5 text-emerald-700"
                  aria-hidden="true"
                />
              ) : (
                <AlertTriangle
                  className="h-3.5 w-3.5 text-amber-700"
                  aria-hidden="true"
                />
              )}
              <span>
                Parent event must be Active (currently:{" "}
                <strong className="capitalize">{event.status}</strong>)
              </span>
            </li>
            <li className="flex items-center gap-2">
              {round.status === "ready" ? (
                <CheckCircle2
                  className="h-3.5 w-3.5 text-emerald-700"
                  aria-hidden="true"
                />
              ) : (
                <AlertTriangle
                  className="h-3.5 w-3.5 text-amber-700"
                  aria-hidden="true"
                />
              )}
              <span>
                Round must be marked Ready before first release (currently:{" "}
                <strong className="capitalize">{round.status}</strong>)
              </span>
            </li>
            <li className="flex items-center gap-2">
              {round.duration_minutes !== null ? (
                <CheckCircle2
                  className="h-3.5 w-3.5 text-emerald-700"
                  aria-hidden="true"
                />
              ) : (
                <AlertTriangle
                  className="h-3.5 w-3.5 text-amber-700"
                  aria-hidden="true"
                />
              )}
              <span>
                Duration configured:{" "}
                <strong>{formatDurationMinutes(round.duration_minutes)}</strong>
              </span>
            </li>
          </ul>

          <form action={releaseFormAction} className="space-y-3">
            <input type="hidden" name="eventId" value={event.id} />
            <input type="hidden" name="roundId" value={round.id} />

            <div className="space-y-1">
              <label
                htmlFor="release-notes"
                className="block text-xs font-medium text-slate-700"
              >
                Release Note (Optional)
              </label>
              <input
                id="release-notes"
                name="notes"
                type="text"
                maxLength={500}
                disabled={!canAttemptFirstRelease || releasePending}
                placeholder="Optional organiser note recorded in release history"
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20 disabled:bg-slate-100"
              />
            </div>

            {releaseState ? (
              <div
                role={releaseState.ok ? "status" : "alert"}
                aria-live="polite"
                className={`rounded-md border px-3 py-2 text-xs ${
                  releaseState.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-red-200 bg-red-50 text-red-900"
                }`}
              >
                {releaseState.message}
              </div>
            ) : null}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!canAttemptFirstRelease || releasePending}
                className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#4B0507] px-4 py-2 text-sm font-medium whitespace-nowrap text-white hover:bg-[#380305] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                <span>
                  {releasePending ? "Releasing..." : "Release Round Now"}
                </span>
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Case 2: Live Unexpired Session */}
      {effective &&
      dbServerNowIso &&
      effective.effectiveState === "live" &&
      effective.openSession ? (
        <div className="space-y-4 rounded-md border border-emerald-200 bg-emerald-50/50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                Session #{effective.openSession.session_number} Active
              </p>
              <p className="mt-1 text-xs text-emerald-900">
                Server start:{" "}
                <span className="font-mono">
                  {formatIstTimestamp(effective.openSession.started_at)}
                </span>{" "}
                · Scheduled expiry:{" "}
                <span className="font-mono">
                  {formatIstTimestamp(effective.openSession.expires_at)}
                </span>
              </p>
            </div>

            <div className="rounded-md border border-emerald-200 bg-white px-4 py-2 text-right">
              <p className="text-[11px] font-medium text-slate-500">
                Server-Synced Time Remaining
              </p>
              <LiveCountdownDisplay
                key={`${effective.openSession.id}:${effective.openSession.expires_at}`}
                sessionId={effective.openSession.id}
                dbServerNowIso={dbServerNowIso}
                expiresAtIso={effective.openSession.expires_at}
                onExpired={() => router.refresh()}
              />
            </div>
          </div>

          {closeState ? (
            <div
              role={closeState.ok ? "status" : "alert"}
              aria-live="polite"
              className={`rounded-md border px-3 py-2 text-xs ${
                closeState.ok
                  ? "border-emerald-200 bg-white text-emerald-900"
                  : "border-red-200 bg-red-50 text-red-900"
              }`}
            >
              {closeState.message}
            </div>
          ) : null}

          {!confirmingClose ? (
            <div className="flex justify-end">
              <button
                type="button"
                disabled={closePending}
                onClick={() => setConfirmingClose(true)}
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium whitespace-nowrap text-red-800 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
              >
                <Square className="h-4 w-4" aria-hidden="true" />
                <span>Close Round Early</span>
              </button>
            </div>
          ) : (
            <form
              action={closeFormAction}
              className="space-y-3 rounded-md border border-red-200 bg-white p-4"
            >
              <input type="hidden" name="eventId" value={event.id} />
              <input type="hidden" name="roundId" value={round.id} />
              <input type="hidden" name="confirmClose" value="true" />

              <p className="text-xs font-medium text-red-900">
                Closing early immediately removes this round from team access
                and records the actual closure timestamp.
              </p>

              <div className="space-y-1">
                <label
                  htmlFor="close-notes"
                  className="block text-xs font-medium text-slate-700"
                >
                  Closure Reason / Note (Optional)
                </label>
                <input
                  id="close-notes"
                  name="notes"
                  type="text"
                  maxLength={500}
                  placeholder="Optional reason for manual early closure"
                  className="min-h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={closePending}
                  onClick={() => setConfirmingClose(false)}
                  className="min-h-9 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={closePending}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-red-700 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                >
                  <Square className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {closePending ? "Closing..." : "Confirm Close Early"}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}

      {/* Case 3: Pending Reconciliation Notice (Expired at Read Time) */}
      {effective && effective.needsReconciliation && effective.openSession ? (
        <div className="flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 text-xs text-amber-900">
            <p className="font-semibold">
              Session #{effective.openSession.session_number} expired at{" "}
              <span className="font-mono">
                {formatIstTimestamp(effective.openSession.expires_at)}
              </span>
            </p>
            <p>
              Team access is already blocked automatically by database time.
              Finalize to persist the Closed state now, or Reopen directly
              below.
            </p>
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={handleFinalizeExpired}
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium whitespace-nowrap text-amber-900 hover:bg-amber-100 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {isPending ? "Finalizing..." : "Finalize Expired Status"}
            </span>
          </button>
        </div>
      ) : null}

      {reconcileFeedback ? (
        <div
          role={reconcileFeedback.ok ? "status" : "alert"}
          aria-live="polite"
          className={`rounded-md border px-3 py-2 text-xs ${
            reconcileFeedback.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          {reconcileFeedback.message}
        </div>
      ) : null}

      {/* Case 4: Closed or Expired -> Separate Reopen Operation */}
      {effective &&
      hasReleaseHistory &&
      (effective.effectiveState === "closed" ||
        effective.effectiveState === "expired") ? (
        <div className="space-y-4 rounded-md border border-slate-200 p-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-900">
              Reopen Round (New Release Session #{effective.sessionCount + 1})
            </h3>
            <p className="text-xs text-slate-600">
              Reopening creates a new release session with a fresh start
              timestamp and timer while preserving all previous release and
              closure history. Judging criteria remain locked.
            </p>
          </div>

          <form action={reopenFormAction} className="space-y-3">
            <input type="hidden" name="eventId" value={event.id} />
            <input type="hidden" name="roundId" value={round.id} />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <label
                  htmlFor="reopen-duration"
                  className="block text-xs font-medium text-slate-700"
                >
                  Duration Override (Optional, minutes)
                </label>
                <input
                  id="reopen-duration"
                  name="durationMinutes"
                  type="number"
                  min={MIN_ROUND_DURATION_MINUTES}
                  max={MAX_ROUND_DURATION_MINUTES}
                  step={1}
                  disabled={!canAttemptReopen || reopenPending}
                  defaultValue=""
                  placeholder={
                    round.duration_minutes
                      ? `Keep ${round.duration_minutes}m`
                      : "1–1,440"
                  }
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20 disabled:bg-slate-100"
                />
                <p className="text-[11px] text-slate-500">
                  Leave blank to keep{" "}
                  {formatDurationMinutes(round.duration_minutes)}.
                </p>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label
                  htmlFor="reopen-notes"
                  className="block text-xs font-medium text-slate-700"
                >
                  Reopen Reason / Note (Optional)
                </label>
                <input
                  id="reopen-notes"
                  name="notes"
                  type="text"
                  maxLength={500}
                  disabled={!canAttemptReopen || reopenPending}
                  placeholder="Reason for reopening this round"
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20 disabled:bg-slate-100"
                />
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2.5">
              <input
                id="confirm-reopen-round"
                name="confirmReopen"
                type="checkbox"
                checked={confirmReopen}
                onChange={(e) => setConfirmReopen(e.target.checked)}
                disabled={!canAttemptReopen || reopenPending}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#4B0507]"
              />
              <label
                htmlFor="confirm-reopen-round"
                className="text-xs text-amber-950"
              >
                I confirm reopening this round to make it immediately visible to
                eligible teams under a fresh timer.
              </label>
            </div>

            {event.status !== "active" ? (
              <p className="text-xs text-amber-800">
                Parent event must have status &ldquo;Active&rdquo; before this
                round can be reopened.
              </p>
            ) : null}

            {reopenState ? (
              <div
                role={reopenState.ok ? "status" : "alert"}
                aria-live="polite"
                className={`rounded-md border px-3 py-2 text-xs ${
                  reopenState.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-red-200 bg-red-50 text-red-900"
                }`}
              >
                {reopenState.message}
              </div>
            ) : null}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={
                  !canAttemptReopen || !confirmReopen || reopenPending
                }
                className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#4B0507] px-4 py-2 text-sm font-medium whitespace-nowrap text-white hover:bg-[#380305] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                <span>
                  {reopenPending
                    ? "Reopening..."
                    : `Reopen Round (Session #${(effective?.sessionCount ?? sessions.length) + 1})`}
                </span>
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Immutable Release Session History */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Release &amp; Closure History
          </h3>
          <span className="font-mono text-xs tabular-nums text-slate-500">
            {sessions.length}{" "}
            {sessions.length === 1 ? "session" : "sessions"}
          </span>
        </div>

        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th scope="col" className="px-3 py-2.5 font-mono">
                  Session
                </th>
                <th scope="col" className="px-3 py-2.5 font-mono">
                  Duration
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Started At
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Scheduled Expiry
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Actual Closed At
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Outcome
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sessions.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-6 text-center text-slate-500"
                  >
                    This round has not been released yet.
                  </td>
                </tr>
              ) : (
                sessions.map((session) => {
                  const isOpenExpired =
                    session.closed_at === null &&
                    Number.isFinite(dbNowMs) &&
                    dbNowMs >= Date.parse(session.expires_at);

                  const outcomeLabel =
                    session.close_reason === "manual"
                      ? "Closed Manually"
                      : session.close_reason === "expired"
                        ? "Expired Automatically"
                        : isOpenExpired
                          ? "Expired (Pending Sync)"
                          : "Active (Live)";

                  return (
                    <tr key={session.id} className="align-top">
                      <td className="px-3 py-2.5 font-mono font-semibold tabular-nums text-slate-800">
                        #{session.session_number}
                      </td>
                      <td className="px-3 py-2.5 font-mono tabular-nums text-slate-700">
                        {session.duration_minutes}m
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-700">
                        {formatIstTimestamp(session.started_at)}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-700">
                        {formatIstTimestamp(session.expires_at)}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-700">
                        {session.closed_at
                          ? formatIstTimestamp(session.closed_at)
                          : isOpenExpired
                            ? `${formatIstTimestamp(session.expires_at)} (expiry)`
                            : "—"}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-slate-900">
                        {outcomeLabel}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">
                        {session.notes || "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
