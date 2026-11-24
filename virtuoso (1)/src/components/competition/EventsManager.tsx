"use client";

import React, { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, Search } from "lucide-react";
import {
  createEventAction,
  updateEventStatusAction,
  type CompetitionActionResult,
} from "@/app/actions/competition";
import {
  CODENAME_MODE_LABELS,
  ENTRY_MODE_LABELS,
  EVENT_STATUS_LABELS,
  type EventRecord,
  type EventStatus,
} from "@/types/competition";

export interface EventSummaryItem extends EventRecord {
  roundsCount: number;
  entriesCount: number;
}

interface EventsManagerProps {
  events: EventSummaryItem[];
  migrationMissing?: boolean;
}

const STATUS_TEXT_STYLES: Record<EventStatus, string> = {
  draft: "text-slate-600",
  active: "text-emerald-700",
  inactive: "text-amber-700",
  archived: "text-slate-400",
};

export function EventsManager({
  events,
  migrationMissing = false,
}: EventsManagerProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreateForm, setShowCreateForm] = useState(events.length === 0);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [statusFeedback, setStatusFeedback] =
    useState<CompetitionActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const [createState, createFormAction, createPending] = useActionState<
    CompetitionActionResult | null,
    FormData
  >(async (prev, formData) => {
    const result = await createEventAction(prev, formData);
    if (result.ok) {
      router.refresh();
    }
    return result;
  }, null);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredEvents = events.filter((event) => {
    if (statusFilter !== "all" && event.status !== statusFilter) {
      return false;
    }
    if (!normalizedQuery) return true;
    return (
      event.code.toLowerCase().includes(normalizedQuery) ||
      event.name.toLowerCase().includes(normalizedQuery)
    );
  });

  function handleStatusChange(eventId: string, nextStatus: EventStatus) {
    setStatusFeedback(null);
    startTransition(async () => {
      const result = await updateEventStatusAction(eventId, nextStatus);
      setStatusFeedback(result);
      setConfirmArchiveId(null);
      if (result.ok) {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-8">
      {migrationMissing ? (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          Stage 2A competition tables are not available yet. Apply migration{" "}
          <code className="font-mono text-xs">
            supabase/migrations/202611160003_stage2a_competition_structure.sql
          </code>{" "}
          in Supabase before creating events.
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search code or event name"
              aria-label="Search events by code or name"
              className="min-h-10 w-full rounded-md border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter events by status"
            className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateForm((prev) => !prev)}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-[#4B0507] px-4 py-2 text-sm font-medium whitespace-nowrap text-white transition-colors hover:bg-[#380305] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{showCreateForm ? "Hide Event Form" : "Create Event"}</span>
        </button>
      </div>

      {statusFeedback ? (
        <div
          role={statusFeedback.ok ? "status" : "alert"}
          aria-live="polite"
          className={`rounded-lg border px-4 py-3 text-sm ${
            statusFeedback.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          {statusFeedback.message}
        </div>
      ) : null}

      {showCreateForm ? (
        <section
          aria-labelledby="create-event-heading"
          className="rounded-lg border border-slate-200 bg-white p-6"
        >
          <div className="mb-5 space-y-1 border-b border-slate-100 pb-4">
            <h2
              id="create-event-heading"
              className="font-display text-lg font-semibold text-slate-900"
            >
              Create Competition Event
            </h2>
            <p className="text-sm text-slate-600">
              Define an event code, title, entry mode, codename policy, and
              optional team size bounds.
            </p>
          </div>

          <form action={createFormAction} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="event-code"
                  className="block text-xs font-medium text-slate-700"
                >
                  Event Code
                </label>
                <input
                  id="event-code"
                  name="code"
                  type="text"
                  required
                  maxLength={40}
                  placeholder="e.g. EVT-01"
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm uppercase text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="event-name"
                  className="block text-xs font-medium text-slate-700"
                >
                  Event Name
                </label>
                <input
                  id="event-name"
                  name="name"
                  type="text"
                  required
                  maxLength={160}
                  placeholder="Enter official event title"
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="event-entry-mode"
                  className="block text-xs font-medium text-slate-700"
                >
                  Entry Mode
                </label>
                <select
                  id="event-entry-mode"
                  name="entryMode"
                  defaultValue="contingent"
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
                  htmlFor="event-codename-mode"
                  className="block text-xs font-medium text-slate-700"
                >
                  Codename Mode
                </label>
                <select
                  id="event-codename-mode"
                  name="codenameMode"
                  defaultValue="event_wide"
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
                  htmlFor="event-status"
                  className="block text-xs font-medium text-slate-700"
                >
                  Initial Status
                </label>
                <select
                  id="event-status"
                  name="status"
                  defaultValue="draft"
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
                    htmlFor="event-min-team"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Min Team Size (Optional)
                  </label>
                  <input
                    id="event-min-team"
                    name="minTeamSize"
                    type="number"
                    min={1}
                    max={100}
                    placeholder="Any"
                    className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="event-max-team"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Max Team Size (Optional)
                  </label>
                  <input
                    id="event-max-team"
                    name="maxTeamSize"
                    type="number"
                    min={1}
                    max={100}
                    placeholder="Any"
                    className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="event-description"
                className="block text-xs font-medium text-slate-700"
              >
                Description (Optional)
              </label>
              <textarea
                id="event-description"
                name="description"
                rows={3}
                maxLength={2000}
                placeholder="Internal organiser summary of rules or format"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
              />
            </div>

            {createState ? (
              <div
                role={createState.ok ? "status" : "alert"}
                aria-live="polite"
                className={`rounded-md border px-3 py-2.5 text-sm ${
                  createState.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-red-200 bg-red-50 text-red-900"
                }`}
              >
                {createState.message}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="submit"
                disabled={createPending || migrationMissing}
                className="inline-flex min-h-10 items-center justify-center rounded-md bg-[#4B0507] px-5 py-2 text-sm font-medium whitespace-nowrap text-white transition-colors hover:bg-[#380305] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
              >
                {createPending ? "Creating Event..." : "Save Event"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section aria-labelledby="events-list-heading" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2
            id="events-list-heading"
            className="font-display text-lg font-semibold text-slate-900"
          >
            Configured Events
          </h2>
          <span className="font-mono text-xs tabular-nums text-slate-500">
            {filteredEvents.length} of {events.length} shown
          </span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-600">
                <th scope="col" className="px-4 py-3">
                  Code &amp; Event
                </th>
                <th scope="col" className="px-4 py-3">
                  Entry Mode
                </th>
                <th scope="col" className="px-4 py-3">
                  Codename Mode
                </th>
                <th scope="col" className="px-4 py-3 font-mono">
                  Rounds
                </th>
                <th scope="col" className="px-4 py-3 font-mono">
                  Entries
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
              {filteredEvents.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-sm text-slate-500"
                  >
                    {events.length === 0
                      ? "No competition events have been configured yet. Use Create Event above to configure the first event."
                      : "No events match your current search or status filter."}
                  </td>
                </tr>
              ) : (
                filteredEvents.map((event) => {
                  const confirmingArchive = confirmArchiveId === event.id;
                  return (
                    <tr
                      key={event.id}
                      className="align-top hover:bg-slate-50/60"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/events/${event.id}`}
                          className="group block space-y-0.5 focus-visible:outline-none"
                        >
                          <span className="font-mono text-xs font-medium text-[#4B0507]">
                            {event.code}
                          </span>
                          <span className="block font-medium text-slate-900 group-hover:text-[#4B0507] group-hover:underline">
                            {event.name}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">
                        {ENTRY_MODE_LABELS[event.entry_mode]}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">
                        {CODENAME_MODE_LABELS[event.codename_mode]}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-700">
                        {event.roundsCount}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-700">
                        {event.entriesCount}
                      </td>
                      <td className="px-4 py-3 text-xs font-medium">
                        <span className={STATUS_TEXT_STYLES[event.status]}>
                          {EVENT_STATUS_LABELS[event.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {confirmingArchive ? (
                            <>
                              <span className="text-xs text-slate-600">
                                Archive event?
                              </span>
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() =>
                                  handleStatusChange(event.id, "archived")
                                }
                                className="min-h-8 rounded border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-red-800 hover:bg-red-100 disabled:opacity-60"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => setConfirmArchiveId(null)}
                                className="min-h-8 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap text-slate-700 hover:bg-slate-50"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              {event.status !== "active" &&
                              event.status !== "archived" ? (
                                <button
                                  type="button"
                                  disabled={isPending}
                                  onClick={() =>
                                    handleStatusChange(event.id, "active")
                                  }
                                  className="min-h-8 rounded border border-emerald-300 bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
                                >
                                  Activate
                                </button>
                              ) : null}
                              {event.status === "active" ? (
                                <button
                                  type="button"
                                  disabled={isPending}
                                  onClick={() =>
                                    handleStatusChange(event.id, "inactive")
                                  }
                                  className="min-h-8 rounded border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap text-amber-800 hover:bg-amber-50 disabled:opacity-60"
                                >
                                  Deactivate
                                </button>
                              ) : null}
                              {event.status !== "archived" ? (
                                <button
                                  type="button"
                                  disabled={isPending}
                                  onClick={() => setConfirmArchiveId(event.id)}
                                  className="min-h-8 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                                >
                                  Archive
                                </button>
                              ) : null}
                              <Link
                                href={`/events/${event.id}`}
                                className="inline-flex min-h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                              >
                                <span>Manage</span>
                                <ArrowRight
                                  className="h-3 w-3"
                                  aria-hidden="true"
                                />
                              </Link>
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
      </section>
    </div>
  );
}
