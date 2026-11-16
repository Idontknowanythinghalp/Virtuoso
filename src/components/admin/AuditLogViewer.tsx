import React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AuditLogEntry } from "@/types/auth";

interface AuditLogViewerProps {
  entries: AuditLogEntry[];
  totalCount: number;
  page: number;
  pageSize: number;
  selectedAction: string;
  selectedEntityType: string;
}

const ACTION_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "account.created", label: "Account Created" },
  { value: "account.activated", label: "Account Activated" },
  { value: "account.deactivated", label: "Account Deactivated" },
  { value: "account.role_changed", label: "Role Changed" },
  { value: "account.updated", label: "Account Updated" },
  { value: "auth.login_success", label: "Login Succeeded" },
  { value: "auth.login_failed", label: "Login Failed" },
  { value: "auth.login_blocked_inactive", label: "Blocked Inactive Login" },
  { value: "auth.logout", label: "Logout" },
  {
    value: "security.unauthorized_page_access",
    label: "Unauthorized Route Attempt",
  },
  {
    value: "security.unauthorized_admin_action",
    label: "Unauthorized Admin Action",
  },
] as const;

const ENTITY_TYPE_OPTIONS = [
  { value: "", label: "All entities" },
  { value: "profile", label: "Profile" },
  { value: "session", label: "Session" },
  { value: "route", label: "Route" },
  { value: "action", label: "Action" },
] as const;

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return date.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function buildPageHref(params: {
  action: string;
  entityType: string;
  page: number;
}): string {
  const sp = new URLSearchParams();
  if (params.action) sp.set("action", params.action);
  if (params.entityType) sp.set("entityType", params.entityType);
  if (params.page > 1) sp.set("page", String(params.page));
  const qs = sp.toString();
  return qs ? `/admin/audit-logs?${qs}` : "/admin/audit-logs";
}

export function AuditLogViewer({
  entries,
  totalCount,
  page,
  pageSize,
  selectedAction,
  selectedEntityType,
}: AuditLogViewerProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasPrevious = page > 1;
  const hasNext = page < totalPages;

  return (
    <div className="space-y-6">
      <form
        method="GET"
        action="/admin/audit-logs"
        className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-end"
      >
        <div className="flex-1 space-y-1.5">
          <label
            htmlFor="action-filter"
            className="block text-xs font-medium text-slate-700"
          >
            Action Type
          </label>
          <select
            id="action-filter"
            name="action"
            defaultValue={selectedAction}
            className="block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
          >
            {ACTION_OPTIONS.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 space-y-1.5">
          <label
            htmlFor="entity-filter"
            className="block text-xs font-medium text-slate-700"
          >
            Entity Type
          </label>
          <select
            id="entity-filter"
            name="entityType"
            defaultValue={selectedEntityType}
            className="block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
          >
            {ENTITY_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="min-h-10 rounded-md bg-[#4B0507] px-4 py-2 text-sm font-medium whitespace-nowrap text-white transition-colors hover:bg-[#380305] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
          >
            Apply Filters
          </button>
          {selectedAction || selectedEntityType ? (
            <Link
              href="/admin/audit-logs"
              className="inline-flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium whitespace-nowrap text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
            >
              Reset
            </Link>
          ) : null}
        </div>
      </form>

      <div className="flex items-center justify-between text-xs text-slate-600 font-mono tabular-nums">
        <span>
          {totalCount} {totalCount === 1 ? "record" : "records"}
        </span>
        <span>
          Page {page} of {totalPages}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-600">
              <th scope="col" className="px-4 py-3">
                Timestamp
              </th>
              <th scope="col" className="px-4 py-3">
                Actor
              </th>
              <th scope="col" className="px-4 py-3">
                Action
              </th>
              <th scope="col" className="px-4 py-3">
                Entity
              </th>
              <th scope="col" className="px-4 py-3">
                Change Data
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
                  No audit records found for the selected criteria.
                </td>
              </tr>
            ) : (
              entries.map((entry) => {
                const hasDetails =
                  entry.before_data !== null ||
                  entry.after_data !== null ||
                  Object.keys(entry.metadata ?? {}).length > 0;

                return (
                  <tr key={entry.id} className="align-top hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-mono text-xs tabular-nums whitespace-nowrap text-slate-600">
                      {formatTimestamp(entry.created_at)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      <div className="font-medium text-slate-900">
                        {entry.actor_email ?? "Unauthenticated / System"}
                      </div>
                      {entry.actor_user_id ? (
                        <div className="font-mono text-[11px] text-slate-500">
                          {entry.actor_user_id}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap text-slate-900">
                      {entry.action}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      <span className="font-medium">{entry.entity_type}</span>
                      {entry.entity_id ? (
                        <span className="block font-mono text-[11px] text-slate-500">
                          {entry.entity_id}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {hasDetails ? (
                        <details className="max-w-md">
                          <summary className="cursor-pointer font-medium text-[#4B0507] hover:underline focus-visible:outline-none">
                            Inspect payload
                          </summary>
                          <pre className="mt-2 overflow-x-auto rounded border border-slate-200 bg-slate-50 p-2 font-mono text-[11px] leading-relaxed text-slate-800">
                            {JSON.stringify(
                              {
                                before: entry.before_data,
                                after: entry.after_data,
                                metadata: entry.metadata,
                              },
                              null,
                              2,
                            )}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 pt-4">
        <p className="text-xs text-slate-500">
          Audit records are append-only and protected against modification or
          deletion.
        </p>

        <div className="flex items-center gap-2">
          {hasPrevious ? (
            <Link
              href={buildPageHref({
                action: selectedAction,
                entityType: selectedEntityType,
                page: page - 1,
              })}
              className="inline-flex min-h-9 items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium whitespace-nowrap text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Previous</span>
            </Link>
          ) : (
            <span className="inline-flex min-h-9 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium whitespace-nowrap text-slate-400">
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Previous</span>
            </span>
          )}

          {hasNext ? (
            <Link
              href={buildPageHref({
                action: selectedAction,
                entityType: selectedEntityType,
                page: page + 1,
              })}
              className="inline-flex min-h-9 items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium whitespace-nowrap text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
            >
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          ) : (
            <span className="inline-flex min-h-9 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium whitespace-nowrap text-slate-400">
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
