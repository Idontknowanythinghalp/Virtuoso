"use client";

import React, { useMemo, useState } from "react";
import { ClipboardList, Trophy } from "lucide-react";
import type { ReadOnlyLeaderboardRow } from "@/types/competition";

export interface ParticipantEventLeaderboardItem {
  eventId: string;
  eventCode: string;
  eventName: string;
  eventStatus: string;
  isPublished: boolean;
  lastUpdatedAt: string | null;
  entries: ReadOnlyLeaderboardRow[];
}

interface ParticipantLeaderboardProps {
  leaderboards: ParticipantEventLeaderboardItem[];
  currentContingentId: string;
  initialSelectedEventId?: string;
}

function countPositionOccurrences(
  entries: readonly { position: number }[],
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const entry of entries) {
    counts.set(entry.position, (counts.get(entry.position) ?? 0) + 1);
  }
  return counts;
}

function formatUtcTimestamp(isoString: string | null | undefined): string {
  if (!isoString) return "";
  try {
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
  } catch {
    return isoString;
  }
}

export function ParticipantLeaderboardView({
  leaderboards,
  currentContingentId,
  initialSelectedEventId,
}: ParticipantLeaderboardProps) {
  const defaultEventId = useMemo(() => {
    if (initialSelectedEventId) {
      const match = leaderboards.find((l) => l.eventId === initialSelectedEventId);
      if (match) return match.eventId;
    }
    return leaderboards[0]?.eventId ?? "";
  }, [leaderboards, initialSelectedEventId]);

  const [selectedEventId, setSelectedEventId] = useState<string>(defaultEventId);

  const activeLeaderboard = useMemo(() => {
    return (
      leaderboards.find((l) => l.eventId === selectedEventId) ??
      leaderboards[0] ??
      null
    );
  }, [leaderboards, selectedEventId]);

  const positionCounts = useMemo(() => {
    if (!activeLeaderboard) return new Map<number, number>();
    return countPositionOccurrences(activeLeaderboard.entries);
  }, [activeLeaderboard]);

  if (leaderboards.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center sm:p-12">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500">
          <ClipboardList className="h-6 w-6" aria-hidden="true" />
        </div>
        <h3 className="mt-4 font-display text-base font-bold text-slate-900 sm:text-lg">
          No Registered Events
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
          Your contingent is not currently registered for any competition events.
          Standings will be accessible once registrations are active.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Event tabs when registered in multiple events */}
      {leaderboards.length > 1 ? (
        <section aria-label="Event selector" className="space-y-2">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            Select Event
          </p>
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {leaderboards.map((lb) => {
              const isSelected = lb.eventId === (activeLeaderboard?.eventId ?? "");
              return (
                <button
                  key={lb.eventId}
                  type="button"
                  onClick={() => setSelectedEventId(lb.eventId)}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors ${
                    isSelected
                      ? "border-[#4B0507] bg-[#4B0507] text-white shadow-xs"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="font-mono text-xs">{lb.eventCode}</span>
                  <span className="truncate max-w-[160px] sm:max-w-none">
                    {lb.eventName}
                  </span>
                  {lb.isPublished ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        isSelected
                          ? "bg-white/20 text-white"
                          : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      }`}
                    >
                      Published
                    </span>
                  ) : (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        isSelected
                          ? "bg-white/10 text-white/80"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      Pending
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {activeLeaderboard ? (
        <div className="space-y-4">
          {/* Header Card */}
          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold text-[#4B0507]">
                  {activeLeaderboard.eventCode}
                </span>
                <span className="text-slate-300">·</span>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  {activeLeaderboard.eventName}
                </h2>
              </div>
              {activeLeaderboard.lastUpdatedAt ? (
                <p className="mt-1 text-xs text-slate-500">
                  Last updated: {formatUtcTimestamp(activeLeaderboard.lastUpdatedAt)}
                </p>
              ) : null}
            </div>

            <div>
              {activeLeaderboard.isPublished ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                  <Trophy className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                  <span>
                    Official Standings ({activeLeaderboard.entries.length}{" "}
                    {activeLeaderboard.entries.length === 1 ? "entry" : "entries"})
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                  Not Published
                </span>
              )}
            </div>
          </div>

          {/* Standings Table or Empty State */}
          {!activeLeaderboard.isPublished || activeLeaderboard.entries.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center sm:p-12">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700">
                <Trophy className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="mt-4 font-display text-base font-bold text-slate-900 sm:text-lg">
                No Leaderboard Published Yet
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
                Official standings for{" "}
                <span className="font-semibold text-slate-900">
                  {activeLeaderboard.eventCode} · {activeLeaderboard.eventName}
                </span>{" "}
                have not been published by the competition organisers yet. Standings will
                appear here once released.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left">
                  <thead className="bg-slate-50 text-xs font-semibold tracking-wider text-slate-600 uppercase">
                    <tr>
                      <th scope="col" className="w-24 px-4 py-3 sm:px-6">
                        Position
                      </th>
                      <th scope="col" className="px-4 py-3 sm:px-6">
                        Contingent
                      </th>
                      <th scope="col" className="px-4 py-3 text-right sm:px-6">
                        Score / Result
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {activeLeaderboard.entries.map((entry) => {
                      const isTied = (positionCounts.get(entry.position) ?? 0) > 1;
                      const isMyContingent =
                        entry.contingentId === currentContingentId;

                      return (
                        <tr
                          key={entry.id}
                          className={`transition-colors ${
                            isMyContingent
                              ? "bg-amber-50/70 hover:bg-amber-100/60"
                              : "hover:bg-slate-50/70"
                          }`}
                        >
                          <td className="px-4 py-3.5 sm:px-6">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`inline-flex items-center justify-center rounded px-2.5 py-1 font-mono text-xs font-bold tabular-nums ${
                                  entry.position === 1
                                    ? "border border-amber-300 bg-amber-100 text-amber-950"
                                    : entry.position === 2
                                    ? "border border-slate-300 bg-slate-100 text-slate-900"
                                    : entry.position === 3
                                    ? "border border-amber-200 bg-amber-50 text-amber-900"
                                    : "border border-slate-200 bg-slate-50 text-slate-800"
                                }`}
                              >
                                #{entry.position}
                              </span>
                              {isTied ? (
                                <span className="rounded bg-amber-100/80 px-1.5 py-0.5 text-[11px] font-medium text-amber-900">
                                  Tied
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 sm:px-6">
                            <div className="space-y-0.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-xs font-semibold text-[#4B0507]">
                                  {entry.contingentCode}
                                </span>
                                <span className="font-semibold text-slate-900">
                                  {entry.contingentName}
                                </span>
                                {isMyContingent ? (
                                  <span className="rounded-full bg-[#4B0507] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                    Your Team
                                  </span>
                                ) : null}
                              </div>
                              <p className="text-xs text-slate-500">
                                {entry.institutionName}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-right font-medium text-slate-900 sm:px-6">
                            <span className="inline-block rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                              {entry.displayValue}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
