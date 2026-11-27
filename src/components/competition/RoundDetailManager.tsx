"use client";

import React, { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Edit3,
  Lock,
  Plus,
  Trash2,
} from "lucide-react";
import {
  createJudgingCriterionAction,
  deleteJudgingCriterionAction,
  reorderJudgingCriteriaAction,
  updateJudgingCriterionAction,
  updateRoundAction,
  type CompetitionActionResult,
} from "@/app/actions/competition";
import {
  ROUND_CREATE_STATUSES,
} from "@/lib/competition/validation";
import { RoundReleasePanel } from "@/components/competition/RoundReleasePanel";
import { RoundDocumentsPanel } from "@/components/competition/RoundDocumentsPanel";
import {
  ATTRIBUTION_MODE_LABELS,
  ROUND_STATUS_LABELS,
  SCORING_METHOD_LABELS,
  type AdminRoundDocumentItem,
  type EventRecord,
  type JudgingCriterionRecord,
  type RoundRecord,
  type RoundReleaseSessionRecord,
  type RoundStatus,
} from "@/types/competition";

interface RoundDetailManagerProps {
  event: Pick<EventRecord, "id" | "code" | "name" | "status">;
  round: RoundRecord;
  criteria: JudgingCriterionRecord[];
  releaseSessions: RoundReleaseSessionRecord[];
  dbServerNowIso: string | null;
  releaseMigrationMissing: boolean;
  releaseLoadError: string | null;
  canManageDocuments: boolean;
  documents: AdminRoundDocumentItem[];
  documentsMigrationMissing: boolean;
  documentsLoadError: string | null;
}

export function RoundDetailManager({
  event,
  round,
  criteria,
  releaseSessions,
  dbServerNowIso,
  releaseMigrationMissing,
  releaseLoadError,
  canManageDocuments,
  documents,
  documentsMigrationMissing,
  documentsLoadError,
}: RoundDetailManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [criteriaFeedback, setCriteriaFeedback] =
    useState<CompetitionActionResult | null>(null);
  const [editingCriterionId, setEditingCriterionId] = useState<string | null>(
    null,
  );
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [roundState, roundFormAction, roundPending] = useActionState<
    CompetitionActionResult | null,
    FormData
  >(async (prev, formData) => {
    const result = await updateRoundAction(prev, formData);
    if (result.ok) {
      router.refresh();
    }
    return result;
  }, null);

  const [createCriterionState, createCriterionFormAction, createPending] =
    useActionState<CompetitionActionResult | null, FormData>(
      async (prev, formData) => {
        const result = await createJudgingCriterionAction(prev, formData);
        if (result.ok) {
          router.refresh();
        }
        return result;
      },
      null,
    );

  const nextDisplayOrder =
    criteria.length > 0
      ? Math.max(...criteria.map((c) => c.display_order)) + 1
      : 1;

  const totalMaxPoints = criteria.reduce(
    (sum, c) => sum + Number(c.max_points || 0),
    0,
  );
  const totalWeight = criteria.reduce(
    (sum, c) => sum + Number(c.weight || 0),
    0,
  );

  function handleMoveCriterion(index: number, direction: -1 | 1) {
    if (round.is_locked) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= criteria.length) return;
    const reordered = [...criteria];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    setCriteriaFeedback(null);
    startTransition(async () => {
      const result = await reorderJudgingCriteriaAction(
        event.id,
        round.id,
        reordered.map((c) => c.id),
      );
      setCriteriaFeedback(result);
      if (result.ok) {
        router.refresh();
      }
    });
  }

  function handleUpdateCriterion(formData: FormData) {
    setCriteriaFeedback(null);
    startTransition(async () => {
      const result = await updateJudgingCriterionAction(formData);
      setCriteriaFeedback(result);
      if (result.ok) {
        setEditingCriterionId(null);
        router.refresh();
      }
    });
  }

  function handleDeleteCriterion(criterionId: string) {
    setCriteriaFeedback(null);
    startTransition(async () => {
      const result = await deleteJudgingCriterionAction(
        event.id,
        round.id,
        criterionId,
      );
      setCriteriaFeedback(result);
      setConfirmDeleteId(null);
      if (result.ok) {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-10">
      <div>
        <Link
          href={`/events/${event.id}`}
          className="inline-flex min-h-9 items-center gap-1.5 rounded text-sm font-medium text-slate-600 hover:text-[#4B0507] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back to {event.code} · {event.name}</span>
        </Link>
      </div>

      <RoundReleasePanel
        event={event}
        round={round}
        sessions={releaseSessions}
        dbServerNowIso={dbServerNowIso}
        releaseMigrationMissing={releaseMigrationMissing}
        releaseLoadError={releaseLoadError}
      />

      <RoundDocumentsPanel
        eventId={event.id}
        roundId={round.id}
        canManageDocuments={canManageDocuments}
        documents={documents}
        documentsMigrationMissing={documentsMigrationMissing}
        documentsLoadError={documentsLoadError}
      />

      {/* Round Settings Form */}
      <section
        aria-labelledby="edit-round-heading"
        className="rounded-lg border border-slate-200 bg-white p-6"
      >
        <div className="mb-5 border-b border-slate-100 pb-4">
          <h2
            id="edit-round-heading"
            className="font-display text-lg font-semibold text-slate-900"
          >
            Round Settings
          </h2>
          <p className="text-sm text-slate-600">
            Configure round number, scoring method, attribution mode, status,
            and criteria lock state.
          </p>
        </div>

        <form action={roundFormAction} className="space-y-5">
          <input type="hidden" name="eventId" value={event.id} />
          <input type="hidden" name="roundId" value={round.id} />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <label
                htmlFor="round-number"
                className="block text-xs font-medium text-slate-700"
              >
                Round Number
              </label>
              <input
                id="round-number"
                name="roundNumber"
                type="number"
                required
                min={1}
                max={99}
                defaultValue={round.round_number}
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label
                htmlFor="round-name"
                className="block text-xs font-medium text-slate-700"
              >
                Round Name
              </label>
              <input
                id="round-name"
                name="name"
                type="text"
                required
                maxLength={160}
                defaultValue={round.name}
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="round-scoring-method"
                className="block text-xs font-medium text-slate-700"
              >
                Scoring Method
              </label>
              <select
                id="round-scoring-method"
                name="scoringMethod"
                defaultValue={round.scoring_method}
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
                htmlFor="round-attribution-mode"
                className="block text-xs font-medium text-slate-700"
              >
                Attribution Mode
              </label>
              <select
                id="round-attribution-mode"
                name="attributionMode"
                defaultValue={round.attribution_mode}
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
              >
                {Object.entries(ATTRIBUTION_MODE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="round-status"
                className="block text-xs font-medium text-slate-700"
              >
                Status
              </label>
              {round.status === "deployed" ? (
                <>
                  <input type="hidden" name="status" value="deployed" />
                  <input
                    id="round-status"
                    type="text"
                    readOnly
                    value={ROUND_STATUS_LABELS[round.status]}
                    className="min-h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  />
                </>
              ) : (
                <select
                  id="round-status"
                  name="status"
                  defaultValue={round.status}
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                >
                  {(round.status === "closed"
                    ? (["closed", "completed", "archived"] as RoundStatus[])
                    : ([...ROUND_CREATE_STATUSES, "completed", "archived"] as RoundStatus[])
                  ).map((val) => (
                    <option key={val} value={val}>
                      {ROUND_STATUS_LABELS[val]}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="round-duration"
                className="block text-xs font-medium text-slate-700"
              >
                Duration (minutes)
              </label>
              <input
                id="round-duration"
                name="durationMinutes"
                type="number"
                min={1}
                max={1440}
                step={1}
                readOnly={
                  releaseSessions.length > 0 ||
                  Boolean(releaseLoadError) ||
                  round.status === "deployed" ||
                  round.status === "closed"
                }
                defaultValue={round.duration_minutes ?? ""}
                placeholder="Optional (1–1,440)"
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 read-only:bg-slate-50 read-only:text-slate-600 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
              />
              {releaseSessions.length > 0 ? (
                <p className="text-[11px] text-slate-500">
                  Locked after first release; override only when reopening.
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="round-description"
              className="block text-xs font-medium text-slate-700"
            >
              Round Description / Notes
            </label>
            <textarea
              id="round-description"
              name="description"
              rows={2}
              maxLength={2000}
              defaultValue={round.description ?? ""}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
            />
          </div>

          <div className="flex items-start gap-2.5 rounded-md border border-slate-200 bg-slate-50 px-3.5 py-3">
            {round.is_locked &&
            (releaseSessions.length > 0 ||
              round.status === "deployed" ||
              round.status === "closed") ? (
              <>
                <input type="hidden" name="isLocked" value="true" />
                <input
                  id="round-locked"
                  type="checkbox"
                  checked
                  disabled
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#4B0507]"
                />
                <label htmlFor="round-locked" className="text-sm text-slate-800">
                  <span className="font-medium">
                    Judging criteria structure is permanently locked
                  </span>
                  <span className="block text-xs text-slate-600">
                    Criteria locking is applied automatically on first release
                    and stays active across closures and reopenings.
                  </span>
                </label>
              </>
            ) : (
              <>
                <input
                  id="round-locked"
                  name="isLocked"
                  type="checkbox"
                  defaultChecked={round.is_locked}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#4B0507]"
                />
                <label htmlFor="round-locked" className="text-sm text-slate-800">
                  <span className="font-medium">
                    Lock judging criteria structure
                  </span>
                  <span className="block text-xs text-slate-600">
                    When locked (or automatically upon first release, or once
                    evaluation scores exist), judging criteria cannot be added,
                    edited, reordered, or deleted.
                  </span>
                </label>
              </>
            )}
          </div>

          {roundState ? (
            <div
              role={roundState.ok ? "status" : "alert"}
              aria-live="polite"
              className={`rounded-md border px-3 py-2.5 text-sm ${
                roundState.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-red-200 bg-red-50 text-red-900"
              }`}
            >
              {roundState.message}
            </div>
          ) : null}

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <button
              type="submit"
              disabled={roundPending}
              className="min-h-10 rounded-md bg-[#4B0507] px-5 py-2 text-sm font-medium whitespace-nowrap text-white hover:bg-[#380305] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
            >
              {roundPending ? "Saving..." : "Update Round"}
            </button>
          </div>
        </form>
      </section>

      {/* Judging Criteria Section */}
      <section aria-labelledby="criteria-heading" className="space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h2
              id="criteria-heading"
              className="font-display text-lg font-semibold text-slate-900"
            >
              Judging Criteria
            </h2>
            <p className="text-sm text-slate-600">
              Define rubric criteria, maximum points, weights, and evaluator
              guidance in display order.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums text-slate-600">
            <span>{criteria.length} criteria</span>
            <span>Total max: {totalMaxPoints.toFixed(2)} pts</span>
            <span>Total weight: {totalWeight.toFixed(2)}</span>
          </div>
        </div>

        {round.is_locked ? (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              This round is currently locked. Judging criteria structure is
              protected from edits, reordering, or removal until unlocked (and
              is permanently protected once evaluation scores exist).
            </span>
          </div>
        ) : null}

        {criteriaFeedback ? (
          <div
            role={criteriaFeedback.ok ? "status" : "alert"}
            aria-live="polite"
            className={`rounded-lg border px-4 py-3 text-sm ${
              criteriaFeedback.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-red-200 bg-red-50 text-red-900"
            }`}
          >
            {criteriaFeedback.message}
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
                  Criterion &amp; Rubric Guidance
                </th>
                <th scope="col" className="px-4 py-3 font-mono">
                  Max Points
                </th>
                <th scope="col" className="px-4 py-3 font-mono">
                  Weight
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {criteria.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-slate-500"
                  >
                    No judging criteria have been added to this round yet.
                  </td>
                </tr>
              ) : (
                criteria.map((criterion, index) => {
                  const isEditing = editingCriterionId === criterion.id;
                  const confirmingDelete = confirmDeleteId === criterion.id;

                  if (isEditing) {
                    return (
                      <tr key={criterion.id} className="bg-slate-50/70">
                        <td colSpan={5} className="p-4">
                          <form
                            action={handleUpdateCriterion}
                            className="space-y-4"
                          >
                            <input type="hidden" name="eventId" value={event.id} />
                            <input type="hidden" name="roundId" value={round.id} />
                            <input
                              type="hidden"
                              name="criterionId"
                              value={criterion.id}
                            />

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                              <div className="space-y-1">
                                <label
                                  htmlFor={`edit-order-${criterion.id}`}
                                  className="block text-xs font-medium text-slate-700"
                                >
                                  Display Order
                                </label>
                                <input
                                  id={`edit-order-${criterion.id}`}
                                  name="displayOrder"
                                  type="number"
                                  required
                                  min={1}
                                  max={100}
                                  defaultValue={criterion.display_order}
                                  className="min-h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm tabular-nums text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                                />
                              </div>

                              <div className="space-y-1 md:col-span-2">
                                <label
                                  htmlFor={`edit-name-${criterion.id}`}
                                  className="block text-xs font-medium text-slate-700"
                                >
                                  Criterion Name
                                </label>
                                <input
                                  id={`edit-name-${criterion.id}`}
                                  name="name"
                                  type="text"
                                  required
                                  maxLength={160}
                                  defaultValue={criterion.name}
                                  className="min-h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <label
                                    htmlFor={`edit-max-${criterion.id}`}
                                    className="block text-xs font-medium text-slate-700"
                                  >
                                    Max Pts
                                  </label>
                                  <input
                                    id={`edit-max-${criterion.id}`}
                                    name="maxPoints"
                                    type="number"
                                    required
                                    step="0.01"
                                    min="0.01"
                                    max="10000"
                                    defaultValue={criterion.max_points}
                                    className="min-h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm tabular-nums text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label
                                    htmlFor={`edit-weight-${criterion.id}`}
                                    className="block text-xs font-medium text-slate-700"
                                  >
                                    Weight
                                  </label>
                                  <input
                                    id={`edit-weight-${criterion.id}`}
                                    name="weight"
                                    type="number"
                                    required
                                    step="0.01"
                                    min="0.01"
                                    max="100"
                                    defaultValue={criterion.weight}
                                    className="min-h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm tabular-nums text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label
                                htmlFor={`edit-guidance-${criterion.id}`}
                                className="block text-xs font-medium text-slate-700"
                              >
                                Rubric Guidance (Optional)
                              </label>
                              <textarea
                                id={`edit-guidance-${criterion.id}`}
                                name="rubricGuidance"
                                rows={2}
                                maxLength={2000}
                                defaultValue={criterion.rubric_guidance ?? ""}
                                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                              />
                            </div>

                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => setEditingCriterionId(null)}
                                className="min-h-9 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                disabled={isPending}
                                className="min-h-9 rounded bg-[#4B0507] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#380305] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                              >
                                Save Criterion
                              </button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr
                      key={criterion.id}
                      className="align-top hover:bg-slate-50/60"
                    >
                      <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-600">
                        #{criterion.display_order}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">
                          {criterion.name}
                        </p>
                        {criterion.rubric_guidance ? (
                          <p className="mt-1 text-xs leading-relaxed text-slate-600">
                            {criterion.rubric_guidance}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-800">
                        {Number(criterion.max_points).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-800">
                        {Number(criterion.weight).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {confirmingDelete ? (
                            <>
                              <button
                                type="button"
                                disabled={isPending || round.is_locked}
                                onClick={() =>
                                  handleDeleteCriterion(criterion.id)
                                }
                                className="min-h-8 rounded border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-red-800 hover:bg-red-100 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                              >
                                Confirm Delete
                              </button>
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => setConfirmDeleteId(null)}
                                className="min-h-8 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={
                                  isPending || round.is_locked || index === 0
                                }
                                onClick={() => handleMoveCriterion(index, -1)}
                                aria-label={`Move ${criterion.name} up`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                              >
                                <ArrowUp
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                              </button>
                              <button
                                type="button"
                                disabled={
                                  isPending ||
                                  round.is_locked ||
                                  index === criteria.length - 1
                                }
                                onClick={() => handleMoveCriterion(index, 1)}
                                aria-label={`Move ${criterion.name} down`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                              >
                                <ArrowDown
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                              </button>
                              <button
                                type="button"
                                disabled={isPending || round.is_locked}
                                onClick={() =>
                                  setEditingCriterionId(criterion.id)
                                }
                                className="inline-flex min-h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                              >
                                <Edit3
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                disabled={isPending || round.is_locked}
                                onClick={() => setConfirmDeleteId(criterion.id)}
                                className="inline-flex min-h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap text-slate-700 hover:bg-red-50 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                              >
                                <Trash2
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                <span>Delete</span>
                              </button>
                            </>
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

        {/* Add Criterion Form */}
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h3 className="mb-4 font-display text-base font-semibold text-slate-900">
            Add Judging Criterion
          </h3>
          <form action={createCriterionFormAction} className="space-y-4">
            <input type="hidden" name="eventId" value={event.id} />
            <input type="hidden" name="roundId" value={round.id} />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="new-criterion-order"
                  className="block text-xs font-medium text-slate-700"
                >
                  Display Order
                </label>
                <input
                  id="new-criterion-order"
                  name="displayOrder"
                  type="number"
                  required
                  min={1}
                  max={100}
                  defaultValue={nextDisplayOrder}
                  disabled={round.is_locked}
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20 disabled:bg-slate-50"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label
                  htmlFor="new-criterion-name"
                  className="block text-xs font-medium text-slate-700"
                >
                  Criterion Name
                </label>
                <input
                  id="new-criterion-name"
                  name="name"
                  type="text"
                  required
                  maxLength={160}
                  disabled={round.is_locked}
                  placeholder="Enter criterion label"
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20 disabled:bg-slate-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="new-criterion-max"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Max Points
                  </label>
                  <input
                    id="new-criterion-max"
                    name="maxPoints"
                    type="number"
                    required
                    step="0.01"
                    min="0.01"
                    max="10000"
                    disabled={round.is_locked}
                    placeholder="25"
                    className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20 disabled:bg-slate-50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="new-criterion-weight"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Weight
                  </label>
                  <input
                    id="new-criterion-weight"
                    name="weight"
                    type="number"
                    required
                    step="0.01"
                    min="0.01"
                    max="100"
                    defaultValue="1"
                    disabled={round.is_locked}
                    className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20 disabled:bg-slate-50"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="new-criterion-guidance"
                className="block text-xs font-medium text-slate-700"
              >
                Rubric Guidance (Optional)
              </label>
              <textarea
                id="new-criterion-guidance"
                name="rubricGuidance"
                rows={2}
                maxLength={2000}
                disabled={round.is_locked}
                placeholder="Guidance for evaluators applying this criterion"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20 disabled:bg-slate-50"
              />
            </div>

            {createCriterionState ? (
              <div
                role={createCriterionState.ok ? "status" : "alert"}
                aria-live="polite"
                className={`rounded-md border px-3 py-2.5 text-sm ${
                  createCriterionState.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-red-200 bg-red-50 text-red-900"
                }`}
              >
                {createCriterionState.message}
              </div>
            ) : null}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={createPending || round.is_locked}
                className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#4B0507] px-4 py-2 text-sm font-medium whitespace-nowrap text-white hover:bg-[#380305] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
              >
                <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {createPending ? "Adding Criterion..." : "Add Criterion"}
                </span>
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
