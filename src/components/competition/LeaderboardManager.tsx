"use client";

import React, { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Edit3,
  Eye,
  EyeOff,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  Trophy,
} from "lucide-react";
import type { CompetitionActionResult } from "@/app/actions/competition";
import {
  addLeaderboardEntryAction,
  publishLeaderboardAction,
  removeLeaderboardEntryAction,
  unpublishLeaderboardAction,
  updateLeaderboardEntryAction,
} from "@/app/actions/leaderboard";
import {
  calculateCompetitionRankings,
  canPublishEventLeaderboard,
  canUnpublishEventLeaderboard,
  countRankOccurrences,
  formatLeaderboardScore,
  formatLeaderboardScoreInput,
  isLeaderboardEventReadOnly,
  MAX_LEADERBOARD_NOTES_LENGTH,
  validateLeaderboardScore,
} from "@/lib/leaderboard/validation";
import {
  ENTRY_MODE_LABELS,
  ENTRY_STATUS_LABELS,
  EVENT_STATUS_LABELS,
  type ContingentRecord,
  type EventRecord,
  type LeaderboardEntryView,
  type LeaderboardPublicationState,
  type ReadOnlyLeaderboardRow,
} from "@/types/competition";

interface LeaderboardManagerProps {
  event: Pick<EventRecord, "id" | "code" | "name" | "entry_mode" | "status">;
  entries: LeaderboardEntryView[];
  publishedEntries: ReadOnlyLeaderboardRow[];
  eligibleContingents: Pick<
    ContingentRecord,
    "id" | "contingent_code" | "name" | "institution_name" | "is_active"
  >[];
  publication: LeaderboardPublicationState;
  hasUnpublishedChanges: boolean;
  canManagePublication: boolean;
  migrationMissing: boolean;
  publicationMigrationMissing: boolean;
  snapshotMigrationMissing: boolean;
  loadError: string | null;
  publicationLoadError: string | null;
  snapshotLoadError: string | null;
}

function formatUtcTimestamp(isoString: string | null | undefined): string {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;
  return (
    d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "UTC",
    }) + " UTC"
  );
}

export function LeaderboardManager({
  event,
  entries,
  publishedEntries,
  eligibleContingents,
  publication,
  hasUnpublishedChanges,
  canManagePublication,
  migrationMissing,
  publicationMigrationMissing,
  snapshotMigrationMissing,
  loadError,
  publicationLoadError,
  snapshotLoadError,
}: LeaderboardManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<CompetitionActionResult | null>(
    null,
  );

  const rankedDraftEntries = useMemo(
    () => calculateCompetitionRankings(entries),
    [entries],
  );

  // Add form state
  const [selectedContingentId, setSelectedContingentId] = useState("");
  const [newScore, setNewScore] = useState("");
  const [newNotes, setNewNotes] = useState("");

  // Inline edit state (one row at a time)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editScore, setEditScore] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // Inline remove & publication confirmations
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [confirmPublicationAction, setConfirmPublicationAction] = useState<
    "publish" | "unpublish" | null
  >(null);

  const isEventArchived = isLeaderboardEventReadOnly(event.status);
  const isIndividualOnly = event.entry_mode === "individual";
  const isReadOnly =
    migrationMissing ||
    snapshotMigrationMissing ||
    Boolean(loadError) ||
    isEventArchived;
  const isPublicationUnavailable =
    migrationMissing ||
    publicationMigrationMissing ||
    snapshotMigrationMissing ||
    Boolean(loadError) ||
    Boolean(publicationLoadError) ||
    Boolean(snapshotLoadError);

  const hasLegacyNonNumericEntries = useMemo(
    () =>
      rankedDraftEntries.some(
        (entry) =>
          entry.score === null && Boolean(entry.display_value?.trim()),
      ),
    [rankedDraftEntries],
  );

  const publishEligibility = canPublishEventLeaderboard({
    eventStatus: event.status,
    entryMode: event.entry_mode,
    entryCount: rankedDraftEntries.length,
    isPublished: publication.isPublished,
    hasLegacyNonNumericEntries,
  });

  const unpublishEligibility = canUnpublishEventLeaderboard({
    eventStatus: event.status,
    isPublished: publication.isPublished,
  });

  const rankCounts = useMemo(
    () => countRankOccurrences(rankedDraftEntries),
    [rankedDraftEntries],
  );

  const scoredCount = useMemo(
    () => rankedDraftEntries.filter((e) => e.score !== null).length,
    [rankedDraftEntries],
  );

  const unrankedCount = rankedDraftEntries.length - scoredCount;

  const tiedEntryCount = useMemo(
    () =>
      rankedDraftEntries.filter(
        (e) =>
          e.calculatedRank !== null &&
          (rankCounts.get(e.calculatedRank) ?? 0) > 1,
      ).length,
    [rankedDraftEntries, rankCounts],
  );

  const newScoreValidation = useMemo(
    () => validateLeaderboardScore(newScore),
    [newScore],
  );

  const editScoreValidation = useMemo(
    () => validateLeaderboardScore(editScore),
    [editScore],
  );

  function closeInlineEditors() {
    setEditingEntryId(null);
    setEditScore("");
    setEditNotes("");
    setConfirmRemoveId(null);
  }

  function openEditRow(entry: LeaderboardEntryView) {
    setFeedback(null);
    setConfirmRemoveId(null);
    setEditingEntryId(entry.id);
    setEditScore(formatLeaderboardScoreInput(entry.score));
    setEditNotes(entry.notes ?? "");
  }

  function handleAddSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isReadOnly || isIndividualOnly || !selectedContingentId) return;

    if (!newScoreValidation.ok) {
      setFeedback({ ok: false, message: newScoreValidation.error });
      return;
    }

    const formData = new FormData();
    formData.set("eventId", event.id);
    formData.set("contingentId", selectedContingentId);
    formData.set("score", newScore);
    formData.set("notes", newNotes);

    setFeedback(null);
    closeInlineEditors();
    startTransition(async () => {
      const result = await addLeaderboardEntryAction(null, formData);
      setFeedback(result);
      if (result.ok) {
        setSelectedContingentId("");
        setNewScore("");
        setNewNotes("");
        router.refresh();
      }
    });
  }

  function handleEditSubmit(
    e: React.FormEvent<HTMLFormElement>,
    entryId: string,
  ) {
    e.preventDefault();
    if (isReadOnly) return;

    if (!editScoreValidation.ok) {
      setFeedback({ ok: false, message: editScoreValidation.error });
      return;
    }

    const formData = new FormData();
    formData.set("eventId", event.id);
    formData.set("entryId", entryId);
    formData.set("score", editScore);
    formData.set("notes", editNotes);

    setFeedback(null);
    startTransition(async () => {
      const result = await updateLeaderboardEntryAction(null, formData);
      setFeedback(result);
      if (result.ok) {
        closeInlineEditors();
        router.refresh();
      }
    });
  }

  function handleRemoveEntry(entryId: string) {
    if (isReadOnly) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await removeLeaderboardEntryAction(event.id, entryId);
      setFeedback(result);
      setConfirmRemoveId(null);
      if (result.ok) {
        if (editingEntryId === entryId) {
          closeInlineEditors();
        }
        router.refresh();
      }
    });
  }

  function handlePublishLeaderboard() {
    if (
      !canManagePublication ||
      isPublicationUnavailable ||
      !publishEligibility.ok
    ) {
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      const result = await publishLeaderboardAction(event.id);
      setFeedback(result);
      setConfirmPublicationAction(null);
      if (result.ok) {
        router.refresh();
      }
    });
  }

  function handleUnpublishLeaderboard() {
    if (
      !canManagePublication ||
      isPublicationUnavailable ||
      !unpublishEligibility.ok
    ) {
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      const result = await unpublishLeaderboardAction(event.id);
      setFeedback(result);
      setConfirmPublicationAction(null);
      if (result.ok) {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/events/${event.id}`}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-[#4B0507]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>
            Back to {event.code} · {event.name}
          </span>
        </Link>

        <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700">
          <ShieldCheck
            className="h-3.5 w-3.5 text-[#4B0507]"
            aria-hidden="true"
          />
          Numeric Draft &amp; Snapshot Standings · Audited
        </span>
      </div>

      {migrationMissing ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"
            aria-hidden="true"
          />
          <div className="space-y-1">
            <p className="font-semibold">
              Stage 3A database migration is not yet applied
            </p>
            <p className="text-amber-900">
              The <code className="font-mono">leaderboard_entries</code> table
              was not found in Supabase. Apply migration{" "}
              <code className="font-mono">
                supabase/migrations/202611220008_stage3a_overall_leaderboard.sql
              </code>{" "}
              first.
            </p>
          </div>
        </div>
      ) : null}

      {publicationMigrationMissing ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"
            aria-hidden="true"
          />
          <div className="space-y-1">
            <p className="font-semibold">
              Stage 4.4D publication migration is not yet applied
            </p>
            <p className="text-amber-900">
              The{" "}
              <code className="font-mono">leaderboard_publications</code> table
              was not found in Supabase. Apply migration{" "}
              <code className="font-mono">
                supabase/migrations/202611270012_stage44d_leaderboard_publication.sql
              </code>{" "}
              before publishing standings.
            </p>
          </div>
        </div>
      ) : null}

      {snapshotMigrationMissing ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"
            aria-hidden="true"
          />
          <div className="space-y-1">
            <p className="font-semibold">
              Stage 4.4E numeric snapshot migration is not yet applied
            </p>
            <p className="text-amber-900">
              The{" "}
              <code className="font-mono">leaderboard_published_entries</code>{" "}
              table was not found in Supabase. Apply migration{" "}
              <code className="font-mono">
                supabase/migrations/202611270013_stage44e_numeric_leaderboard_snapshots.sql
              </code>{" "}
              before saving numeric draft scores or publishing snapshots.
            </p>
          </div>
        </div>
      ) : null}

      {loadError ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-950"
        >
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0 text-red-700"
            aria-hidden="true"
          />
          <div className="space-y-1">
            <p className="font-semibold">Unable to load event leaderboard</p>
            <p className="text-red-900">{loadError}</p>
          </div>
        </div>
      ) : null}

      {publicationLoadError ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-950"
        >
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0 text-red-700"
            aria-hidden="true"
          />
          <div className="space-y-1">
            <p className="font-semibold">
              Unable to load leaderboard publication status
            </p>
            <p className="text-red-900">{publicationLoadError}</p>
          </div>
        </div>
      ) : null}

      {snapshotLoadError ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-950"
        >
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0 text-red-700"
            aria-hidden="true"
          />
          <div className="space-y-1">
            <p className="font-semibold">
              Unable to load published leaderboard snapshot
            </p>
            <p className="text-red-900">{snapshotLoadError}</p>
          </div>
        </div>
      ) : null}

      {isEventArchived ? (
        <div
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          This event is archived. The overall leaderboard is read-only and
          cannot be modified, newly published, or unpublished.{" "}
          {publication.isPublished
            ? "Because a snapshot was published before archiving, registered participants can still view it."
            : "Because standings were not published before archiving, they remain hidden from participants."}
        </div>
      ) : null}

      {isIndividualOnly ? (
        <div
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          This event&apos;s entry mode is{" "}
          <span className="font-medium">
            {ENTRY_MODE_LABELS[event.entry_mode]}
          </span>
          . Overall leaderboards rank registered contingents; switch the event
          to Contingent or Hybrid entry mode to register contingents.
        </div>
      ) : null}

      {/* Summary Strip */}
      <dl className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-white p-5 sm:grid-cols-4">
        <div>
          <dt className="text-xs font-medium text-slate-500">Event Status</dt>
          <dd className="mt-1 text-sm font-semibold text-slate-900">
            {EVENT_STATUS_LABELS[event.status]}
          </dd>
          <dd className="mt-0.5 text-xs text-slate-500">
            {ENTRY_MODE_LABELS[event.entry_mode]}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">
            Draft Contingents
          </dt>
          <dd className="mt-1 font-mono text-lg font-semibold tabular-nums text-[#4B0507]">
            {rankedDraftEntries.length}
          </dd>
          <dd className="mt-0.5 text-xs text-slate-500">
            {scoredCount} scored · {unrankedCount} unranked
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">
            Eligible to Add
          </dt>
          <dd className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900">
            {eligibleContingents.length}
          </dd>
          <dd className="mt-0.5 text-xs text-slate-500">
            Registered / checked-in
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">
            Auto-Calculated Ties
          </dt>
          <dd className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900">
            {tiedEntryCount}
          </dd>
          <dd className="mt-0.5 text-xs text-slate-500">
            Competition rank (1, 1, 3)
          </dd>
        </div>
      </dl>

      {/* Draft vs Published Snapshot Control Panel */}
      <section
        aria-labelledby="leaderboard-publication-heading"
        className="rounded-lg border border-slate-200 bg-white p-5"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2
                id="leaderboard-publication-heading"
                className="font-display text-base font-semibold text-slate-900"
              >
                Participant Visibility &amp; Snapshot
              </h2>
              {publication.isPublished ? (
                hasUnpublishedChanges ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Published · Unpublished Draft Changes</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Published · Up to Date</span>
                  </span>
                )
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                  <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Unpublished (Draft Only)</span>
                </span>
              )}
            </div>

            <p className="text-sm text-slate-600">
              {publication.isPublished
                ? hasUnpublishedChanges
                  ? "Your draft standings have changed since the last publication. Participants still see the previous published snapshot until a Super Admin publishes this updated ranking."
                  : "Participants currently see the published snapshot matching your draft standings. Any new draft edits remain hidden until you click Publish Ranking."
                : "Draft changes stay private to organisers. Participants will not see any standings until a Super Admin clicks Publish Ranking."}
            </p>

            {publication.publishedAt ? (
              <p className="text-xs text-slate-500">
                Last published: {formatUtcTimestamp(publication.publishedAt)}
                {!publication.isPublished && publication.unpublishedAt
                  ? ` · Unpublished: ${formatUtcTimestamp(publication.unpublishedAt)}`
                  : ""}
              </p>
            ) : !publication.isPublished && publication.unpublishedAt ? (
              <p className="text-xs text-slate-500">
                Last unpublished: {formatUtcTimestamp(publication.unpublishedAt)}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!canManagePublication ? (
              <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                Super Admin required to publish or unpublish
              </span>
            ) : isEventArchived ? (
              <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                Locked on archived events
              </span>
            ) : (
              <>
                <button
                  type="button"
                  disabled={
                    isPending ||
                    isPublicationUnavailable ||
                    !publishEligibility.ok ||
                    confirmPublicationAction === "publish"
                  }
                  title={
                    !publishEligibility.ok
                      ? publishEligibility.error
                      : undefined
                  }
                  onClick={() => {
                    setFeedback(null);
                    setConfirmPublicationAction("publish");
                  }}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-[#4B0507] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#380305] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {publication.isPublished
                      ? hasUnpublishedChanges
                        ? "Publish Updated Ranking"
                        : "Publish Ranking"
                      : "Publish Ranking"}
                  </span>
                </button>

                {publication.isPublished ? (
                  <button
                    type="button"
                    disabled={
                      isPending ||
                      isPublicationUnavailable ||
                      !unpublishEligibility.ok ||
                      confirmPublicationAction === "unpublish"
                    }
                    onClick={() => {
                      setFeedback(null);
                      setConfirmPublicationAction("unpublish");
                    }}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:border-red-300 hover:bg-red-50 hover:text-red-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Unpublish</span>
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>

        {confirmPublicationAction === "publish" ? (
          <div className="mt-4 flex flex-col gap-3 rounded-md border border-[#4B0507]/25 bg-[#4B0507]/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-relaxed text-slate-800">
              <span className="font-semibold text-slate-900">
                Confirm snapshot publication:
              </span>{" "}
              All current draft changes ({scoredCount} scored, {unrankedCount}{" "}
              unranked) will become visible to registered participants as one
              atomic snapshot.
              {unrankedCount > 0
                ? " Teams without a score will appear as Unranked."
                : ""}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                disabled={
                  isPending ||
                  isPublicationUnavailable ||
                  !publishEligibility.ok
                }
                onClick={handlePublishLeaderboard}
                className="min-h-9 rounded-md bg-[#4B0507] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#380305] disabled:opacity-50"
              >
                {isPending ? "Publishing..." : "Confirm Publish Ranking"}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setConfirmPublicationAction(null)}
                className="min-h-9 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {confirmPublicationAction === "unpublish" ? (
          <div className="mt-4 flex flex-col gap-3 rounded-md border border-red-200 bg-red-50/80 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-relaxed text-red-950">
              <span className="font-semibold">Confirm unpublish:</span>{" "}
              Participant standings will be hidden immediately in the Team
              Portal. All draft scores and entries remain saved for organisers.
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                disabled={
                  isPending ||
                  isPublicationUnavailable ||
                  !unpublishEligibility.ok
                }
                onClick={handleUnpublishLeaderboard}
                className="min-h-9 rounded-md border border-red-300 bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isPending ? "Unpublishing..." : "Confirm Unpublish"}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setConfirmPublicationAction(null)}
                className="min-h-9 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {canManagePublication &&
        !isEventArchived &&
        !isPublicationUnavailable &&
        !publishEligibility.ok ? (
          <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-amber-800">
            {publishEligibility.error}
          </p>
        ) : null}
      </section>

      {feedback ? (
        <div
          role={feedback.ok ? "status" : "alert"}
          aria-live="polite"
          className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm ${
            feedback.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          {feedback.ok ? (
            <CheckCircle2
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
          ) : (
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
          )}
          <span>{feedback.message}</span>
        </div>
      ) : null}

      {/* Draft Standings Table */}
      <section aria-labelledby="leaderboard-table-heading" className="space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h2
              id="leaderboard-table-heading"
              className="flex items-center gap-2 font-display text-lg font-semibold text-slate-900"
            >
              <Trophy
                className="h-4 w-4 text-[#4B0507]"
                aria-hidden="true"
              />
              <span>Draft Standings Preview</span>
            </h2>
            <p className="text-sm text-slate-600">
              Higher numeric scores rank higher automatically using standard
              competition ranking (1, 1, 3). Teams without a score appear at the
              bottom as Unranked.
            </p>
          </div>
          <span className="font-mono text-xs tabular-nums text-slate-500">
            {rankedDraftEntries.length}{" "}
            {rankedDraftEntries.length === 1 ? "entry" : "entries"}
          </span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-600">
                <th scope="col" className="px-4 py-3">
                  Calculated Rank
                </th>
                <th scope="col" className="px-4 py-3">
                  Contingent
                </th>
                <th scope="col" className="px-4 py-3">
                  Score (Numeric)
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rankedDraftEntries.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-sm text-slate-500"
                  >
                    No contingents have been added to this event&apos;s draft
                    leaderboard yet.
                  </td>
                </tr>
              ) : (
                rankedDraftEntries.map((entry) => {
                  const isEditing = editingEntryId === entry.id;
                  const isConfirmingRemove = confirmRemoveId === entry.id;
                  const isTied =
                    entry.calculatedRank !== null &&
                    (rankCounts.get(entry.calculatedRank) ?? 0) > 1;
                  const hasLegacyText =
                    entry.score === null && Boolean(entry.display_value?.trim());

                  return (
                    <React.Fragment key={entry.id}>
                      <tr className="align-middle hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {entry.calculatedRank !== null ? (
                              <span className="rounded border border-slate-200 bg-slate-50 px-2.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-[#4B0507]">
                                #{entry.calculatedRank}
                              </span>
                            ) : (
                              <span className="rounded border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                                Unranked
                              </span>
                            )}
                            {isTied ? (
                              <span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                                Tied
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {entry.contingent ? (
                            <div className="space-y-0.5">
                              <Link
                                href={`/contingents/${entry.contingent.id}`}
                                className="hover:text-[#4B0507] hover:underline"
                              >
                                <span className="font-mono text-xs font-medium text-[#4B0507]">
                                  {entry.contingent.contingent_code}
                                </span>{" "}
                                <span className="font-medium text-slate-900">
                                  {entry.contingent.name}
                                </span>
                              </Link>
                              <p className="text-xs text-slate-500">
                                {entry.contingent.institution_name}
                                {entry.eventEntryStatus &&
                                entry.eventEntryStatus !== "registered" &&
                                entry.eventEntryStatus !== "checked_in"
                                  ? ` · Entry: ${ENTRY_STATUS_LABELS[entry.eventEntryStatus]}`
                                  : ""}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500">
                              Contingent {entry.contingent_id}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {entry.score !== null ? (
                            <p className="font-mono font-semibold tabular-nums text-slate-900">
                              {formatLeaderboardScore(entry.score)}
                            </p>
                          ) : hasLegacyText ? (
                            <div className="space-y-1">
                              <p className="text-xs font-semibold text-amber-900">
                                Legacy text: &ldquo;{entry.display_value}&rdquo;
                              </p>
                              <p className="text-xs text-amber-800">
                                Edit to enter a numeric score or clear before
                                publishing.
                              </p>
                            </div>
                          ) : (
                            <p className="text-xs font-medium text-slate-500">
                              No score (Unranked)
                            </p>
                          )}
                          {entry.notes ? (
                            <p className="mt-0.5 text-xs text-slate-500">
                              Note: {entry.notes}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isReadOnly ? (
                            <span className="text-xs text-slate-400">
                              Read-only
                            </span>
                          ) : (
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() =>
                                  isEditing
                                    ? closeInlineEditors()
                                    : openEditRow(entry)
                                }
                                className="inline-flex min-h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap text-slate-700 hover:border-[#4B0507] hover:text-[#4B0507] disabled:opacity-50"
                              >
                                <Edit3
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                <span>{isEditing ? "Close" : "Edit"}</span>
                              </button>
                              {isConfirmingRemove ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={isPending}
                                    onClick={() => handleRemoveEntry(entry.id)}
                                    className="min-h-8 rounded border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-red-800 hover:bg-red-100 disabled:opacity-60"
                                  >
                                    Confirm Remove
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isPending}
                                    onClick={() => setConfirmRemoveId(null)}
                                    className="min-h-8 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap text-slate-700 hover:bg-slate-50"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isPending}
                                  onClick={() => {
                                    setEditingEntryId(null);
                                    setConfirmRemoveId(entry.id);
                                  }}
                                  className="inline-flex min-h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap text-slate-700 hover:bg-red-50 hover:text-red-800 disabled:opacity-50"
                                >
                                  <Trash2
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                  <span>Remove</span>
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>

                      {isEditing ? (
                        <tr className="bg-slate-50/90">
                          <td colSpan={4} className="px-4 py-4">
                            <form
                              onSubmit={(e) => handleEditSubmit(e, entry.id)}
                              className="space-y-4 rounded-md border border-slate-200 bg-white p-4"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                                <p className="text-sm font-semibold text-slate-900">
                                  Edit Draft Score for{" "}
                                  {entry.contingent?.contingent_code ??
                                    entry.contingent_id}{" "}
                                  · {entry.contingent?.name ?? "Contingent"}
                                </p>
                                <span className="text-xs text-slate-500">
                                  Rank recalculates automatically
                                </span>
                              </div>

                              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                <div className="space-y-1.5">
                                  <label
                                    htmlFor={`edit-score-${entry.id}`}
                                    className="block text-xs font-medium text-slate-700"
                                  >
                                    Numeric Score (Blank = Unranked)
                                  </label>
                                  <input
                                    id={`edit-score-${entry.id}`}
                                    name="score"
                                    type="text"
                                    inputMode="decimal"
                                    value={editScore}
                                    onChange={(e) =>
                                      setEditScore(e.target.value)
                                    }
                                    placeholder="e.g. 95.5"
                                    className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                                  />
                                  {!editScoreValidation.ok ? (
                                    <p className="text-xs text-red-700">
                                      {editScoreValidation.error}
                                    </p>
                                  ) : null}
                                </div>

                                <div className="space-y-1.5 md:col-span-2">
                                  <label
                                    htmlFor={`edit-notes-${entry.id}`}
                                    className="block text-xs font-medium text-slate-700"
                                  >
                                    Organiser Note (Optional, Internal Only)
                                  </label>
                                  <input
                                    id={`edit-notes-${entry.id}`}
                                    name="notes"
                                    type="text"
                                    maxLength={MAX_LEADERBOARD_NOTES_LENGTH}
                                    value={editNotes}
                                    onChange={(e) =>
                                      setEditNotes(e.target.value)
                                    }
                                    placeholder="Optional internal note for audit log"
                                    className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                                  />
                                </div>
                              </div>

                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  disabled={isPending}
                                  onClick={closeInlineEditors}
                                  className="min-h-9 rounded-md border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="submit"
                                  disabled={
                                    isPending || !editScoreValidation.ok
                                  }
                                  className="min-h-9 rounded-md bg-[#4B0507] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#380305] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {isPending ? "Saving..." : "Save Draft"}
                                </button>
                              </div>
                            </form>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Currently Published Snapshot Preview (when live and differs from draft) */}
      {publication.isPublished && hasUnpublishedChanges ? (
        <section
          aria-labelledby="published-snapshot-preview-heading"
          className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2
                id="published-snapshot-preview-heading"
                className="font-display text-base font-semibold text-slate-900"
              >
                Currently Live Participant Snapshot
              </h2>
              <p className="text-xs text-slate-600">
                This is what participants currently see until a Super Admin
                publishes the updated draft above.
              </p>
            </div>
            <span className="font-mono text-xs tabular-nums text-slate-500">
              {publishedEntries.length}{" "}
              {publishedEntries.length === 1 ? "entry" : "entries"} live
            </span>
          </div>

          <div className="overflow-x-auto rounded-md border border-amber-200/80 bg-white">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th scope="col" className="px-3 py-2 font-medium">
                    Live Rank
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Contingent
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Live Score
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {publishedEntries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-3 py-4 text-center text-slate-500"
                    >
                      No entries in the current published snapshot.
                    </td>
                  </tr>
                ) : (
                  publishedEntries.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2 font-mono font-semibold text-[#4B0507]">
                        {row.rank !== null ? `#${row.rank}` : "Unranked"}
                      </td>
                      <td className="px-3 py-2 text-slate-800">
                        <span className="font-mono font-medium">
                          {row.contingentCode}
                        </span>{" "}
                        {row.contingentName}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-slate-900">
                        {row.score !== null
                          ? formatLeaderboardScore(row.score)
                          : row.displayLabel ?? "No score"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Add Contingent to Draft Leaderboard Form */}
      <section
        aria-labelledby="add-leaderboard-entry-heading"
        className="rounded-lg border border-slate-200 bg-white p-6"
      >
        <div className="mb-4 border-b border-slate-100 pb-3">
          <h2
            id="add-leaderboard-entry-heading"
            className="font-display text-base font-semibold text-slate-900"
          >
            Add Registered Contingent to Draft Leaderboard
          </h2>
          <p className="text-sm text-slate-600">
            Select a contingent registered in this event and enter a numeric
            score (decimals allowed). Leave score blank to keep the team
            unranked for now.
          </p>
        </div>

        <form onSubmit={handleAddSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5 md:col-span-2">
              <label
                htmlFor="add-leaderboard-contingent"
                className="block text-xs font-medium text-slate-700"
              >
                Registered Contingent
              </label>
              <select
                id="add-leaderboard-contingent"
                name="contingentId"
                required
                disabled={
                  isPending ||
                  isReadOnly ||
                  isIndividualOnly ||
                  eligibleContingents.length === 0
                }
                value={selectedContingentId}
                onChange={(e) => setSelectedContingentId(e.target.value)}
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20 disabled:bg-slate-50 disabled:text-slate-500"
              >
                <option value="" disabled>
                  {eligibleContingents.length === 0
                    ? "No additional eligible contingents available"
                    : "Select a registered contingent"}
                </option>
                {eligibleContingents.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.contingent_code} — {c.name} ({c.institution_name})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="add-leaderboard-score"
                className="block text-xs font-medium text-slate-700"
              >
                Numeric Score (Optional)
              </label>
              <input
                id="add-leaderboard-score"
                name="score"
                type="text"
                inputMode="decimal"
                disabled={isPending || isReadOnly || isIndividualOnly}
                value={newScore}
                onChange={(e) => setNewScore(e.target.value)}
                placeholder="e.g. 95.5 (blank = unranked)"
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20 disabled:bg-slate-50"
              />
              {!newScoreValidation.ok ? (
                <p className="text-xs text-red-700">
                  {newScoreValidation.error}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="add-leaderboard-notes"
              className="block text-xs font-medium text-slate-700"
            >
              Organiser Note (Optional, Internal Only)
            </label>
            <input
              id="add-leaderboard-notes"
              name="notes"
              type="text"
              maxLength={MAX_LEADERBOARD_NOTES_LENGTH}
              disabled={isPending || isReadOnly || isIndividualOnly}
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Optional internal note recorded in the audit log"
              className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20 disabled:bg-slate-50"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={
                isPending ||
                isReadOnly ||
                isIndividualOnly ||
                eligibleContingents.length === 0 ||
                !selectedContingentId ||
                !newScoreValidation.ok
              }
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#4B0507] px-4 py-2 text-sm font-medium whitespace-nowrap text-white hover:bg-[#380305] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
            >
              <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{isPending ? "Adding..." : "Add to Draft"}</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
