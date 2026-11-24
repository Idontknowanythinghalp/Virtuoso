"use client";

import React, { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Edit3,
  Plus,
  ShieldCheck,
  Trash2,
  Trophy,
} from "lucide-react";
import type { CompetitionActionResult } from "@/app/actions/competition";
import {
  addLeaderboardEntryAction,
  removeLeaderboardEntryAction,
  updateLeaderboardEntryAction,
} from "@/app/actions/leaderboard";
import {
  countPositionOccurrences,
  isLeaderboardEventReadOnly,
  MAX_LEADERBOARD_DISPLAY_VALUE_LENGTH,
  MAX_LEADERBOARD_NOTES_LENGTH,
  MAX_LEADERBOARD_POSITION,
  MIN_LEADERBOARD_POSITION,
  sortLeaderboardEntries,
} from "@/lib/leaderboard/validation";
import {
  ENTRY_MODE_LABELS,
  ENTRY_STATUS_LABELS,
  EVENT_STATUS_LABELS,
  type ContingentRecord,
  type EventRecord,
  type LeaderboardEntryView,
} from "@/types/competition";

interface LeaderboardManagerProps {
  event: Pick<EventRecord, "id" | "code" | "name" | "entry_mode" | "status">;
  entries: LeaderboardEntryView[];
  eligibleContingents: Pick<
    ContingentRecord,
    "id" | "contingent_code" | "name" | "institution_name" | "is_active"
  >[];
  migrationMissing: boolean;
  loadError: string | null;
}

export function LeaderboardManager({
  event,
  entries,
  eligibleContingents,
  migrationMissing,
  loadError,
}: LeaderboardManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<CompetitionActionResult | null>(
    null,
  );

  const sortedEntries = useMemo(
    () => sortLeaderboardEntries(entries),
    [entries],
  );

  // Add form state
  const [selectedContingentId, setSelectedContingentId] = useState("");
  const [newPosition, setNewPosition] = useState(
    String(
      entries.length > 0
        ? Math.max(...entries.map((e) => e.position)) + 1
        : 1,
    ),
  );
  const [newDisplayValue, setNewDisplayValue] = useState("");
  const [newNotes, setNewNotes] = useState("");

  // Inline edit state (one row at a time)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editPosition, setEditPosition] = useState("");
  const [editDisplayValue, setEditDisplayValue] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // Inline remove confirmation
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const isEventArchived = isLeaderboardEventReadOnly(event.status);
  const isIndividualOnly = event.entry_mode === "individual";
  const isReadOnly =
    migrationMissing || Boolean(loadError) || isEventArchived;

  const positionCounts = useMemo(
    () => countPositionOccurrences(sortedEntries),
    [sortedEntries],
  );

  const tiedEntryCount = useMemo(
    () =>
      sortedEntries.filter((e) => (positionCounts.get(e.position) ?? 0) > 1)
        .length,
    [sortedEntries, positionCounts],
  );

  function closeInlineEditors() {
    setEditingEntryId(null);
    setEditPosition("");
    setEditDisplayValue("");
    setEditNotes("");
    setConfirmRemoveId(null);
  }

  function openEditRow(entry: LeaderboardEntryView) {
    setFeedback(null);
    setConfirmRemoveId(null);
    setEditingEntryId(entry.id);
    setEditPosition(String(entry.position));
    setEditDisplayValue(entry.display_value);
    setEditNotes(entry.notes ?? "");
  }

  function handleAddSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isReadOnly || isIndividualOnly || !selectedContingentId) return;

    const formData = new FormData();
    formData.set("eventId", event.id);
    formData.set("contingentId", selectedContingentId);
    formData.set("position", newPosition);
    formData.set("displayValue", newDisplayValue);
    formData.set("notes", newNotes);

    setFeedback(null);
    closeInlineEditors();
    startTransition(async () => {
      const result = await addLeaderboardEntryAction(null, formData);
      setFeedback(result);
      if (result.ok) {
        const currentMax = sortedEntries.reduce(
          (max, e) => Math.max(max, e.position),
          0,
        );
        const submittedPos = Number.parseInt(newPosition, 10) || 0;
        setSelectedContingentId("");
        setNewPosition(String(Math.max(currentMax, submittedPos) + 1));
        setNewDisplayValue("");
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

    const formData = new FormData();
    formData.set("eventId", event.id);
    formData.set("entryId", entryId);
    formData.set("position", editPosition);
    formData.set("displayValue", editDisplayValue);
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
          Manual Organiser Standings · Audited
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
              before adding or editing leaderboard entries.
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

      {isEventArchived ? (
        <div
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          This event is archived. The overall leaderboard is read-only.
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
            Ranked Contingents
          </dt>
          <dd className="mt-1 font-mono text-lg font-semibold tabular-nums text-[#4B0507]">
            {sortedEntries.length}
          </dd>
          <dd className="mt-0.5 text-xs text-slate-500">
            Manual overall standings
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
          <dt className="text-xs font-medium text-slate-500">Tied Entries</dt>
          <dd className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900">
            {tiedEntryCount}
          </dd>
          <dd className="mt-0.5 text-xs text-slate-500">
            Shared positions allowed
          </dd>
        </div>
      </dl>

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

      {/* Standings Table */}
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
              <span>Overall Event Standings</span>
            </h2>
            <p className="text-sm text-slate-600">
              Standings are ranked by Position (ties share the same rank in
              deterministic order), with flexible display values independent of
              round schedules.
            </p>
          </div>
          <span className="font-mono text-xs tabular-nums text-slate-500">
            {sortedEntries.length}{" "}
            {sortedEntries.length === 1 ? "entry" : "entries"}
          </span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-600">
                <th scope="col" className="px-4 py-3">
                  Position
                </th>
                <th scope="col" className="px-4 py-3">
                  Contingent
                </th>
                <th scope="col" className="px-4 py-3">
                  Displayed Value
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sortedEntries.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-sm text-slate-500"
                  >
                    No contingents have been added to this event&apos;s
                    leaderboard yet.
                  </td>
                </tr>
              ) : (
                sortedEntries.map((entry) => {
                  const isEditing = editingEntryId === entry.id;
                  const isConfirmingRemove = confirmRemoveId === entry.id;
                  const isTied = (positionCounts.get(entry.position) ?? 0) > 1;

                  return (
                    <React.Fragment key={entry.id}>
                      <tr className="align-middle hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded border border-slate-200 bg-slate-50 px-2.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-[#4B0507]">
                              #{entry.position}
                            </span>
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
                          <p className="font-medium text-slate-900">
                            {entry.display_value}
                          </p>
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
                                  Edit Standing for{" "}
                                  {entry.contingent?.contingent_code ??
                                    entry.contingent_id}{" "}
                                  · {entry.contingent?.name ?? "Contingent"}
                                </p>
                              </div>

                              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                <div className="space-y-1.5">
                                  <label
                                    htmlFor={`edit-pos-${entry.id}`}
                                    className="block text-xs font-medium text-slate-700"
                                  >
                                    Position (Ties Allowed)
                                  </label>
                                  <input
                                    id={`edit-pos-${entry.id}`}
                                    name="position"
                                    type="number"
                                    required
                                    min={MIN_LEADERBOARD_POSITION}
                                    max={MAX_LEADERBOARD_POSITION}
                                    step={1}
                                    value={editPosition}
                                    onChange={(e) =>
                                      setEditPosition(e.target.value)
                                    }
                                    className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                                  />
                                </div>

                                <div className="space-y-1.5 md:col-span-2">
                                  <label
                                    htmlFor={`edit-val-${entry.id}`}
                                    className="block text-xs font-medium text-slate-700"
                                  >
                                    Displayed Score / Value
                                  </label>
                                  <input
                                    id={`edit-val-${entry.id}`}
                                    name="displayValue"
                                    type="text"
                                    required
                                    maxLength={
                                      MAX_LEADERBOARD_DISPLAY_VALUE_LENGTH
                                    }
                                    value={editDisplayValue}
                                    onChange={(e) =>
                                      setEditDisplayValue(e.target.value)
                                    }
                                    placeholder="e.g. 950 points or ₹12,500"
                                    className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                                  />
                                </div>
                              </div>

                              <div className="space-y-1.5">
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
                                  onChange={(e) => setEditNotes(e.target.value)}
                                  placeholder="Optional internal note for audit log"
                                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                                />
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
                                    isPending ||
                                    !editPosition.trim() ||
                                    !editDisplayValue.trim()
                                  }
                                  className="min-h-9 rounded-md bg-[#4B0507] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#380305] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {isPending ? "Saving..." : "Save Standing"}
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

      {/* Add Contingent to Leaderboard Form */}
      <section
        aria-labelledby="add-leaderboard-entry-heading"
        className="rounded-lg border border-slate-200 bg-white p-6"
      >
        <div className="mb-4 border-b border-slate-100 pb-3">
          <h2
            id="add-leaderboard-entry-heading"
            className="font-display text-base font-semibold text-slate-900"
          >
            Add Registered Contingent to Leaderboard
          </h2>
          <p className="text-sm text-slate-600">
            Select a contingent registered in this event, set a position (ties
            allowed), and enter the flexible displayed result value.
          </p>
        </div>

        <form onSubmit={handleAddSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
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
                htmlFor="add-leaderboard-position"
                className="block text-xs font-medium text-slate-700"
              >
                Position (Integer, Ties Allowed)
              </label>
              <input
                id="add-leaderboard-position"
                name="position"
                type="number"
                required
                min={MIN_LEADERBOARD_POSITION}
                max={MAX_LEADERBOARD_POSITION}
                step={1}
                disabled={isPending || isReadOnly || isIndividualOnly}
                value={newPosition}
                onChange={(e) => setNewPosition(e.target.value)}
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20 disabled:bg-slate-50"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="add-leaderboard-value"
                className="block text-xs font-medium text-slate-700"
              >
                Displayed Score / Value
              </label>
              <input
                id="add-leaderboard-value"
                name="displayValue"
                type="text"
                required
                maxLength={MAX_LEADERBOARD_DISPLAY_VALUE_LENGTH}
                disabled={isPending || isReadOnly || isIndividualOnly}
                value={newDisplayValue}
                onChange={(e) => setNewDisplayValue(e.target.value)}
                placeholder='e.g. "950 points" or "₹12,500"'
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20 disabled:bg-slate-50"
              />
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
                !newPosition.trim() ||
                !newDisplayValue.trim()
              }
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#4B0507] px-4 py-2 text-sm font-medium whitespace-nowrap text-white hover:bg-[#380305] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
            >
              <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{isPending ? "Adding..." : "Add to Leaderboard"}</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
