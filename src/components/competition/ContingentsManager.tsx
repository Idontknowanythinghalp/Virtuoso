"use client";

import React, { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, Search } from "lucide-react";
import {
  createContingentAction,
  toggleContingentActiveAction,
} from "@/app/actions/registry";
import type { CompetitionActionResult } from "@/app/actions/competition";
import type { ContingentRecord } from "@/types/competition";

export interface ContingentSummaryItem extends ContingentRecord {
  memberCount: number;
  entryCount: number;
}

interface ContingentsManagerProps {
  contingents: ContingentSummaryItem[];
  migrationMissing?: boolean;
}

export function ContingentsManager({
  contingents,
  migrationMissing = false,
}: ContingentsManagerProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [showCreateForm, setShowCreateForm] = useState(contingents.length === 0);
  const [statusFeedback, setStatusFeedback] =
    useState<CompetitionActionResult | null>(null);
  const [confirmToggleId, setConfirmToggleId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [createState, createFormAction, createPending] = useActionState<
    CompetitionActionResult | null,
    FormData
  >(async (prev, formData) => {
    const result = await createContingentAction(prev, formData);
    if (result.ok) {
      router.refresh();
    }
    return result;
  }, null);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredContingents = contingents.filter((c) => {
    if (activeFilter === "active" && !c.is_active) return false;
    if (activeFilter === "inactive" && c.is_active) return false;
    if (!normalizedQuery) return true;
    return (
      c.contingent_code.toLowerCase().includes(normalizedQuery) ||
      c.name.toLowerCase().includes(normalizedQuery) ||
      c.institution_name.toLowerCase().includes(normalizedQuery) ||
      (c.external_registration_ref ?? "").toLowerCase().includes(normalizedQuery)
    );
  });

  function handleToggleActive(contingentId: string, nextActive: boolean) {
    setStatusFeedback(null);
    startTransition(async () => {
      const result = await toggleContingentActiveAction(
        contingentId,
        nextActive,
      );
      setStatusFeedback(result);
      setConfirmToggleId(null);
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
          Stage 2A registry tables are not available yet. Apply migration{" "}
          <code className="font-mono text-xs">
            supabase/migrations/202611160003_stage2a_competition_structure.sql
          </code>{" "}
          in Supabase before adding contingents.
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
              placeholder="Search code, team, or college"
              aria-label="Search contingents"
              className="min-h-10 w-full rounded-md border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
            />
          </div>

          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
            aria-label="Filter contingents by status"
            className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
          >
            <option value="all">All contingents</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateForm((prev) => !prev)}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-[#4B0507] px-4 py-2 text-sm font-medium whitespace-nowrap text-white hover:bg-[#380305] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {showCreateForm ? "Hide Contingent Form" : "Register Contingent"}
          </span>
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
          aria-labelledby="create-contingent-heading"
          className="rounded-lg border border-slate-200 bg-white p-6"
        >
          <div className="mb-5 space-y-1 border-b border-slate-100 pb-4">
            <h2
              id="create-contingent-heading"
              className="font-display text-lg font-semibold text-slate-900"
            >
              Register Contingent (Team)
            </h2>
            <p className="text-sm text-slate-600">
              Contingents support any variable team size. Link participants to a
              contingent after creation or on the contingent detail page.
            </p>
          </div>

          <form action={createFormAction} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="contingent-code"
                  className="block text-xs font-medium text-slate-700"
                >
                  Contingent Code
                </label>
                <input
                  id="contingent-code"
                  name="contingentCode"
                  type="text"
                  required
                  maxLength={40}
                  placeholder="e.g. CON-01"
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm uppercase text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="contingent-name"
                  className="block text-xs font-medium text-slate-700"
                >
                  Contingent / Team Name
                </label>
                <input
                  id="contingent-name"
                  name="name"
                  type="text"
                  required
                  maxLength={160}
                  placeholder="Enter contingent name"
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="contingent-institution"
                  className="block text-xs font-medium text-slate-700"
                >
                  College / Institution
                </label>
                <input
                  id="contingent-institution"
                  name="institutionName"
                  type="text"
                  required
                  maxLength={200}
                  placeholder="Full institution name"
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="contingent-city"
                  className="block text-xs font-medium text-slate-700"
                >
                  City (Optional)
                </label>
                <input
                  id="contingent-city"
                  name="institutionCity"
                  type="text"
                  maxLength={120}
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="contingent-ext-ref"
                  className="block text-xs font-medium text-slate-700"
                >
                  External Registration Reference (Optional)
                </label>
                <input
                  id="contingent-ext-ref"
                  name="externalRegistrationRef"
                  type="text"
                  maxLength={120}
                  placeholder="College registration ID"
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="contingent-email"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Contact Email (Optional)
                  </label>
                  <input
                    id="contingent-email"
                    name="contactEmail"
                    type="email"
                    maxLength={254}
                    className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="contingent-phone"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Contact Phone (Optional)
                  </label>
                  <input
                    id="contingent-phone"
                    name="contactPhone"
                    type="text"
                    maxLength={32}
                    className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="contingent-active"
                  className="block text-xs font-medium text-slate-700"
                >
                  Status
                </label>
                <select
                  id="contingent-active"
                  name="isActive"
                  defaultValue="true"
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label
                  htmlFor="contingent-notes"
                  className="block text-xs font-medium text-slate-700"
                >
                  Notes (Optional)
                </label>
                <input
                  id="contingent-notes"
                  name="notes"
                  type="text"
                  maxLength={2000}
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                />
              </div>
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

            <div className="flex justify-end border-t border-slate-100 pt-4">
              <button
                type="submit"
                disabled={createPending || migrationMissing}
                className="min-h-10 rounded-md bg-[#4B0507] px-5 py-2 text-sm font-medium whitespace-nowrap text-white hover:bg-[#380305] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
              >
                {createPending ? "Saving..." : "Save Contingent"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section aria-labelledby="contingents-list-heading" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2
            id="contingents-list-heading"
            className="font-display text-lg font-semibold text-slate-900"
          >
            Registered Contingents
          </h2>
          <span className="font-mono text-xs tabular-nums text-slate-500">
            {filteredContingents.length} of {contingents.length} shown
          </span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-600">
                <th scope="col" className="px-4 py-3">
                  Code &amp; Contingent
                </th>
                <th scope="col" className="px-4 py-3">
                  College / Institution
                </th>
                <th scope="col" className="px-4 py-3 font-mono">
                  External Ref
                </th>
                <th scope="col" className="px-4 py-3 font-mono">
                  Members
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
              {filteredContingents.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-sm text-slate-500"
                  >
                    {contingents.length === 0
                      ? "No contingents have been registered yet."
                      : "No contingents match your current filter."}
                  </td>
                </tr>
              ) : (
                filteredContingents.map((contingent) => {
                  const confirming = confirmToggleId === contingent.id;
                  return (
                    <tr
                      key={contingent.id}
                      className="align-top hover:bg-slate-50/60"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/contingents/${contingent.id}`}
                          className="group block space-y-0.5"
                        >
                          <span className="font-mono text-xs font-medium text-[#4B0507]">
                            {contingent.contingent_code}
                          </span>
                          <span className="block font-medium text-slate-900 group-hover:text-[#4B0507] group-hover:underline">
                            {contingent.name}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">
                        <span className="block font-medium text-slate-800">
                          {contingent.institution_name}
                        </span>
                        {contingent.institution_city ? (
                          <span className="text-slate-500">
                            {contingent.institution_city}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        {contingent.external_registration_ref ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-700">
                        {contingent.memberCount}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-700">
                        {contingent.entryCount}
                      </td>
                      <td className="px-4 py-3 text-xs font-medium">
                        <span
                          className={
                            contingent.is_active
                              ? "text-emerald-700"
                              : "text-slate-500"
                          }
                        >
                          {contingent.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {confirming ? (
                            <>
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() =>
                                  handleToggleActive(
                                    contingent.id,
                                    !contingent.is_active,
                                  )
                                }
                                className="min-h-8 rounded border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-amber-900 hover:bg-amber-100"
                              >
                                Confirm{" "}
                                {contingent.is_active
                                  ? "Deactivate"
                                  : "Activate"}
                              </button>
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => setConfirmToggleId(null)}
                                className="min-h-8 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap text-slate-700 hover:bg-slate-50"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() =>
                                  setConfirmToggleId(contingent.id)
                                }
                                className="min-h-8 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap text-slate-700 hover:bg-slate-50"
                              >
                                {contingent.is_active
                                  ? "Deactivate"
                                  : "Activate"}
                              </button>
                              <Link
                                href={`/contingents/${contingent.id}`}
                                className="inline-flex min-h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap text-slate-800 hover:bg-slate-50"
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
