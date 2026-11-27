"use client";

import React, { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  KeyRound,
  Lock,
  Plus,
  Trash2,
  Trophy,
} from "lucide-react";
import {
  createRoundAction,
  reorderRoundsAction,
  updateEventAction,
  type CompetitionActionResult,
} from "@/app/actions/competition";
import {
  createEventEntryAction,
  removeEventEntryAction,
  updateEventEntryStatusAction,
} from "@/app/actions/registry";
import {
  ATTRIBUTION_MODE_LABELS,
  CODENAME_MODE_LABELS,
  ENTRY_MODE_LABELS,
  ENTRY_STATUS_LABELS,
  EVENT_STATUS_LABELS,
  ROUND_STATUS_LABELS,
  SCORING_METHOD_LABELS,
  type ContingentRecord,
  type EventEntryRecord,
  type EventEntryStatus,
  type EventEntryType,
  type EventRecord,
  type ParticipantRecord,
  type RoundRecord,
  type RoundReleaseSessionRecord,
} from "@/types/competition";
import {
  deriveRoundReleaseState,
  EFFECTIVE_RELEASE_STATE_LABELS,
  MAX_ROUND_DURATION_MINUTES,
  MIN_ROUND_DURATION_MINUTES,
} from "@/lib/competition/round-release";
import { ROUND_CREATE_STATUSES } from "@/lib/competition/validation";

export interface EventEntryView extends EventEntryRecord {
  contingent: Pick<
    ContingentRecord,
    "id" | "contingent_code" | "name" | "institution_name" | "is_active"
  > | null;
  participant: Pick<
    ParticipantRecord,
    "id" | "participant_code" | "full_name" | "institution_name" | "is_active"
  > | null;
}

interface EventDetailManagerProps {
  event: EventRecord;
  rounds: RoundRecord[];
  entries: EventEntryView[];
  availableContingents: Pick<
    ContingentRecord,
    "id" | "contingent_code" | "name" | "institution_name" | "is_active"
  >[];
  availableParticipants: Pick<
    ParticipantRecord,
    "id" | "participant_code" | "full_name" | "institution_name" | "is_active"
  >[];
  codenameAssignmentCount?: number;
  eventWideCodenameByEntryId?: Record<string, string>;
  roundCodenameCountMap?: Record<string, number>;
  releaseSessionsByRoundId?: Record<string, RoundReleaseSessionRecord[]>;
  dbServerNowIso?: string | null;
  releaseMigrationMissing?: boolean;
  releaseLoadError?: string | null;
  leaderboardEntryCount?: number | null;
  leaderboardIsPublished?: boolean | null;
}

export function EventDetailManager({
  event,
  rounds,
  entries,
  availableContingents,
  availableParticipants,
  codenameAssignmentCount = 0,
  eventWideCodenameByEntryId = {},
  roundCodenameCountMap = {},
  releaseSessionsByRoundId = {},
  dbServerNowIso = null,
  releaseMigrationMissing = false,
  releaseLoadError = null,
  leaderboardEntryCount = null,
  leaderboardIsPublished = null,
}: EventDetailManagerProps) {
  const router = useRouter();
  const parsedDbNowMs = dbServerNowIso ? Date.parse(dbServerNowIso) : NaN;
  const hasClockError =
    !releaseMigrationMissing && (!dbServerNowIso || !Number.isFinite(parsedDbNowMs));
  const releaseStatusUnavailable =
    releaseMigrationMissing || Boolean(releaseLoadError) || hasClockError;
  const [isPending, startTransition] = useTransition();
  const [roundFeedback, setRoundFeedback] =
    useState<CompetitionActionResult | null>(null);
  const [entryFeedback, setEntryFeedback] =
    useState<CompetitionActionResult | null>(null);
  const [confirmRemoveEntryId, setConfirmRemoveEntryId] = useState<
    string | null
  >(null);

  const defaultEntryType: EventEntryType =
    event.entry_mode === "individual" ? "individual" : "contingent";
  const [selectedEntryType, setSelectedEntryType] =
    useState<EventEntryType>(defaultEntryType);

  const [editState, editFormAction, editPending] = useActionState<
    CompetitionActionResult | null,
    FormData
  >(async (prev, formData) => {
    const result = await updateEventAction(prev, formData);
    if (result.ok) {
      router.refresh();
    }
    return result;
  }, null);

  const [createRoundState, createRoundFormAction, createRoundPending] =
    useActionState<CompetitionActionResult | null, FormData>(
      async (prev, formData) => {
        const result = await createRoundAction(prev, formData);
        if (result.ok) {
          router.refresh();
        }
        return result;
      },
      null,
    );

  const [createEntryState, createEntryFormAction, createEntryPending] =
    useActionState<CompetitionActionResult | null, FormData>(
      async (prev, formData) => {
        const result = await createEventEntryAction(prev, formData);
        if (result.ok) {
          router.refresh();
        }
        return result;
      },
      null,
    );

  const nextRoundNumber =
    rounds.length > 0
      ? Math.max(...rounds.map((r) => r.round_number)) + 1
      : 1;

  const existingContingentIds = new Set(
    entries.map((e) => e.contingent_id).filter(Boolean),
  );
  const existingParticipantIds = new Set(
    entries.map((e) => e.participant_id).filter(Boolean),
  );

  const selectableContingents = availableContingents.filter(
    (c) => c.is_active && !existingContingentIds.has(c.id),
  );
  const selectableParticipants = availableParticipants.filter(
    (p) => p.is_active && !existingParticipantIds.has(p.id),
  );

  function handleMoveRound(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= rounds.length) return;
    const reordered = [...rounds];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    setRoundFeedback(null);
    startTransition(async () => {
      const result = await reorderRoundsAction(
        event.id,
        reordered.map((r) => r.id),
      );
      setRoundFeedback(result);
      if (result.ok) {
        router.refresh();
      }
    });
  }

  function handleEntryStatusChange(
    entryId: string,
    nextStatus: EventEntryStatus,
  ) {
    setEntryFeedback(null);
    startTransition(async () => {
      const result = await updateEventEntryStatusAction(
        event.id,
        entryId,
        nextStatus,
      );
      setEntryFeedback(result);
      if (result.ok) {
        router.refresh();
      }
    });
  }

  function handleRemoveEntry(entryId: string) {
    setEntryFeedback(null);
    startTransition(async () => {
      const result = await removeEventEntryAction(event.id, entryId);
      setEntryFeedback(result);
      setConfirmRemoveEntryId(null);
      if (result.ok) {
        router.refresh();
      }
    });
  }

  const effectiveEntryType: EventEntryType =
    event.entry_mode === "hybrid" ? selectedEntryType : defaultEntryType;

  return (
    <div className="space-y-10">
      {/* Event Summary Strip */}
      <dl className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-white p-5 sm:grid-cols-4">
        <div>
          <dt className="text-xs font-medium text-slate-500">Entry Mode</dt>
          <dd className="mt-1 text-sm font-medium text-slate-900">
            {ENTRY_MODE_LABELS[event.entry_mode]}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">Codename Mode</dt>
          <dd className="mt-1 text-sm font-medium text-slate-900">
            {CODENAME_MODE_LABELS[event.codename_mode]}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">Status</dt>
          <dd className="mt-1 text-sm font-medium text-slate-900">
            {EVENT_STATUS_LABELS[event.status]}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">
            Rounds / Entries
          </dt>
          <dd className="mt-1 font-mono text-sm font-medium tabular-nums text-slate-900">
            {rounds.length} rounds · {entries.length} entries
          </dd>
        </div>
      </dl>

      {/* Codenames & Overall Leaderboard Management Strips */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section
          aria-label="Event codename management"
          className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-slate-900">
              <KeyRound
                className="h-4 w-4 text-[#4B0507]"
                aria-hidden="true"
              />
              <span>Entry Codenames</span>
            </h2>
            <p className="text-sm text-slate-600">
              Mode:{" "}
              <span className="font-medium text-slate-900">
                {CODENAME_MODE_LABELS[event.codename_mode]}
              </span>{" "}
              ·{" "}
              <span className="font-mono text-xs tabular-nums text-slate-700">
                {codenameAssignmentCount} assignment
                {codenameAssignmentCount === 1 ? "" : "s"} recorded
              </span>
            </p>
          </div>
          <Link
            href={`/events/${event.id}/codenames`}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md bg-[#4B0507] px-4 py-2 text-sm font-medium whitespace-nowrap text-white transition-colors hover:bg-[#380305] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
          >
            <span>Manage Codenames</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>

        <section
          aria-label="Event overall leaderboard management"
          className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-slate-900">
              <Trophy
                className="h-4 w-4 text-[#4B0507]"
                aria-hidden="true"
              />
              <span>Overall Leaderboard</span>
            </h2>
            <p className="text-sm text-slate-600">
              Event standings ·{" "}
              <span className="font-mono text-xs tabular-nums text-slate-700">
                {leaderboardEntryCount === null
                  ? "Migration 0008 pending"
                  : `${leaderboardEntryCount} ${leaderboardEntryCount === 1 ? "contingent" : "contingents"} ranked`}
              </span>
              {leaderboardIsPublished !== null ? (
                <>
                  {" "}
                  ·{" "}
                  <span
                    className={`font-medium ${
                      leaderboardIsPublished
                        ? "text-emerald-700"
                        : "text-slate-600"
                    }`}
                  >
                    {leaderboardIsPublished ? "Published" : "Unpublished"}
                  </span>
                </>
              ) : null}
            </p>
          </div>
          <Link
            href={`/events/${event.id}/leaderboard`}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border border-[#4B0507] bg-white px-4 py-2 text-sm font-medium whitespace-nowrap text-[#4B0507] transition-colors hover:bg-[#4B0507] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
          >
            <span>Manage Leaderboard</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>
      </div>

      {/* Event Configuration Form */}
      <section
        aria-labelledby="edit-event-heading"
        className="rounded-lg border border-slate-200 bg-white p-6"
      >
        <div className="mb-5 border-b border-slate-100 pb-4">
          <h2
            id="edit-event-heading"
            className="font-display text-lg font-semibold text-slate-900"
          >
            Event Settings
          </h2>
          <p className="text-sm text-slate-600">
            Update event configuration, entry mode, codename mode, or status.
          </p>
        </div>

        <form action={editFormAction} className="space-y-5">
          <input type="hidden" name="eventId" value={event.id} />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="edit-event-code"
                className="block text-xs font-medium text-slate-700"
              >
                Event Code
              </label>
              <input
                id="edit-event-code"
                name="code"
                type="text"
                required
                defaultValue={event.code}
                maxLength={40}
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm uppercase text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="edit-event-name"
                className="block text-xs font-medium text-slate-700"
              >
                Event Name
              </label>
              <input
                id="edit-event-name"
                name="name"
                type="text"
                required
                defaultValue={event.name}
                maxLength={160}
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="edit-entry-mode"
                className="block text-xs font-medium text-slate-700"
              >
                Entry Mode
              </label>
              <select
                id="edit-entry-mode"
                name="entryMode"
                defaultValue={event.entry_mode}
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
              >
                {Object.entries(ENTRY_MODE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="edit-codename-mode"
                className="block text-xs font-medium text-slate-700"
              >
                Codename Mode
              </label>
              <select
                id="edit-codename-mode"
                name="codenameMode"
                defaultValue={event.codename_mode}
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
              >
                {Object.entries(CODENAME_MODE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="edit-event-status"
                className="block text-xs font-medium text-slate-700"
              >
                Status
              </label>
              <select
                id="edit-event-status"
                name="status"
                defaultValue={event.status}
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
              >
                {Object.entries(EVENT_STATUS_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="edit-min-team"
                  className="block text-xs font-medium text-slate-700"
                >
                  Min Team Size
                </label>
                <input
                  id="edit-min-team"
                  name="minTeamSize"
                  type="number"
                  min={1}
                  max={100}
                  defaultValue={event.min_team_size ?? ""}
                  placeholder="Any"
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="edit-max-team"
                  className="block text-xs font-medium text-slate-700"
                >
                  Max Team Size
                </label>
                <input
                  id="edit-max-team"
                  name="maxTeamSize"
                  type="number"
                  min={1}
                  max={100}
                  defaultValue={event.max_team_size ?? ""}
                  placeholder="Any"
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="edit-event-description"
              className="block text-xs font-medium text-slate-700"
            >
              Description
            </label>
            <textarea
              id="edit-event-description"
              name="description"
              rows={3}
              maxLength={2000}
              defaultValue={event.description ?? ""}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
            />
          </div>

          {editState ? (
            <div
              role={editState.ok ? "status" : "alert"}
              aria-live="polite"
              className={`rounded-md border px-3 py-2.5 text-sm ${
                editState.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-red-200 bg-red-50 text-red-900"
              }`}
            >
              {editState.message}
            </div>
          ) : null}

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <button
              type="submit"
              disabled={editPending}
              className="min-h-10 rounded-md bg-[#4B0507] px-5 py-2 text-sm font-medium whitespace-nowrap text-white transition-colors hover:bg-[#380305] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
            >
              {editPending ? "Saving Changes..." : "Update Event"}
            </button>
          </div>
        </form>
      </section>

      {/* Rounds Section */}
      <section aria-labelledby="event-rounds-heading" className="space-y-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h2
              id="event-rounds-heading"
              className="font-display text-lg font-semibold text-slate-900"
            >
              Event Rounds
            </h2>
            <p className="text-sm text-slate-600">
              Configure round sequence, scoring method, attribution mode, and
              open each round to manage judging criteria.
            </p>
          </div>
          <span className="font-mono text-xs tabular-nums text-slate-500">
            {rounds.length} {rounds.length === 1 ? "round" : "rounds"}
          </span>
        </div>

        {releaseMigrationMissing ? (
          <div
            role="status"
            className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            Round release migration 0007 is not applied yet. Live release status
            and session history are unavailable until migration 0007 is applied.
          </div>
        ) : releaseLoadError || hasClockError ? (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          >
            {releaseLoadError ??
              "Unable to read authoritative database clock timestamp. Round release status is temporarily unavailable."}
          </div>
        ) : null}

        {roundFeedback ? (
          <div
            role={roundFeedback.ok ? "status" : "alert"}
            aria-live="polite"
            className={`rounded-lg border px-4 py-3 text-sm ${
              roundFeedback.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-red-200 bg-red-50 text-red-900"
            }`}
          >
            {roundFeedback.message}
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-600">
                <th scope="col" className="px-4 py-3 font-mono">
                  Order
                </th>
                <th scope="col" className="px-4 py-3">
                  Round Name
                </th>
                <th scope="col" className="px-4 py-3">
                  Scoring Method
                </th>
                <th scope="col" className="px-4 py-3">
                  Attribution
                </th>
                <th scope="col" className="px-4 py-3">
                  Status &amp; Lock
                </th>
                <th scope="col" className="px-4 py-3">
                  Duration &amp; Release
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rounds.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-sm text-slate-500"
                  >
                    No rounds have been created for this event yet.
                  </td>
                </tr>
              ) : (
                rounds.map((round, index) => {
                  const roundSessions = releaseSessionsByRoundId[round.id] ?? [];
                  const derived =
                    !releaseStatusUnavailable && Number.isFinite(parsedDbNowMs)
                      ? deriveRoundReleaseState({
                          round,
                          eventStatus: event.status,
                          sessions: roundSessions,
                          dbNowMs: parsedDbNowMs,
                        })
                      : null;

                  const releaseBadgeTone =
                    derived === null
                      ? releaseMigrationMissing
                        ? "text-amber-800"
                        : "text-red-800"
                      : derived.effectiveState === "live"
                        ? "text-emerald-800"
                        : derived.effectiveState === "expired" ||
                            derived.effectiveState === "closed"
                          ? "text-amber-800"
                          : derived.effectiveState === "ready"
                            ? "text-sky-800"
                            : "text-slate-600";

                  return (
                    <tr
                      key={round.id}
                      className="align-middle hover:bg-slate-50/60"
                    >
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap tabular-nums text-slate-700">
                        Round {round.round_number}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        <Link
                          href={`/events/${event.id}/rounds/${round.id}`}
                          className="rounded hover:text-[#4B0507] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                        >
                          {round.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap text-slate-700">
                        {SCORING_METHOD_LABELS[round.scoring_method]}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap text-slate-700">
                        {ATTRIBUTION_MODE_LABELS[round.attribution_mode]}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <span className="font-medium text-slate-800">
                          {ROUND_STATUS_LABELS[round.status]}
                        </span>
                        {round.is_locked ? (
                          <span className="ml-2 inline-flex items-center gap-1 font-medium text-amber-800">
                            <Lock className="h-3 w-3" aria-hidden="true" />
                            Locked
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <div className="font-mono tabular-nums text-slate-800">
                          {round.duration_minutes !== null
                            ? `${round.duration_minutes}m`
                            : "Duration not set"}
                          {derived && derived.sessionCount > 0
                            ? ` · Session #${derived.latestSession?.session_number ?? derived.sessionCount}`
                            : ""}
                        </div>
                        <div className={`font-medium ${releaseBadgeTone}`}>
                          {derived
                            ? EFFECTIVE_RELEASE_STATE_LABELS[derived.effectiveState]
                            : releaseMigrationMissing
                              ? "Migration 0007 required"
                              : "Unavailable (Load Error)"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={isPending || index === 0}
                            onClick={() => handleMoveRound(index, -1)}
                            aria-label={`Move ${round.name} earlier`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                          >
                            <ArrowUp
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                          </button>
                          <button
                            type="button"
                            disabled={isPending || index === rounds.length - 1}
                            onClick={() => handleMoveRound(index, 1)}
                            aria-label={`Move ${round.name} later`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                          >
                            <ArrowDown
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                          </button>
                          {event.codename_mode === "per_round" ? (
                            <Link
                              href={`/events/${event.id}/codenames?roundId=${round.id}`}
                              className="inline-flex min-h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap text-slate-800 hover:border-[#4B0507] hover:text-[#4B0507] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                            >
                              <KeyRound
                                className="h-3 w-3"
                                aria-hidden="true"
                              />
                              <span>
                                Codenames ({roundCodenameCountMap[round.id] ?? 0}
                                )
                              </span>
                            </Link>
                          ) : null}
                          <Link
                            href={`/events/${event.id}/rounds/${round.id}`}
                            className="inline-flex min-h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                          >
                            <span>Criteria &amp; Release</span>
                            <ArrowRight
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Add Round Form */}
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h3 className="mb-4 font-display text-base font-semibold text-slate-900">
            Add Round
          </h3>
          <form action={createRoundFormAction} className="space-y-4">
            <input type="hidden" name="eventId" value={event.id} />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="new-round-number"
                  className="block text-xs font-medium text-slate-700"
                >
                  Round Number
                </label>
                <input
                  id="new-round-number"
                  name="roundNumber"
                  type="number"
                  required
                  min={1}
                  max={99}
                  defaultValue={nextRoundNumber}
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label
                  htmlFor="new-round-name"
                  className="block text-xs font-medium text-slate-700"
                >
                  Round Name
                </label>
                <input
                  id="new-round-name"
                  name="name"
                  type="text"
                  required
                  maxLength={160}
                  placeholder="Enter round title"
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="new-round-scoring"
                  className="block text-xs font-medium text-slate-700"
                >
                  Scoring Method
                </label>
                <select
                  id="new-round-scoring"
                  name="scoringMethod"
                  defaultValue="criteria_sum"
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                >
                  {Object.entries(SCORING_METHOD_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="new-round-attribution"
                  className="block text-xs font-medium text-slate-700"
                >
                  Attribution Mode
                </label>
                <select
                  id="new-round-attribution"
                  name="attributionMode"
                  defaultValue="individual_judge"
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                >
                  {Object.entries(ATTRIBUTION_MODE_LABELS).map(
                    ([val, label]) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="new-round-status"
                  className="block text-xs font-medium text-slate-700"
                >
                  Initial Status
                </label>
                <select
                  id="new-round-status"
                  name="status"
                  defaultValue="draft"
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                >
                  {ROUND_CREATE_STATUSES.map((val) => (
                    <option key={val} value={val}>
                      {ROUND_STATUS_LABELS[val]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="new-round-duration"
                  className="block text-xs font-medium text-slate-700"
                >
                  Duration (Minutes, Optional)
                </label>
                <input
                  id="new-round-duration"
                  name="durationMinutes"
                  type="number"
                  min={MIN_ROUND_DURATION_MINUTES}
                  max={MAX_ROUND_DURATION_MINUTES}
                  step={1}
                  placeholder="1–1,440 min (set before release)"
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="new-round-description"
                className="block text-xs font-medium text-slate-700"
              >
                Round Notes (Optional)
              </label>
              <textarea
                id="new-round-description"
                name="description"
                rows={2}
                maxLength={2000}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
              />
            </div>

            {createRoundState ? (
              <div
                role={createRoundState.ok ? "status" : "alert"}
                aria-live="polite"
                className={`rounded-md border px-3 py-2.5 text-sm ${
                  createRoundState.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-red-200 bg-red-50 text-red-900"
                }`}
              >
                {createRoundState.message}
              </div>
            ) : null}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={createRoundPending}
                className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#4B0507] px-4 py-2 text-sm font-medium whitespace-nowrap text-white hover:bg-[#380305] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
              >
                <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{createRoundPending ? "Adding..." : "Add Round"}</span>
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Event Entries Section */}
      <section aria-labelledby="event-entries-heading" className="space-y-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h2
              id="event-entries-heading"
              className="font-display text-lg font-semibold text-slate-900"
            >
              Event Entries
            </h2>
            <p className="text-sm text-slate-600">
              Each entry references either a contingent or an individual
              participant according to the event&apos;s entry mode.
            </p>
          </div>
          <span className="font-mono text-xs tabular-nums text-slate-500">
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </span>
        </div>

        {entryFeedback ? (
          <div
            role={entryFeedback.ok ? "status" : "alert"}
            aria-live="polite"
            className={`rounded-lg border px-4 py-3 text-sm ${
              entryFeedback.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-red-200 bg-red-50 text-red-900"
            }`}
          >
            {entryFeedback.message}
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-600">
                <th scope="col" className="px-4 py-3">
                  Entry Type
                </th>
                <th scope="col" className="px-4 py-3">
                  Contingent / Participant
                </th>
                <th scope="col" className="px-4 py-3">
                  Institution
                </th>
                <th scope="col" className="px-4 py-3">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {entries.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-slate-500"
                  >
                    No contingents or individual participants have been entered
                    into this event yet.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => {
                  const confirmingRemove = confirmRemoveEntryId === entry.id;
                  const subjectLabel =
                    entry.entry_type === "contingent" && entry.contingent
                      ? `${entry.contingent.contingent_code} ${entry.contingent.name}`
                      : entry.participant
                        ? `${entry.participant.participant_code} ${entry.participant.full_name}`
                        : entry.id;
                  return (
                    <tr
                      key={entry.id}
                      className="align-middle hover:bg-slate-50/60"
                    >
                      <td className="px-4 py-3 text-xs font-medium text-slate-700 capitalize">
                        {entry.entry_type}
                      </td>
                      <td className="px-4 py-3">
                        {entry.entry_type === "contingent" &&
                        entry.contingent ? (
                          <Link
                            href={`/contingents/${entry.contingent.id}`}
                            className="rounded hover:text-[#4B0507] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                          >
                            <span className="font-mono text-xs text-[#4B0507]">
                              {entry.contingent.contingent_code}
                            </span>{" "}
                            <span className="font-medium text-slate-900">
                              {entry.contingent.name}
                            </span>
                          </Link>
                        ) : entry.participant ? (
                          <Link
                            href={`/participants/${entry.participant.id}`}
                            className="rounded hover:text-[#4B0507] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                          >
                            <span className="font-mono text-xs text-[#4B0507]">
                              {entry.participant.participant_code}
                            </span>{" "}
                            <span className="font-medium text-slate-900">
                              {entry.participant.full_name}
                            </span>
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-500">
                            Unknown subject
                          </span>
                        )}
                        {event.codename_mode === "event_wide" &&
                        eventWideCodenameByEntryId[entry.id] ? (
                          <p className="mt-1 font-mono text-[11px] text-slate-600">
                            Codename:{" "}
                            <span className="font-semibold text-slate-800">
                              {eventWideCodenameByEntryId[entry.id]}
                            </span>
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {entry.entry_type === "contingent"
                          ? entry.contingent?.institution_name ?? "—"
                          : entry.participant?.institution_name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          aria-label={`Entry status for ${subjectLabel}`}
                          value={entry.status}
                          disabled={isPending}
                          onChange={(e) =>
                            handleEntryStatusChange(
                              entry.id,
                              e.target.value as EventEntryStatus,
                            )
                          }
                          className="min-h-8 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                        >
                          {Object.entries(ENTRY_STATUS_LABELS).map(
                            ([val, label]) => (
                              <option key={val} value={val}>
                                {label}
                              </option>
                            ),
                          )}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {confirmingRemove ? (
                            <>
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => handleRemoveEntry(entry.id)}
                                className="min-h-8 rounded border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-red-800 hover:bg-red-100 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                              >
                                Confirm Remove
                              </button>
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => setConfirmRemoveEntryId(null)}
                                className="min-h-8 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => setConfirmRemoveEntryId(entry.id)}
                              className="inline-flex min-h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap text-slate-700 hover:bg-red-50 hover:text-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                            >
                              <Trash2
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              <span>Remove</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Register Entry Form */}
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h3 className="mb-1 font-display text-base font-semibold text-slate-900">
            Register Entry into Event
          </h3>
          <p className="mb-4 text-sm text-slate-600">
            {event.status === "archived"
              ? "This event is archived and cannot accept new entries."
              : `Allowed mode: ${ENTRY_MODE_LABELS[event.entry_mode]}.`}
          </p>

          <form action={createEntryFormAction} className="space-y-4">
            <input type="hidden" name="eventId" value={event.id} />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="entry-type-select"
                  className="block text-xs font-medium text-slate-700"
                >
                  Entry Type
                </label>
                {event.entry_mode === "hybrid" ? (
                  <select
                    id="entry-type-select"
                    name="entryType"
                    value={effectiveEntryType}
                    onChange={(e) =>
                      setSelectedEntryType(e.target.value as EventEntryType)
                    }
                    className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                  >
                    <option value="contingent">Contingent (Team)</option>
                    <option value="individual">Individual Participant</option>
                  </select>
                ) : (
                  <>
                    <input
                      type="hidden"
                      name="entryType"
                      value={effectiveEntryType}
                    />
                    <input
                      id="entry-type-select"
                      type="text"
                      readOnly
                      value={
                        effectiveEntryType === "contingent"
                          ? "Contingent (Team)"
                          : "Individual Participant"
                      }
                      className="min-h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                    />
                  </>
                )}
              </div>

              {effectiveEntryType === "contingent" ? (
                <div className="space-y-1.5 md:col-span-2">
                  <label
                    htmlFor="entry-contingent-id"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Active Contingent
                  </label>
                  <select
                    id="entry-contingent-id"
                    name="contingentId"
                    required
                    defaultValue=""
                    className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                  >
                    <option value="" disabled>
                      {selectableContingents.length === 0
                        ? "No eligible active contingents available"
                        : "Select a contingent"}
                    </option>
                    {selectableContingents.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.contingent_code} — {c.name} ({c.institution_name})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-1.5 md:col-span-2">
                  <label
                    htmlFor="entry-participant-id"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Active Participant
                  </label>
                  <select
                    id="entry-participant-id"
                    name="participantId"
                    required
                    defaultValue=""
                    className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                  >
                    <option value="" disabled>
                      {selectableParticipants.length === 0
                        ? "No eligible active participants available"
                        : "Select a participant"}
                    </option>
                    {selectableParticipants.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.participant_code} — {p.full_name} (
                        {p.institution_name})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <label
                  htmlFor="entry-status"
                  className="block text-xs font-medium text-slate-700"
                >
                  Initial Entry Status
                </label>
                <select
                  id="entry-status"
                  name="status"
                  defaultValue="registered"
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                >
                  {Object.entries(ENTRY_STATUS_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label
                  htmlFor="entry-notes"
                  className="block text-xs font-medium text-slate-700"
                >
                  Notes (Optional)
                </label>
                <input
                  id="entry-notes"
                  name="notes"
                  type="text"
                  maxLength={1000}
                  placeholder="Optional registration note"
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                />
              </div>
            </div>

            {createEntryState ? (
              <div
                role={createEntryState.ok ? "status" : "alert"}
                aria-live="polite"
                className={`rounded-md border px-3 py-2.5 text-sm ${
                  createEntryState.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-red-200 bg-red-50 text-red-900"
                }`}
              >
                {createEntryState.message}
              </div>
            ) : null}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={
                  createEntryPending ||
                  event.status === "archived" ||
                  (effectiveEntryType === "contingent"
                    ? selectableContingents.length === 0
                    : selectableParticipants.length === 0)
                }
                className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#4B0507] px-4 py-2 text-sm font-medium whitespace-nowrap text-white hover:bg-[#380305] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
              >
                <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {createEntryPending ? "Registering..." : "Add Event Entry"}
                </span>
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
