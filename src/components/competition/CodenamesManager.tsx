"use client";

import React, { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Edit3,
  KeyRound,
  Plus,
  Search,
  ShieldAlert,
} from "lucide-react";
import {
  assignManualCodenameAction,
  assignMissingCodenamesAction,
  correctEntryCodenameAction,
} from "@/app/actions/codenames";
import type { CompetitionActionResult } from "@/app/actions/competition";
import { isEntryEligibleForCodenameGeneration } from "@/lib/codenames/validation";
import {
  CODENAME_MODE_LABELS,
  CODENAME_SOURCE_LABELS,
  ENTRY_MODE_LABELS,
  ENTRY_STATUS_LABELS,
  EVENT_STATUS_LABELS,
  ROUND_STATUS_LABELS,
  type ContingentRecord,
  type EntryCodenameRecord,
  type EventEntryRecord,
  type EventRecord,
  type ParticipantRecord,
  type RoundRecord,
} from "@/types/competition";

export interface CodenameEntryView extends EventEntryRecord {
  contingent: Pick<
    ContingentRecord,
    "id" | "contingent_code" | "name" | "institution_name" | "is_active"
  > | null;
  participant: Pick<
    ParticipantRecord,
    "id" | "participant_code" | "full_name" | "institution_name" | "is_active"
  > | null;
  assignment: EntryCodenameRecord | null;
}

interface CodenamesManagerProps {
  event: Pick<
    EventRecord,
    "id" | "code" | "name" | "codename_mode" | "entry_mode" | "status"
  >;
  rounds: Pick<RoundRecord, "id" | "round_number" | "name" | "status">[];
  selectedRoundId: string | null;
  entries: CodenameEntryView[];
  migrationMissing: boolean;
  loadError: string | null;
}

type AssignmentFilter = "all" | "unassigned" | "assigned";

export function CodenamesManager({
  event,
  rounds,
  selectedRoundId,
  entries,
  migrationMissing,
  loadError,
}: CodenamesManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<CompetitionActionResult | null>(
    null,
  );
  const [filter, setFilter] = useState<AssignmentFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Active inline row editor state (only one row editor open at a time)
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<"assign" | "correct" | null>(
    null,
  );
  const [codenameInput, setCodenameInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  const selectedRound = useMemo(() => {
    if (event.codename_mode !== "per_round" || !selectedRoundId) return null;
    return rounds.find((r) => r.id === selectedRoundId) ?? null;
  }, [event.codename_mode, rounds, selectedRoundId]);

  const isEventArchived = event.status === "archived";
  const isRoundMissing =
    event.codename_mode === "per_round" && selectedRound === null;
  const isRoundArchived =
    event.codename_mode === "per_round" &&
    selectedRound?.status === "archived";
  const isScopeReadOnly =
    migrationMissing ||
    Boolean(loadError) ||
    isEventArchived ||
    isRoundMissing ||
    isRoundArchived;

  const counts = useMemo(() => {
    let assigned = 0;
    let eligibleUnassigned = 0;
    let ineligibleUnassigned = 0;

    for (const entry of entries) {
      if (entry.assignment) {
        assigned += 1;
      } else if (isEntryEligibleForCodenameGeneration(entry.status)) {
        eligibleUnassigned += 1;
      } else {
        ineligibleUnassigned += 1;
      }
    }

    return {
      total: entries.length,
      assigned,
      eligibleUnassigned,
      ineligibleUnassigned,
      unassignedTotal: entries.length - assigned,
    };
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return entries.filter((entry) => {
      if (filter === "assigned" && !entry.assignment) return false;
      if (filter === "unassigned" && entry.assignment) return false;

      if (!normalizedSearch) return true;

      const haystack = [
        entry.assignment?.codename ?? "",
        entry.contingent?.contingent_code ?? "",
        entry.contingent?.name ?? "",
        entry.contingent?.institution_name ?? "",
        entry.participant?.participant_code ?? "",
        entry.participant?.full_name ?? "",
        entry.participant?.institution_name ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [entries, filter, searchQuery]);

  function closeEditor() {
    setActiveRowId(null);
    setActiveMode(null);
    setCodenameInput("");
    setNotesInput("");
    setConfirmOverwrite(false);
  }

  function openAssignEditor(entry: CodenameEntryView) {
    setFeedback(null);
    setActiveRowId(entry.id);
    setActiveMode("assign");
    setCodenameInput("");
    setNotesInput("");
    setConfirmOverwrite(false);
  }

  function openCorrectEditor(entry: CodenameEntryView) {
    setFeedback(null);
    setActiveRowId(entry.id);
    setActiveMode("correct");
    setCodenameInput(entry.assignment?.codename ?? "");
    setNotesInput(entry.assignment?.notes ?? "");
    setConfirmOverwrite(false);
  }

  function handleRoundChange(nextRoundId: string) {
    closeEditor();
    setFeedback(null);
    router.push(
      `/events/${event.id}/codenames?roundId=${encodeURIComponent(nextRoundId)}`,
    );
  }

  function handleBatchAssign() {
    if (isScopeReadOnly || counts.eligibleUnassigned === 0) return;
    setFeedback(null);
    closeEditor();
    startTransition(async () => {
      const result = await assignMissingCodenamesAction({
        eventId: event.id,
        roundId:
          event.codename_mode === "per_round"
            ? (selectedRound?.id ?? null)
            : null,
      });
      setFeedback(result);
      if (result.ok) {
        router.refresh();
      }
    });
  }

  function handleInlineSubmit(
    e: React.FormEvent<HTMLFormElement>,
    entry: CodenameEntryView,
    mode: "assign" | "correct",
  ) {
    e.preventDefault();
    if (isScopeReadOnly) return;

    const formData = new FormData();
    formData.set("eventId", event.id);
    formData.set("eventEntryId", entry.id);
    if (event.codename_mode === "per_round" && selectedRound) {
      formData.set("roundId", selectedRound.id);
    }
    formData.set("codename", codenameInput);
    formData.set("notes", notesInput);
    if (mode === "correct") {
      formData.set("confirmOverwrite", confirmOverwrite ? "true" : "false");
    }

    setFeedback(null);
    startTransition(async () => {
      const result =
        mode === "correct"
          ? await correctEntryCodenameAction(null, formData)
          : await assignManualCodenameAction(null, formData);

      setFeedback(result);
      if (result.ok) {
        closeEditor();
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/events/${event.id}`}
          className="inline-flex min-h-9 items-center gap-1.5 rounded text-sm font-medium text-slate-600 hover:text-[#4B0507] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>
            Back to {event.code} · {event.name}
          </span>
        </Link>

        <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700">
          <ShieldAlert
            className="h-3.5 w-3.5 text-[#4B0507]"
            aria-hidden="true"
          />
          Organiser-Only Identity Mapping
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
              Codename database migration is not yet applied
            </p>
            <p className="text-amber-900">
              The <code className="font-mono">entry_codenames</code> table was
              not found in Supabase. Apply migration{" "}
              <code className="font-mono">
                supabase/migrations/202611200005_stage2b3_codenames.sql
              </code>{" "}
              before assigning or editing codenames.
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
            <p className="font-semibold">Unable to load codename records</p>
            <p className="text-red-900">{loadError}</p>
          </div>
        </div>
      ) : null}

      {/* Scope & Summary Strip */}
      <section
        aria-label="Codename scope and summary"
        className="rounded-lg border border-slate-200 bg-white p-5"
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-5">
          <div>
            <p className="text-xs font-medium text-slate-500">Codename Mode</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {CODENAME_MODE_LABELS[event.codename_mode]}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {ENTRY_MODE_LABELS[event.entry_mode]} ·{" "}
              {EVENT_STATUS_LABELS[event.status]}
            </p>
          </div>

          <div className="lg:col-span-2">
            <p className="text-xs font-medium text-slate-500">Active Scope</p>
            {event.codename_mode === "event_wide" ? (
              <div className="mt-1">
                <p className="text-sm font-semibold text-slate-900">
                  Whole Event ({event.code})
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Each entry retains the same codename across all rounds.
                </p>
              </div>
            ) : rounds.length === 0 ? (
              <div className="mt-1">
                <p className="text-sm font-semibold text-amber-800">
                  No rounds configured yet
                </p>
                <p className="mt-0.5 text-xs text-slate-600">
                  Add at least one round on the event page before assigning
                  per-round codenames.
                </p>
              </div>
            ) : (
              <div className="mt-1 space-y-1">
                <label htmlFor="codename-round-select" className="sr-only">
                  Select Round Scope
                </label>
                <select
                  id="codename-round-select"
                  value={selectedRound?.id ?? ""}
                  onChange={(e) => handleRoundChange(e.target.value)}
                  className="min-h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                >
                  {rounds.map((r) => (
                    <option key={r.id} value={r.id}>
                      Round {r.round_number}: {r.name} (
                      {ROUND_STATUS_LABELS[r.status]})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">
                  Codename assignments are isolated to the selected round.
                </p>
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-medium text-slate-500">Assigned</p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-emerald-800">
              {counts.assigned} / {counts.total}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Existing codenames preserved
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-500">
              Eligible Unassigned
            </p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-[#4B0507]">
              {counts.eligibleUnassigned}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {counts.ineligibleUnassigned > 0
                ? `${counts.ineligibleUnassigned} withdrawn / disqualified`
                : "Registered & checked-in entries"}
            </p>
          </div>
        </div>
      </section>

      {/* Controlled Batch Generation Card */}
      <section
        aria-labelledby="batch-codenames-heading"
        className="rounded-lg border border-slate-200 bg-white p-5"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2
              id="batch-codenames-heading"
              className="flex items-center gap-2 font-display text-base font-semibold text-slate-900"
            >
              <KeyRound
                className="h-4 w-4 text-[#4B0507]"
                aria-hidden="true"
              />
              <span>Automatic Codename Assignment</span>
            </h2>
            <p className="max-w-2xl text-sm text-slate-600">
              Generate unique, anonymous codenames for eligible unassigned
              entries (Registered or Checked In). Existing assignments are{" "}
              <span className="font-medium text-slate-800">
                never overwritten or regenerated in bulk
              </span>
              .
            </p>
            {isEventArchived ? (
              <p className="text-xs font-medium text-amber-800">
                This event is archived. Codenames are read-only.
              </p>
            ) : isRoundArchived ? (
              <p className="text-xs font-medium text-amber-800">
                This round is archived. Codenames in this round are read-only.
              </p>
            ) : null}
          </div>

          <button
            type="button"
            disabled={
              isPending || isScopeReadOnly || counts.eligibleUnassigned === 0
            }
            onClick={handleBatchAssign}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-[#4B0507] px-4 py-2 text-sm font-medium whitespace-nowrap text-white transition-colors hover:bg-[#380305] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {isPending
                ? "Assigning..."
                : `Assign Missing Codenames (${counts.eligibleUnassigned})`}
            </span>
          </button>
        </div>
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

      {/* Filter & Search Bar + Assignment Table */}
      <section aria-labelledby="codename-table-heading" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2
              id="codename-table-heading"
              className="font-display text-lg font-semibold text-slate-900"
            >
              Entry Codename Assignments
            </h2>
            <p className="text-sm text-slate-600">
              Review unassigned vs assigned entries and perform audited manual
              assignments or corrections.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Filter entries by assignment status"
              className="inline-flex rounded-md border border-slate-300 bg-white p-0.5"
            >
              {(
                [
                  { id: "all", label: `All (${counts.total})` },
                  {
                    id: "unassigned",
                    label: `Unassigned (${counts.unassignedTotal})`,
                  },
                  { id: "assigned", label: `Assigned (${counts.assigned})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`rounded px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507] ${
                    filter === tab.id
                      ? "bg-[#4B0507] text-white"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-auto">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Filter by codename, code, or participant"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search codename or entry..."
                className="min-h-9 w-full rounded-md border border-slate-300 bg-white pr-3 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20 sm:w-56"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-600">
                <th scope="col" className="px-4 py-3">
                  Type
                </th>
                <th scope="col" className="px-4 py-3">
                  Registered Identity (Organiser View)
                </th>
                <th scope="col" className="px-4 py-3">
                  Entry Status
                </th>
                <th scope="col" className="px-4 py-3">
                  Codename &amp; Source
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-slate-500"
                  >
                    {entries.length === 0
                      ? "No entries are registered in this event yet. Add entries from the event page or registration import."
                      : "No entries match the current filter or search."}
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry) => {
                  const isEditingThis = activeRowId === entry.id;
                  const eligibleForNew =
                    isEntryEligibleForCodenameGeneration(entry.status);
                  const subjectCode =
                    entry.entry_type === "contingent"
                      ? entry.contingent?.contingent_code
                      : entry.participant?.participant_code;
                  const subjectName =
                    entry.entry_type === "contingent"
                      ? entry.contingent?.name
                      : entry.participant?.full_name;
                  const subjectInstitution =
                    entry.entry_type === "contingent"
                      ? entry.contingent?.institution_name
                      : entry.participant?.institution_name;

                  return (
                    <React.Fragment key={entry.id}>
                      <tr className="align-middle hover:bg-slate-50/60">
                        <td className="px-4 py-3 text-xs font-medium text-slate-700 capitalize">
                          {entry.entry_type}
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-0.5">
                            <p className="text-sm text-slate-900">
                              <span className="font-mono text-xs font-medium text-[#4B0507]">
                                {subjectCode ?? "—"}
                              </span>{" "}
                              <span className="font-medium">
                                {subjectName ?? "Unknown entry subject"}
                              </span>
                            </p>
                            {subjectInstitution ? (
                              <p className="text-xs text-slate-500">
                                {subjectInstitution}
                              </p>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <span
                            className={`inline-flex rounded px-2 py-0.5 font-medium ${
                              eligibleForNew
                                ? "bg-slate-100 text-slate-800"
                                : "bg-amber-50 text-amber-800"
                            }`}
                          >
                            {ENTRY_STATUS_LABELS[entry.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {entry.assignment ? (
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded border border-slate-200 bg-slate-50 px-2.5 py-0.5 font-mono text-xs font-semibold tracking-wide text-slate-900">
                                  {entry.assignment.codename}
                                </span>
                                <span
                                  className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                                    entry.assignment.assignment_source ===
                                    "manual"
                                      ? "bg-amber-50 text-amber-900"
                                      : "bg-emerald-50 text-emerald-900"
                                  }`}
                                >
                                  {
                                    CODENAME_SOURCE_LABELS[
                                      entry.assignment.assignment_source
                                    ]
                                  }
                                </span>
                              </div>
                              {entry.assignment.notes ? (
                                <p className="text-xs text-slate-500">
                                  Note: {entry.assignment.notes}
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <span className="inline-flex rounded border border-dashed border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-500">
                              Unassigned
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isScopeReadOnly ? (
                            <span className="text-xs text-slate-400">
                              Read-only
                            </span>
                          ) : entry.assignment ? (
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() =>
                                isEditingThis && activeMode === "correct"
                                  ? closeEditor()
                                  : openCorrectEditor(entry)
                              }
                              className="inline-flex min-h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                            >
                              <Edit3
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              <span>
                                {isEditingThis && activeMode === "correct"
                                  ? "Close"
                                  : "Correct Codename"}
                              </span>
                            </button>
                          ) : eligibleForNew ? (
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() =>
                                isEditingThis && activeMode === "assign"
                                  ? closeEditor()
                                  : openAssignEditor(entry)
                              }
                              className="inline-flex min-h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap text-slate-700 hover:border-[#4B0507] hover:text-[#4B0507] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                            >
                              <Plus
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              <span>
                                {isEditingThis && activeMode === "assign"
                                  ? "Close"
                                  : "Assign Manually"}
                              </span>
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">
                              Ineligible ({ENTRY_STATUS_LABELS[entry.status]})
                            </span>
                          )}
                        </td>
                      </tr>

                      {isEditingThis && activeMode ? (
                        <tr className="bg-slate-50/90">
                          <td colSpan={5} className="px-4 py-4">
                            <form
                              onSubmit={(e) =>
                                handleInlineSubmit(e, entry, activeMode)
                              }
                              className="space-y-4 rounded-md border border-slate-200 bg-white p-4"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                                <p className="text-sm font-semibold text-slate-900">
                                  {activeMode === "correct"
                                    ? `Correct Codename for ${subjectCode ?? entry.id}`
                                    : `Manual Codename Assignment for ${subjectCode ?? entry.id}`}
                                </p>
                                {activeMode === "correct" && entry.assignment ? (
                                  <span className="font-mono text-xs text-slate-600">
                                    Current: {entry.assignment.codename}
                                  </span>
                                ) : null}
                              </div>

                              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div className="space-y-1.5">
                                  <label
                                    htmlFor={`codename-input-${entry.id}`}
                                    className="block text-xs font-medium text-slate-700"
                                  >
                                    {activeMode === "correct"
                                      ? "New Codename"
                                      : "Codename"}
                                  </label>
                                  <input
                                    id={`codename-input-${entry.id}`}
                                    name="codename"
                                    type="text"
                                    required
                                    minLength={4}
                                    maxLength={40}
                                    value={codenameInput}
                                    onChange={(e) =>
                                      setCodenameInput(
                                        e.target.value.toUpperCase(),
                                      )
                                    }
                                    placeholder="e.g. AMBER-FALCON-24"
                                    className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm uppercase text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                                  />
                                  <p className="text-[11px] text-slate-500">
                                    4–40 characters, uppercase letters, numbers,
                                    and single hyphens only.
                                  </p>
                                </div>

                                <div className="space-y-1.5">
                                  <label
                                    htmlFor={`codename-notes-${entry.id}`}
                                    className="block text-xs font-medium text-slate-700"
                                  >
                                    Audit Note (Optional)
                                  </label>
                                  <input
                                    id={`codename-notes-${entry.id}`}
                                    name="notes"
                                    type="text"
                                    maxLength={500}
                                    value={notesInput}
                                    onChange={(e) =>
                                      setNotesInput(e.target.value)
                                    }
                                    placeholder="Reason for manual assignment or correction"
                                    className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                                  />
                                </div>
                              </div>

                              {activeMode === "correct" && entry.assignment ? (
                                <div className="flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50 px-3.5 py-3">
                                  <input
                                    id={`confirm-overwrite-${entry.id}`}
                                    name="confirmOverwrite"
                                    type="checkbox"
                                    checked={confirmOverwrite}
                                    onChange={(e) =>
                                      setConfirmOverwrite(e.target.checked)
                                    }
                                    className="mt-0.5 h-4 w-4 rounded border-amber-400 accent-[#4B0507]"
                                  />
                                  <label
                                    htmlFor={`confirm-overwrite-${entry.id}`}
                                    className="text-xs leading-relaxed text-amber-950"
                                  >
                                    <span className="font-semibold">
                                      Confirm overwrite:
                                    </span>{" "}
                                    Replace existing codename{" "}
                                    <code className="font-mono font-semibold">
                                      {entry.assignment.codename}
                                    </code>{" "}
                                    for this entry in the current scope. This
                                    change is recorded in the audit log.
                                  </label>
                                </div>
                              ) : null}

                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  disabled={isPending}
                                  onClick={closeEditor}
                                  className="min-h-9 rounded-md border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="submit"
                                  disabled={
                                    isPending ||
                                    !codenameInput.trim() ||
                                    (activeMode === "correct" &&
                                      !confirmOverwrite)
                                  }
                                  className="min-h-9 rounded-md bg-[#4B0507] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#380305] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                                >
                                  {isPending
                                    ? "Saving..."
                                    : activeMode === "correct"
                                      ? "Confirm & Save Correction"
                                      : "Save Manual Codename"}
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
    </div>
  );
}
