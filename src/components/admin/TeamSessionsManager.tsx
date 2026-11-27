"use client";

import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  LogOut,
  MonitorSmartphone,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
  XCircle,
} from "lucide-react";
import {
  inspectTeamSessionsAction,
  refreshTeamSessionOverviewAction,
  revokeAllTeamsGlobalAction,
  revokeSingleTeamSessionAction,
  revokeTeamAllDevicesAction,
} from "@/app/actions/team-sessions";
import { formatIstDateTimeWithSeconds, formatIstTimestamp } from "@/lib/date-time";
import {
  GLOBAL_LOGOUT_CONFIRMATION_PHRASE,
  buildTeamSessionOverviewSummary,
  filterTeamSessionOverviews,
  formatTeamSessionRevocationReason,
  type TeamSessionLoginFilter,
} from "@/lib/auth/team-session-management";
import type {
  TeamSessionDetailItem,
  TeamSessionDetailsPayload,
  TeamSessionOverviewItem,
  TeamSessionOverviewPayload,
} from "@/types/team-auth";

interface TeamSessionsManagerProps {
  initialOverview: TeamSessionOverviewPayload;
  initialDetails: TeamSessionDetailsPayload | null;
  initialDetailsError?: string | null;
}

type PendingConfirmation =
  | {
      kind: "single";
      contingentCode: string;
      contingentName: string;
      session: TeamSessionDetailItem;
    }
  | {
      kind: "team_all";
      contingentCode: string;
      contingentName: string;
      activeSessionCount: number;
    }
  | {
      kind: "global_all";
      loggedInTeams: number;
      totalActiveSessions: number;
    };

export function TeamSessionsManager({
  initialOverview,
  initialDetails,
  initialDetailsError = null,
}: TeamSessionsManagerProps) {
  const [overview, setOverview] =
    useState<TeamSessionOverviewPayload>(initialOverview);
  const [selectedDetails, setSelectedDetails] =
    useState<TeamSessionDetailsPayload | null>(initialDetails);
  const [detailsError, setDetailsError] = useState<string | null>(
    initialDetailsError,
  );
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<TeamSessionLoginFilter>("all");
  const [loadingTeamCode, setLoadingTeamCode] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);
  const [globalConfirmInput, setGlobalConfirmInput] = useState("");

  const [isRefreshing, startRefreshTransition] = useTransition();
  const [isInspecting, startInspectTransition] = useTransition();
  const [isMutating, startMutationTransition] = useTransition();

  const detailSectionRef = useRef<HTMLElement | null>(null);
  const dialogCancelRef = useRef<HTMLButtonElement | null>(null);
  const globalInputRef = useRef<HTMLInputElement | null>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);

  const summary = useMemo(
    () => buildTeamSessionOverviewSummary(overview.teams),
    [overview.teams],
  );

  const filteredTeams = useMemo(
    () => filterTeamSessionOverviews(overview.teams, query, statusFilter),
    [overview.teams, query, statusFilter],
  );

  useEffect(() => {
    if (!pendingConfirmation) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    if (pendingConfirmation.kind === "global_all") {
      globalInputRef.current?.focus();
    } else {
      dialogCancelRef.current?.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isMutating) {
        setPendingConfirmation(null);
        setGlobalConfirmInput("");
        lastTriggerRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [pendingConfirmation, isMutating]);

  function openConfirmation(
    next: PendingConfirmation,
    triggerElement?: HTMLElement | null,
  ) {
    lastTriggerRef.current = triggerElement ?? null;
    if (next.kind === "global_all") {
      setGlobalConfirmInput("");
    }
    setPendingConfirmation(next);
  }

  function closeConfirmation() {
    if (isMutating) return;
    setPendingConfirmation(null);
    setGlobalConfirmInput("");
    lastTriggerRef.current?.focus();
  }

  function handleRefreshAll() {
    setFeedback(null);
    setDetailsError(null);
    const activeCode = selectedDetails?.contingentCode ?? null;

    startRefreshTransition(async () => {
      const [overviewRes, detailsRes] = await Promise.all([
        refreshTeamSessionOverviewAction(),
        activeCode
          ? inspectTeamSessionsAction(activeCode)
          : Promise.resolve(null),
      ]);

      if (!overviewRes.ok) {
        setFeedback({ ok: false, message: overviewRes.error });
        return;
      }

      setOverview(overviewRes.overview);
      if (detailsRes) {
        if (detailsRes.ok) {
          setSelectedDetails(detailsRes.details);
        } else {
          setDetailsError(detailsRes.error);
        }
      }
    });
  }

  function handleInspectTeam(team: TeamSessionOverviewItem) {
    if (!team.hasTeamAccount) return;
    setDetailsError(null);
    setFeedback(null);
    setLoadingTeamCode(team.contingentCode);

    startInspectTransition(async () => {
      const result = await inspectTeamSessionsAction(team.contingentCode);
      setLoadingTeamCode(null);

      if (!result.ok) {
        setDetailsError(result.error);
        return;
      }

      setSelectedDetails(result.details);
      requestAnimationFrame(() => {
        detailSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      });
    });
  }

  function handleConfirmAction() {
    if (!pendingConfirmation) return;

    const current = pendingConfirmation;
    startMutationTransition(async () => {
      if (current.kind === "single") {
        const res = await revokeSingleTeamSessionAction({
          contingentCode: current.contingentCode,
          sessionId: current.session.sessionId,
        });
        setPendingConfirmation(null);
        setFeedback({ ok: res.ok, message: res.message });
        if (res.overview) setOverview(res.overview);
        if (res.details !== undefined) setSelectedDetails(res.details);
        return;
      }

      if (current.kind === "team_all") {
        const res = await revokeTeamAllDevicesAction({
          contingentCode: current.contingentCode,
        });
        setPendingConfirmation(null);
        setFeedback({ ok: res.ok, message: res.message });
        if (res.overview) setOverview(res.overview);
        if (res.details !== undefined) setSelectedDetails(res.details);
        return;
      }

      const res = await revokeAllTeamsGlobalAction({
        confirmationText: globalConfirmInput,
        selectedContingentCode: selectedDetails?.contingentCode ?? null,
      });

      if (!res.ok) {
        // Keep dialog open if phrase didn't match so the operator sees why
        setFeedback({ ok: false, message: res.message });
        if (
          globalConfirmInput.trim() !== GLOBAL_LOGOUT_CONFIRMATION_PHRASE
        ) {
          return;
        }
        setPendingConfirmation(null);
        setGlobalConfirmInput("");
        return;
      }

      setPendingConfirmation(null);
      setGlobalConfirmInput("");
      setFeedback({ ok: true, message: res.message });
      if (res.overview) setOverview(res.overview);
      if (res.details !== undefined) setSelectedDetails(res.details);
    });
  }

  const globalPhraseMatches =
    globalConfirmInput.trim() === GLOBAL_LOGOUT_CONFIRMATION_PHRASE;

  return (
    <div className="space-y-8">
      {/* Operational Summary Strip */}
      <section
        aria-label="Session Monitoring Summary"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">
            Teams Logged In
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900">
            {summary.loggedInTeams}
            <span className="ml-1.5 text-sm font-normal text-slate-500">
              / {summary.provisionedTeams} provisioned
            </span>
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">
            Active Device Sessions
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#4B0507]">
            {summary.totalActiveSessions}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">
            Device Limit Per Team
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900">
            {overview.maxSessions}
            <span className="ml-1.5 text-xs font-sans font-normal text-slate-500">
              simultaneous
            </span>
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">
            Last Refreshed
          </p>
          <p className="mt-2 font-mono text-xs font-medium tabular-nums text-slate-800">
            {formatIstDateTimeWithSeconds(overview.generatedAt)}
          </p>
        </div>
      </section>

      {feedback ? (
        <div
          role={feedback.ok ? "status" : "alert"}
          className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
            feedback.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          <div className="flex items-start gap-2.5">
            {feedback.ok ? (
              <CheckCircle2
                className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700"
                aria-hidden="true"
              />
            ) : (
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-red-700"
                aria-hidden="true"
              />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="Dismiss status message"
            className="rounded p-1 opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {detailsError ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          {detailsError}
        </div>
      ) : null}

      {/* Selected Team Session Inspection Panel */}
      {selectedDetails ? (
        <section
          ref={detailSectionRef}
          aria-labelledby="selected-team-sessions-heading"
          className="rounded-lg border border-slate-300 bg-white shadow-sm"
        >
          <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50/70 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="rounded bg-[#4B0507] px-2 py-0.5 font-mono text-xs font-semibold text-white">
                  {selectedDetails.contingentCode}
                </span>
                <h2
                  id="selected-team-sessions-heading"
                  className="font-display text-lg font-bold text-slate-900"
                >
                  {selectedDetails.contingentName}
                </h2>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    selectedDetails.activeSessionCount > 0
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {selectedDetails.activeSessionCount} /{" "}
                  {selectedDetails.maxSessions} active
                </span>
              </div>
              <p className="text-xs text-slate-600">
                {selectedDetails.institutionName}
                {!selectedDetails.contingentIsActive
                  ? " · Contingent Inactive"
                  : !selectedDetails.teamAccountIsActive
                    ? " · Team Account Deactivated"
                    : ""}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={
                  isMutating || selectedDetails.activeSessionCount === 0
                }
                onClick={(event) =>
                  openConfirmation(
                    {
                      kind: "team_all",
                      contingentCode: selectedDetails.contingentCode,
                      contingentName: selectedDetails.contingentName,
                      activeSessionCount: selectedDetails.activeSessionCount,
                    },
                    event.currentTarget,
                  )
                }
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-red-300 bg-red-600 px-4 py-2 text-xs font-semibold whitespace-nowrap text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
              >
                <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>Log Out All Devices</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedDetails(null)}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium whitespace-nowrap text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
              >
                <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>Close</span>
              </button>
            </div>
          </div>

          <div className="border-b border-slate-200 bg-amber-50/50 px-6 py-3 text-xs text-slate-700">
            <div className="flex items-start gap-2">
              <Info
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700"
                aria-hidden="true"
              />
              <p>
                <strong>Telemetry scope:</strong> Device/browser user-agent
                strings are not collected at team login.{" "}
                <span className="font-medium">Last Activity</span> reflects the
                latest sign-in or session registration/refresh timestamp rather
                than per-page heartbeats. Revoking a session blocks that device
                immediately on its next request.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-600">
                  <th scope="col" className="px-4 py-3">
                    Session ID
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Device / Browser
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Created
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Last Activity
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Expires
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {selectedDetails.sessions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-sm text-slate-500"
                    >
                      No session history recorded for this team yet.
                    </td>
                  </tr>
                ) : (
                  selectedDetails.sessions.map((session) => (
                    <tr
                      key={session.sessionId}
                      className="align-top hover:bg-slate-50/60"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-slate-800">
                        <span title={session.sessionId}>
                          {session.sessionId}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {session.deviceInfoStatus}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums whitespace-nowrap text-slate-700">
                        {formatIstDateTimeWithSeconds(session.createdAt)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums whitespace-nowrap text-slate-700">
                        {formatIstDateTimeWithSeconds(session.lastSeenAt)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums whitespace-nowrap text-slate-600">
                        {session.expiresAt
                          ? formatIstDateTimeWithSeconds(session.expiresAt)
                          : "Not set (GoTrue default)"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {session.status === "active" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                            <CheckCircle2
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                            Active
                          </span>
                        ) : session.status === "expired" ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                              <Clock className="h-3 w-3" aria-hidden="true" />
                              Expired
                            </span>
                            {session.revokedAt ? (
                              <p className="font-mono text-[11px] text-slate-500">
                                Pruned {formatIstTimestamp(session.revokedAt)}
                              </p>
                            ) : (
                              <p className="text-[11px] text-amber-700">
                                Awaiting next prune (slot excluded)
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-800">
                              <XCircle className="h-3 w-3" aria-hidden="true" />
                              Revoked
                            </span>
                            <p className="text-[11px] text-slate-600">
                              {formatTeamSessionRevocationReason(
                                session.revokedReason,
                              )}
                            </p>
                            {session.revokedAt ? (
                              <p className="font-mono text-[11px] text-slate-500">
                                {formatIstTimestamp(session.revokedAt)}
                              </p>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {session.status === "active" ? (
                          <button
                            type="button"
                            disabled={isMutating}
                            onClick={(event) =>
                              openConfirmation(
                                {
                                  kind: "single",
                                  contingentCode:
                                    selectedDetails.contingentCode,
                                  contingentName:
                                    selectedDetails.contingentName,
                                  session,
                                },
                                event.currentTarget,
                              )
                            }
                            className="min-h-8 rounded-md border border-red-200 bg-white px-3 py-1 text-xs font-medium whitespace-nowrap text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Revoke Session
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Team Overview Table */}
      <section aria-labelledby="team-overview-heading" className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2
              id="team-overview-heading"
              className="font-display text-lg font-semibold text-slate-900"
            >
              Contingent Login Overview
            </h2>
            <p className="text-sm text-slate-600">
              Showing {filteredTeams.length} of {overview.teams.length}{" "}
              {overview.teams.length === 1 ? "team" : "teams"} (expired sessions
              are automatically excluded from active counts).
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search team name or code..."
                aria-label="Search teams by name or contingent code"
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20 sm:w-64"
              />
            </div>

            <div
              role="group"
              aria-label="Filter teams by login status"
              className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 p-1"
            >
              {(
                [
                  { id: "all", label: "All" },
                  { id: "logged_in", label: "Logged In" },
                  { id: "not_logged_in", label: "Not Logged In" },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setStatusFilter(option.id)}
                  className={`min-h-8 rounded px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507] ${
                    statusFilter === option.id
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleRefreshAll}
              disabled={isRefreshing || isMutating}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium whitespace-nowrap text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 shrink-0 ${
                  isRefreshing ? "animate-spin" : ""
                }`}
                aria-hidden="true"
              />
              <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-600">
                <th scope="col" className="px-4 py-3">
                  Team
                </th>
                <th scope="col" className="px-4 py-3">
                  Team Code
                </th>
                <th scope="col" className="px-4 py-3">
                  Active Sessions
                </th>
                <th scope="col" className="px-4 py-3">
                  Login Status
                </th>
                <th scope="col" className="px-4 py-3">
                  Most Recent Activity
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Sessions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredTeams.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-sm text-slate-500"
                  >
                    No teams match the current search or status filter.
                  </td>
                </tr>
              ) : (
                filteredTeams.map((team) => {
                  const isSelected =
                    selectedDetails?.contingentCode === team.contingentCode;
                  const isLoadingThis =
                    isInspecting && loadingTeamCode === team.contingentCode;
                  const recentTimestamp =
                    team.mostRecentActiveAt ?? team.mostRecentActivityAt;

                  return (
                    <tr
                      key={team.contingentId}
                      className={`transition-colors ${
                        isSelected
                          ? "bg-[#4B0507]/[0.04]"
                          : "hover:bg-slate-50/60"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">
                          {team.contingentName}
                        </div>
                        <div className="text-xs text-slate-500">
                          {team.institutionName}
                        </div>
                      </td>

                      <td className="px-4 py-3 font-mono text-xs font-semibold whitespace-nowrap text-slate-800">
                        {team.contingentCode}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-xs font-semibold tabular-nums text-slate-900">
                            {team.activeSessionCount} / {team.maxSessions}
                          </span>
                          <div
                            className="flex items-center gap-1"
                            aria-hidden="true"
                          >
                            {Array.from(
                              { length: team.maxSessions },
                              (_, idx) => (
                                <span
                                  key={idx}
                                  className={`h-2 w-2 rounded-full ${
                                    idx < team.activeSessionCount
                                      ? "bg-[#4B0507]"
                                      : "bg-slate-200"
                                  }`}
                                />
                              ),
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        {!team.hasTeamAccount ? (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
                            Not Provisioned
                          </span>
                        ) : !team.contingentIsActive ||
                          !team.teamAccountIsActive ? (
                          <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                            Account Disabled
                          </span>
                        ) : team.isLoggedIn ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                            Logged In
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                            Not Logged In
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 font-mono text-xs tabular-nums whitespace-nowrap text-slate-600">
                        {recentTimestamp
                          ? formatIstTimestamp(recentTimestamp)
                          : "—"}
                      </td>

                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {team.hasTeamAccount ? (
                          <button
                            type="button"
                            disabled={isInspecting}
                            onClick={() => handleInspectTeam(team)}
                            className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507] disabled:cursor-not-allowed disabled:opacity-60 ${
                              isSelected
                                ? "border-[#4B0507] bg-[#4B0507] text-white"
                                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            <MonitorSmartphone
                              className="h-3.5 w-3.5 shrink-0"
                              aria-hidden="true"
                            />
                            <span>
                              {isLoadingThis
                                ? "Loading..."
                                : isSelected
                                  ? "Inspecting"
                                  : "Inspect Sessions"}
                            </span>
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">
                            No account
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Visually Separated Emergency Global Logout Section */}
      <section
        aria-labelledby="emergency-global-logout-heading"
        className="rounded-lg border border-red-200 bg-red-50/50 p-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-red-900">
              <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden="true" />
              <h2
                id="emergency-global-logout-heading"
                className="font-display text-base font-bold"
              >
                Competition-Wide Emergency Session Control
              </h2>
            </div>
            <p className="max-w-2xl text-xs leading-relaxed text-red-900/90">
              Forces every currently logged-in team across the entire
              competition out of all active devices simultaneously. Team
              accounts, passwords, registrations, and scores remain intact, and
              teams can sign in again immediately if needed.
            </p>
          </div>

          <button
            type="button"
            disabled={isMutating}
            onClick={(event) =>
              openConfirmation(
                {
                  kind: "global_all",
                  loggedInTeams: summary.loggedInTeams,
                  totalActiveSessions: summary.totalActiveSessions,
                },
                event.currentTarget,
              )
            }
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-red-700 bg-red-700 px-4 py-2 text-xs font-semibold whitespace-nowrap text-white transition-colors hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Log Out All Teams</span>
          </button>
        </div>
      </section>

      {/* Accessible Confirmation Modal */}
      {pendingConfirmation ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="session-confirm-dialog-title"
        >
          <button
            type="button"
            aria-label="Close confirmation dialog"
            onClick={closeConfirmation}
            className="fixed inset-0 bg-slate-900/50"
          />

          <div className="relative z-10 w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-red-100 p-2 text-red-700">
                  {pendingConfirmation.kind === "global_all" ? (
                    <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                  )}
                </div>
                <div>
                  <h3
                    id="session-confirm-dialog-title"
                    className="font-display text-lg font-bold text-slate-900"
                  >
                    {pendingConfirmation.kind === "single"
                      ? "Revoke Team Device Session"
                      : pendingConfirmation.kind === "team_all"
                        ? `Log Out All Devices for ${pendingConfirmation.contingentCode}`
                        : "Emergency: Log Out Every Team?"}
                  </h3>
                </div>
              </div>

              <button
                type="button"
                disabled={isMutating}
                onClick={closeConfirmation}
                aria-label="Close dialog"
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm text-slate-700">
              {pendingConfirmation.kind === "single" ? (
                <>
                  <p>
                    You are about to revoke one active session for{" "}
                    <strong className="text-slate-900">
                      {pendingConfirmation.contingentName} (
                      {pendingConfirmation.contingentCode})
                    </strong>
                    .
                  </p>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-700">
                    Session ID: {pendingConfirmation.session.sessionId}
                  </div>
                  <p className="text-xs text-slate-600">
                    Only this specific device session will be terminated on its
                    next request, freeing 1 slot under the 4-device limit. Other
                    active devices for this team will stay logged in.
                  </p>
                </>
              ) : pendingConfirmation.kind === "team_all" ? (
                <>
                  <p>
                    You are about to force all{" "}
                    <strong className="text-slate-900">
                      {pendingConfirmation.activeSessionCount} active{" "}
                      {pendingConfirmation.activeSessionCount === 1
                        ? "device"
                        : "devices"}
                    </strong>{" "}
                    for{" "}
                    <strong className="text-slate-900">
                      {pendingConfirmation.contingentName} (
                      {pendingConfirmation.contingentCode})
                    </strong>{" "}
                    to log out simultaneously.
                  </p>
                  <p className="text-xs text-slate-600">
                    The team&apos;s account and password remain active; members
                    can sign in again immediately if authorized. Other teams are
                    not affected.
                  </p>
                </>
              ) : (
                <>
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                    <strong>Warning:</strong> This will immediately revoke all
                    active participant sessions across{" "}
                    <strong>every team in the competition</strong> (currently{" "}
                    {pendingConfirmation.totalActiveSessions} active{" "}
                    {pendingConfirmation.totalActiveSessions === 1
                      ? "session"
                      : "sessions"}{" "}
                    across {pendingConfirmation.loggedInTeams}{" "}
                    {pendingConfirmation.loggedInTeams === 1 ? "team" : "teams"}
                    ).
                  </div>
                  <p className="text-xs text-slate-600">
                    Team accounts, credentials, registrations, and competition
                    data are preserved. Every logged-in team will be redirected
                    to sign in again on its next request.
                  </p>
                  <div className="space-y-1.5 pt-1">
                    <label
                      htmlFor="global-logout-confirm-input"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Type{" "}
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-red-700">
                        {GLOBAL_LOGOUT_CONFIRMATION_PHRASE}
                      </code>{" "}
                      to proceed:
                    </label>
                    <input
                      ref={globalInputRef}
                      id="global-logout-confirm-input"
                      type="text"
                      value={globalConfirmInput}
                      onChange={(event) =>
                        setGlobalConfirmInput(event.target.value)
                      }
                      disabled={isMutating}
                      placeholder={GLOBAL_LOGOUT_CONFIRMATION_PHRASE}
                      autoComplete="off"
                      className="block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/20"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                ref={dialogCancelRef}
                type="button"
                disabled={isMutating}
                onClick={closeConfirmation}
                className="min-h-10 rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507] disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={
                  isMutating ||
                  (pendingConfirmation.kind === "global_all" &&
                    !globalPhraseMatches)
                }
                onClick={handleConfirmAction}
                className="min-h-10 rounded-md bg-red-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isMutating
                  ? "Applying..."
                  : pendingConfirmation.kind === "single"
                    ? "Confirm Revoke Session"
                    : pendingConfirmation.kind === "team_all"
                      ? "Confirm Log Out Team"
                      : "Confirm Log Out All Teams"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
