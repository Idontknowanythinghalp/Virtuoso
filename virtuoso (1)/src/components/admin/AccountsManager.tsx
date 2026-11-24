"use client";

import React, { useActionState, useMemo, useState, useTransition } from "react";
import { Search, UserPlus } from "lucide-react";
import {
  createOrganiserAccountAction,
  updateOrganiserAccountAction,
  type AccountActionResult,
} from "@/app/actions/accounts";
import {
  formatOrganiserRole,
  type OrganiserProfile,
  type OrganiserRole,
} from "@/types/auth";

interface AccountsManagerProps {
  currentUserId: string;
  profiles: OrganiserProfile[];
  adminConfigured: boolean;
}

type StatusFilter = "all" | "active" | "inactive";

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return date.toISOString().slice(0, 10);
}

export function AccountsManager({
  currentUserId,
  profiles,
  adminConfigured,
}: AccountsManagerProps) {
  const [createState, createFormAction, isCreating] = useActionState(
    createOrganiserAccountAction,
    null,
  );
  const [rowFeedback, setRowFeedback] = useState<AccountActionResult | null>(
    null,
  );
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [isUpdating, startTransition] = useTransition();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const activeSuperAdminCount = useMemo(
    () =>
      profiles.filter((p) => p.role === "super_admin" && p.is_active).length,
    [profiles],
  );

  const filteredProfiles = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return profiles.filter((profile) => {
      if (statusFilter === "active" && !profile.is_active) return false;
      if (statusFilter === "inactive" && profile.is_active) return false;
      if (!normalized) return true;
      return (
        profile.full_name.toLowerCase().includes(normalized) ||
        profile.email.toLowerCase().includes(normalized)
      );
    });
  }, [profiles, query, statusFilter]);

  function handleAccountUpdate(
    target: OrganiserProfile,
    nextRole: OrganiserRole,
    nextIsActive: boolean,
  ) {
    setRowFeedback(null);
    setPendingUserId(target.id);

    const formData = new FormData();
    formData.set("targetUserId", target.id);
    formData.set("nextRole", nextRole);
    formData.set("nextIsActive", String(nextIsActive));

    startTransition(async () => {
      const result = await updateOrganiserAccountAction(formData);
      setRowFeedback(result);
      setPendingUserId(null);
    });
  }

  return (
    <div className="space-y-8">
      {!adminConfigured ? (
        <div
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900"
        >
          Server-side Supabase admin configuration is incomplete. You can inspect
          accounts read-only, but creating or modifying organiser accounts
          requires configuring the server admin key.
        </div>
      ) : null}

      <section
        aria-labelledby="provision-account-heading"
        className="rounded-lg border border-slate-200 bg-white p-6"
      >
        <div className="space-y-1 border-b border-slate-100 pb-4">
          <h2
            id="provision-account-heading"
            className="font-display text-lg font-semibold text-slate-900"
          >
            Provision Organiser Account
          </h2>
          <p className="text-sm text-slate-600">
            Create an Event Coordinator or Super Admin account. Coordinators
            receive universal access across all events and rounds in V1.
          </p>
        </div>

        <form action={createFormAction} className="mt-5 space-y-4">
          {createState ? (
            <div
              role={createState.ok ? "status" : "alert"}
              className={`rounded-md border px-4 py-3 text-sm ${
                createState.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-red-200 bg-red-50 text-red-800"
              }`}
            >
              {createState.message}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <label
                htmlFor="fullName"
                className="block text-xs font-medium text-slate-700"
              >
                Full Name
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                required
                minLength={2}
                maxLength={120}
                disabled={!adminConfigured || isCreating}
                placeholder="e.g. Priya Nair"
                className="block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20 disabled:bg-slate-100"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-xs font-medium text-slate-700"
              >
                Institutional Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                disabled={!adminConfigured || isCreating}
                placeholder="coordinator@sjcc.edu.in"
                className="block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20 disabled:bg-slate-100"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-xs font-medium text-slate-700"
              >
                Temporary Password (min 10 chars)
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={10}
                maxLength={128}
                disabled={!adminConfigured || isCreating}
                placeholder="At least 10 characters"
                className="block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20 disabled:bg-slate-100"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="role"
                className="block text-xs font-medium text-slate-700"
              >
                Role
              </label>
              <select
                id="role"
                name="role"
                defaultValue="event_coordinator"
                disabled={!adminConfigured || isCreating}
                className="block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20 disabled:bg-slate-100"
              >
                <option value="event_coordinator">Event Coordinator</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              Share temporary credentials securely outside the application.
              Passwords are never logged or stored in profile tables.
            </p>
            <button
              type="submit"
              disabled={!adminConfigured || isCreating}
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-[#4B0507] px-4 py-2 text-sm font-medium whitespace-nowrap text-white transition-colors hover:bg-[#380305] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <UserPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{isCreating ? "Provisioning..." : "Create Account"}</span>
            </button>
          </div>
        </form>
      </section>

      <section aria-labelledby="accounts-directory-heading" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2
              id="accounts-directory-heading"
              className="font-display text-lg font-semibold text-slate-900"
            >
              Organiser Directory
            </h2>
            <p className="text-sm text-slate-600 font-mono tabular-nums">
              {profiles.length} total · {activeSuperAdminCount} active Super{" "}
              {activeSuperAdminCount === 1 ? "Admin" : "Admins"}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by name or email..."
                aria-label="Filter organiser accounts"
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20 sm:w-64"
              />
            </div>

            <div
              role="group"
              aria-label="Filter by account status"
              className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 p-1"
            >
              {(["all", "active", "inactive"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`min-h-8 rounded px-3 py-1 text-xs font-medium whitespace-nowrap capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507] ${
                    statusFilter === status
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </div>

        {rowFeedback ? (
          <div
            role={rowFeedback.ok ? "status" : "alert"}
            className={`rounded-md border px-4 py-3 text-sm ${
              rowFeedback.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {rowFeedback.message}
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-600">
                <th scope="col" className="px-4 py-3">
                  Organiser
                </th>
                <th scope="col" className="px-4 py-3">
                  Role
                </th>
                <th scope="col" className="px-4 py-3">
                  Scope
                </th>
                <th scope="col" className="px-4 py-3">
                  Status
                </th>
                <th scope="col" className="px-4 py-3">
                  Created
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredProfiles.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-sm text-slate-500"
                  >
                    No organiser accounts match the current filter.
                  </td>
                </tr>
              ) : (
                filteredProfiles.map((profile) => {
                  const isSelf = profile.id === currentUserId;
                  const isLastActiveSuperAdmin =
                    profile.role === "super_admin" &&
                    profile.is_active &&
                    activeSuperAdminCount <= 1;
                  const rowBusy = isUpdating && pendingUserId === profile.id;
                  const toggledRole: OrganiserRole =
                    profile.role === "super_admin"
                      ? "event_coordinator"
                      : "super_admin";

                  return (
                    <tr key={profile.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">
                          {profile.full_name}
                          {isSelf ? (
                            <span className="ml-2 text-xs font-normal text-slate-500">
                              (You)
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-slate-500">
                          {profile.email}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-800">
                        {formatOrganiserRole(profile.role)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">
                        All Events (V1)
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`text-xs font-medium ${
                            profile.is_active
                              ? "text-[#16A34A]"
                              : "text-[#DC2626]"
                          }`}
                        >
                          {profile.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums whitespace-nowrap text-slate-500">
                        {formatDate(profile.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {isSelf ? (
                          <span className="text-xs text-slate-400">
                            Self-edits blocked
                          </span>
                        ) : (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              disabled={
                                !adminConfigured ||
                                rowBusy ||
                                (profile.role === "super_admin" &&
                                  isLastActiveSuperAdmin)
                              }
                              onClick={() =>
                                handleAccountUpdate(
                                  profile,
                                  toggledRole,
                                  profile.is_active,
                                )
                              }
                              title={
                                profile.role === "super_admin" &&
                                isLastActiveSuperAdmin
                                  ? "Cannot demote the last active Super Admin"
                                  : undefined
                              }
                              className="min-h-9 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium whitespace-nowrap text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {profile.role === "super_admin"
                                ? "Make Coordinator"
                                : "Make Super Admin"}
                            </button>

                            <button
                              type="button"
                              disabled={
                                !adminConfigured ||
                                rowBusy ||
                                (profile.is_active && isLastActiveSuperAdmin)
                              }
                              onClick={() =>
                                handleAccountUpdate(
                                  profile,
                                  profile.role,
                                  !profile.is_active,
                                )
                              }
                              title={
                                profile.is_active && isLastActiveSuperAdmin
                                  ? "Cannot deactivate the last active Super Admin"
                                  : undefined
                              }
                              className={`min-h-9 rounded-md border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507] disabled:cursor-not-allowed disabled:opacity-50 ${
                                profile.is_active
                                  ? "border-red-200 bg-white text-red-700 hover:bg-red-50"
                                  : "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                              }`}
                            >
                              {rowBusy
                                ? "Saving..."
                                : profile.is_active
                                  ? "Deactivate"
                                  : "Activate"}
                            </button>
                          </div>
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
    </div>
  );
}
