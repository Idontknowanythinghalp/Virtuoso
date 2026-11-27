"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ClipboardList,
  RefreshCw,
  Trophy,
} from "lucide-react";
import {
  checkParticipantLeaderboardVersionAction,
  refreshParticipantLeaderboardsAction,
} from "@/app/actions/team-leaderboard";
import {
  LEADERBOARD_POLL_INTERVAL_MS,
  computeParticipantLeaderboardVersionToken,
  createParticipantLeaderboardSyncController,
  type ParticipantLeaderboardSyncController,
} from "@/lib/leaderboard/participant-polling";
import { formatIstTimestamp } from "@/lib/date-time";
import {
  countRankOccurrences,
  formatLeaderboardScore,
} from "@/lib/leaderboard/validation";
import type { ReadOnlyLeaderboardRow } from "@/types/competition";

export interface ParticipantEventLeaderboardItem {
  eventId: string;
  eventCode: string;
  eventName: string;
  eventStatus: string;
  isPublished: boolean;
  publishedAt: string | null;
  entries: ReadOnlyLeaderboardRow[];
}

interface ParticipantLeaderboardProps {
  leaderboards: ParticipantEventLeaderboardItem[];
  currentContingentId: string;
  initialSelectedEventId?: string;
}

function getRankBadgeClasses(rank: number | null): string {
  if (rank === 1) {
    return "border-[#D9AD61] bg-[#D9AD61] text-[#200000]";
  }
  if (rank === 2) {
    return "border-[#B9AAA5]/60 bg-[#401010] text-[#F5F0EC]";
  }
  if (rank === 3) {
    return "border-[#C08A5A]/55 bg-[#350A0A] text-[#E6C3A1]";
  }
  return "border-[#542525] bg-[#350A0A] text-[#F5F0EC]";
}

export function ParticipantLeaderboardView({
  leaderboards: initialLeaderboards,
  currentContingentId,
  initialSelectedEventId,
}: ParticipantLeaderboardProps) {
  const [leaderboards, setLeaderboards] =
    useState<ParticipantEventLeaderboardItem[]>(initialLeaderboards);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAutoUpdating, setIsAutoUpdating] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const refreshLockRef = useRef(false);
  const syncControllerRef = useRef<ParticipantLeaderboardSyncController | null>(
    null,
  );

  const initialVersionToken = useMemo(
    () => computeParticipantLeaderboardVersionToken(initialLeaderboards),
    [initialLeaderboards],
  );

  const defaultEventId = useMemo(() => {
    if (initialSelectedEventId) {
      const match = initialLeaderboards.find(
        (l) => l.eventId === initialSelectedEventId,
      );
      if (match) return match.eventId;
    }
    const firstPublished = initialLeaderboards.find((l) => l.isPublished);
    return firstPublished?.eventId ?? initialLeaderboards[0]?.eventId ?? "";
  }, [initialLeaderboards, initialSelectedEventId]);

  const [selectedEventId, setSelectedEventId] =
    useState<string>(defaultEventId);

  const activeLeaderboard = useMemo(() => {
    return (
      leaderboards.find((l) => l.eventId === selectedEventId) ??
      leaderboards.find((l) => l.isPublished) ??
      leaderboards[0] ??
      null
    );
  }, [leaderboards, selectedEventId]);

  const rankCounts = useMemo(() => {
    if (!activeLeaderboard) return new Map<number, number>();
    return countRankOccurrences(activeLeaderboard.entries);
  }, [activeLeaderboard]);

  useEffect(() => {
    const controller =
      createParticipantLeaderboardSyncController<ParticipantEventLeaderboardItem>(
        {
          initialVersionToken,
          checkVersion: () => checkParticipantLeaderboardVersionAction(),
          fetchFullLeaderboards: () => refreshParticipantLeaderboardsAction(),
          onAutoUpdateStart: () => {
            refreshLockRef.current = true;
            setIsAutoUpdating(true);
          },
          onAutoUpdateEnd: () => {
            refreshLockRef.current = false;
            setIsAutoUpdating(false);
          },
          onAutoCheckSuccess: () => {
            setRefreshError(null);
          },
          onManualRefreshStart: () => {
            refreshLockRef.current = true;
            setIsRefreshing(true);
            setRefreshError(null);
          },
          onManualRefreshEnd: () => {
            refreshLockRef.current = false;
            setIsRefreshing(false);
          },
          onLeaderboardsUpdated: ({ leaderboards: updated, refreshedAt }) => {
            setLeaderboards(updated);
            setLastRefreshedAt(refreshedAt);
            setRefreshError(null);

            if (updated.length > 0) {
              setSelectedEventId((prev) => {
                const stillExists = updated.some(
                  (item) => item.eventId === prev,
                );
                if (stillExists) return prev;
                return (
                  updated.find((item) => item.isPublished)?.eventId ??
                  updated[0].eventId
                );
              });
            }
          },
          onError: ({ message, isTerminalAuth }) => {
            setRefreshError(message);
            if (isTerminalAuth) {
              stopPollingInterval();
            }
          },
        },
      );

    syncControllerRef.current = controller;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    function stopPollingInterval() {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }

    function startPollingInterval() {
      if (intervalId !== null || controller.isAuthStopped()) {
        return;
      }
      intervalId = setInterval(() => {
        if (
          typeof document !== "undefined" &&
          document.visibilityState !== "visible"
        ) {
          return;
        }
        void controller.checkAndSync();
      }, LEADERBOARD_POLL_INTERVAL_MS);
    }

    function handleVisibilityChange() {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "visible") {
        startPollingInterval();
        void controller.checkAndSync();
      } else {
        stopPollingInterval();
      }
    }

    if (
      typeof document === "undefined" ||
      document.visibilityState === "visible"
    ) {
      startPollingInterval();
    }

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      stopPollingInterval();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      controller.stop();
      if (syncControllerRef.current === controller) {
        syncControllerRef.current = null;
      }
      refreshLockRef.current = false;
    };
  }, [initialVersionToken]);

  async function handleRefreshLeaderboard() {
    if (refreshLockRef.current || isRefreshing) {
      return;
    }

    const controller = syncControllerRef.current;
    if (controller) {
      await controller.manualRefresh();
      return;
    }

    refreshLockRef.current = true;
    setIsRefreshing(true);
    setRefreshError(null);

    try {
      const result = await refreshParticipantLeaderboardsAction();
      if (!result.ok) {
        setRefreshError(result.message);
        return;
      }

      setLeaderboards(result.leaderboards);
      setLastRefreshedAt(result.refreshedAt);

      if (result.leaderboards.length > 0) {
        setSelectedEventId((prev) => {
          const stillExists = result.leaderboards.some(
            (item) => item.eventId === prev,
          );
          if (stillExists) return prev;
          return (
            result.leaderboards.find((item) => item.isPublished)?.eventId ??
            result.leaderboards[0].eventId
          );
        });
      }
    } catch {
      setRefreshError(
        "Unable to refresh leaderboard standings right now. Please try again.",
      );
    } finally {
      refreshLockRef.current = false;
      setIsRefreshing(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-lg border border-[#542525] bg-[#2B0808] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#B9AAA5]">
          {isAutoUpdating ? (
            <span
              role="status"
              aria-live="polite"
              className="inline-flex items-center gap-1.5 font-semibold text-[#D9AD61]"
            >
              <RefreshCw
                className="h-3.5 w-3.5 shrink-0 animate-spin"
                aria-hidden="true"
              />
              <span>Updating standings...</span>
            </span>
          ) : lastRefreshedAt ? (
            <span className="font-mono tabular-nums">
              Last refreshed: {formatIstTimestamp(lastRefreshedAt)}
            </span>
          ) : (
            <span>Showing latest published competition standings.</span>
          )}
        </div>

        <button
          type="button"
          onClick={handleRefreshLeaderboard}
          disabled={isRefreshing || isAutoUpdating}
          aria-busy={isRefreshing || isAutoUpdating}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 self-start rounded-md border border-[#D9AD61]/60 bg-[#401010] px-3.5 py-2 text-xs font-semibold whitespace-nowrap text-[#F5F0EC] transition-colors hover:border-[#D9AD61] hover:bg-[#D9AD61] hover:text-[#200000] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9AD61] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2B0808] disabled:cursor-not-allowed disabled:opacity-60 sm:self-auto"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 shrink-0 ${isRefreshing || isAutoUpdating ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          <span>
            {isRefreshing
              ? "Refreshing..."
              : isAutoUpdating
                ? "Updating..."
                : "Refresh Leaderboard"}
          </span>
        </button>
      </div>

      {refreshError ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-red-400/45 bg-[#350A0A] px-4 py-3 text-sm text-red-200"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-red-300"
            aria-hidden="true"
          />
          <span>{refreshError}</span>
        </div>
      ) : null}

      {leaderboards.length === 0 ? (
        <div className="rounded-lg border border-[#542525] bg-[#2B0808] p-8 text-center sm:p-12">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-[#542525] bg-[#350A0A] text-[#D9AD61]">
            <ClipboardList className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="mt-4 font-display text-base font-bold text-[#F5F0EC] sm:text-lg">
            No Registered Events
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#B9AAA5]">
            Your contingent does not currently hold any active event
            registrations. Published standings will appear here once
            registrations are active.
          </p>
        </div>
      ) : (
        <>
          {leaderboards.length > 1 ? (
            <section aria-label="Event selector" className="space-y-2">
              <p className="text-xs font-semibold tracking-wide text-[#D9AD61]">
                Select Competition Event
              </p>
              <div
                role="tablist"
                aria-label="Registered events"
                className="flex items-center gap-2 overflow-x-auto pb-1"
              >
                {leaderboards.map((lb) => {
                  const isSelected =
                    lb.eventId === (activeLeaderboard?.eventId ?? "");
                  return (
                    <button
                      key={lb.eventId}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => setSelectedEventId(lb.eventId)}
                      className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9AD61] ${
                        isSelected
                          ? "border-[#D9AD61] bg-[#401010] text-[#F5F0EC]"
                          : "border-[#542525] bg-[#2B0808] text-[#B9AAA5] hover:border-[#D9AD61]/60 hover:bg-[#350A0A] hover:text-[#F5F0EC]"
                      }`}
                    >
                      <span className="font-mono text-xs font-semibold text-[#D9AD61]">
                        {lb.eventCode}
                      </span>
                      <span className="max-w-[160px] truncate sm:max-w-none">
                        {lb.eventName}
                      </span>
                      {lb.isPublished ? (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                            isSelected
                              ? "bg-[#D9AD61] text-[#200000]"
                              : "border border-emerald-400/40 bg-emerald-950/60 text-emerald-300"
                          }`}
                        >
                          Published
                        </span>
                      ) : (
                        <span
                          className={`rounded border border-[#542525] px-1.5 py-0.5 text-[11px] font-medium ${
                            isSelected
                              ? "bg-[#2B0808] text-[#B9AAA5]"
                              : "bg-[#350A0A] text-[#B9AAA5]"
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
              <div className="flex flex-col gap-3 rounded-lg border border-[#542525] bg-[#2B0808] p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold tracking-wide text-[#D9AD61]">
                      {activeLeaderboard.eventCode}
                    </span>
                    <span className="text-[#542525]" aria-hidden="true">
                      ·
                    </span>
                    <h2 className="font-display text-lg font-bold text-[#F5F0EC] sm:text-xl">
                      {activeLeaderboard.eventName}
                    </h2>
                  </div>
                  {activeLeaderboard.isPublished &&
                  activeLeaderboard.publishedAt ? (
                    <p className="font-mono text-xs tabular-nums text-[#B9AAA5]">
                      Last published:{" "}
                      {formatIstTimestamp(activeLeaderboard.publishedAt)}
                    </p>
                  ) : null}
                </div>

                <div className="shrink-0">
                  {activeLeaderboard.isPublished ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-[#D9AD61]/50 bg-[#350A0A] px-3 py-1.5 text-xs font-semibold text-[#D9AD61]">
                      <Trophy
                        className="h-3.5 w-3.5 text-[#D9AD61]"
                        aria-hidden="true"
                      />
                      <span>
                        Official Standings ({activeLeaderboard.entries.length}{" "}
                        {activeLeaderboard.entries.length === 1
                          ? "entry"
                          : "entries"}
                        )
                      </span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-[#542525] bg-[#350A0A] px-3 py-1.5 text-xs font-medium text-[#B9AAA5]">
                      Not Published
                    </span>
                  )}
                </div>
              </div>

              {!activeLeaderboard.isPublished ? (
                <div className="rounded-lg border border-[#542525] bg-[#2B0808] p-8 text-center sm:p-12">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-[#542525] bg-[#350A0A] text-[#D9AD61]">
                    <Trophy className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 font-display text-base font-bold text-[#F5F0EC] sm:text-lg">
                    No Leaderboard Published Yet
                  </h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#B9AAA5]">
                    Official standings for{" "}
                    <span className="font-semibold text-[#F5F0EC]">
                      {activeLeaderboard.eventCode} ·{" "}
                      {activeLeaderboard.eventName}
                    </span>{" "}
                    have not been published by the competition organisers yet.
                    Standings will appear here once released.
                  </p>
                </div>
              ) : activeLeaderboard.entries.length === 0 ? (
                <div className="rounded-lg border border-[#542525] bg-[#2B0808] p-8 text-center sm:p-12">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-[#542525] bg-[#350A0A] text-[#B9AAA5]">
                    <Trophy className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 font-display text-base font-bold text-[#F5F0EC] sm:text-lg">
                    No Standings Entries Yet
                  </h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#B9AAA5]">
                    This leaderboard has been published, but no contingent
                    rankings are currently listed.
                  </p>
                </div>
              ) : (
                <>
                  {/* Mobile card layout — zero horizontal scrolling */}
                  <ul
                    aria-label="Event standings"
                    className="space-y-3 md:hidden"
                  >
                    {activeLeaderboard.entries.map((entry) => {
                      const isTied =
                        entry.rank !== null &&
                        (rankCounts.get(entry.rank) ?? 0) > 1;
                      const isMyContingent =
                        entry.contingentId.trim().toLowerCase() ===
                        currentContingentId.trim().toLowerCase();

                      return (
                        <li
                          key={entry.id}
                          className={`rounded-lg border p-4 ${
                            isMyContingent
                              ? "border-[#D9AD61]/75 bg-[#350A0A]"
                              : "border-[#542525] bg-[#2B0808]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {entry.rank !== null ? (
                                <span
                                  className={`inline-flex items-center justify-center rounded border px-2.5 py-1 font-mono text-xs font-bold tabular-nums ${getRankBadgeClasses(entry.rank)}`}
                                >
                                  #{entry.rank}
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center rounded border border-[#542525] bg-[#350A0A] px-2.5 py-1 text-xs font-medium text-[#B9AAA5]">
                                  Unranked
                                </span>
                              )}
                              {isTied ? (
                                <span className="rounded border border-[#D9AD61]/45 bg-[#401010] px-2 py-0.5 text-[11px] font-semibold text-[#D9AD61]">
                                  Tied
                                </span>
                              ) : null}
                              {isMyContingent ? (
                                <span className="rounded bg-[#D9AD61] px-2 py-0.5 text-[11px] font-semibold text-[#200000]">
                                  Your Team
                                </span>
                              ) : null}
                            </div>

                            <div className="shrink-0 text-right">
                              {entry.score !== null ? (
                                <span className="inline-block rounded-md border border-[#542525] bg-[#401010] px-2.5 py-1 font-mono text-sm font-bold tabular-nums text-[#F5F0EC]">
                                  {formatLeaderboardScore(entry.score)}
                                </span>
                              ) : entry.displayLabel ? (
                                <span className="inline-block rounded-md border border-[#542525] bg-[#401010] px-2.5 py-1 font-mono text-sm font-bold text-[#F5F0EC]">
                                  {entry.displayLabel}
                                </span>
                              ) : (
                                <span className="inline-block rounded-md border border-[#542525] bg-[#350A0A] px-2.5 py-1 text-xs font-medium text-[#B9AAA5]">
                                  No score
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="mt-3 space-y-0.5">
                            <p className="font-mono text-xs font-semibold text-[#D9AD61]">
                              {entry.contingentCode}
                            </p>
                            <p className="font-display text-sm font-bold text-[#F5F0EC]">
                              {entry.contingentName}
                            </p>
                            <p className="text-xs text-[#B9AAA5]">
                              {entry.institutionName}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  {/* Desktop & tablet table */}
                  <div className="hidden overflow-hidden rounded-lg border border-[#542525] bg-[#2B0808] md:block">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-[#542525] text-left">
                        <thead className="bg-[#200000] text-xs font-semibold tracking-wider text-[#D9AD61] uppercase">
                          <tr>
                            <th scope="col" className="w-36 px-6 py-3.5">
                              Rank
                            </th>
                            <th scope="col" className="px-6 py-3.5">
                              Contingent
                            </th>
                            <th
                              scope="col"
                              className="w-40 px-6 py-3.5 text-right"
                            >
                              Score
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#542525] text-sm">
                          {activeLeaderboard.entries.map((entry) => {
                            const isTied =
                              entry.rank !== null &&
                              (rankCounts.get(entry.rank) ?? 0) > 1;
                            const isMyContingent =
                              entry.contingentId.trim().toLowerCase() ===
                              currentContingentId.trim().toLowerCase();

                            return (
                              <tr
                                key={entry.id}
                                className={`transition-colors ${
                                  isMyContingent
                                    ? "bg-[#350A0A] hover:bg-[#401010]"
                                    : "bg-[#2B0808] hover:bg-[#350A0A]"
                                }`}
                              >
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-1.5">
                                    {entry.rank !== null ? (
                                      <span
                                        className={`inline-flex items-center justify-center rounded border px-2.5 py-1 font-mono text-xs font-bold tabular-nums ${getRankBadgeClasses(entry.rank)}`}
                                      >
                                        #{entry.rank}
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center justify-center rounded border border-[#542525] bg-[#350A0A] px-2.5 py-1 text-xs font-medium text-[#B9AAA5]">
                                        Unranked
                                      </span>
                                    )}
                                    {isTied ? (
                                      <span className="rounded border border-[#D9AD61]/45 bg-[#401010] px-1.5 py-0.5 text-[11px] font-semibold text-[#D9AD61]">
                                        Tied
                                      </span>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="space-y-0.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-mono text-xs font-semibold text-[#D9AD61]">
                                        {entry.contingentCode}
                                      </span>
                                      <span className="font-display font-semibold text-[#F5F0EC]">
                                        {entry.contingentName}
                                      </span>
                                      {isMyContingent ? (
                                        <span className="rounded bg-[#D9AD61] px-2 py-0.5 text-[11px] font-semibold text-[#200000]">
                                          Your Team
                                        </span>
                                      ) : null}
                                    </div>
                                    <p className="text-xs text-[#B9AAA5]">
                                      {entry.institutionName}
                                    </p>
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-right font-medium text-[#F5F0EC]">
                                  {entry.score !== null ? (
                                    <span className="inline-block rounded-md border border-[#542525] bg-[#401010] px-3 py-1 font-mono text-sm font-bold tabular-nums text-[#F5F0EC]">
                                      {formatLeaderboardScore(entry.score)}
                                    </span>
                                  ) : entry.displayLabel ? (
                                    <span className="inline-block rounded-md border border-[#542525] bg-[#401010] px-3 py-1 font-mono text-sm font-bold text-[#F5F0EC]">
                                      {entry.displayLabel}
                                    </span>
                                  ) : (
                                    <span className="inline-block rounded-md border border-[#542525] bg-[#350A0A] px-3 py-1 text-xs font-medium text-[#B9AAA5]">
                                      No score
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
