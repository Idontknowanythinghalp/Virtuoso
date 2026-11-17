"use client";

import React, { useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, Search } from "lucide-react";
import { createParticipantAction } from "@/app/actions/registry";
import type { CompetitionActionResult } from "@/app/actions/competition";
import type { ContingentRecord, ParticipantRecord } from "@/types/competition";

export interface ParticipantListItem extends ParticipantRecord {
  contingent: Pick<
    ContingentRecord,
    "id" | "contingent_code" | "name" | "institution_name"
  > | null;
}

interface ParticipantsManagerProps {
  participants: ParticipantListItem[];
  contingents: Pick<
    ContingentRecord,
    "id" | "contingent_code" | "name" | "institution_name" | "is_active"
  >[];
  migrationMissing?: boolean;
}

export function ParticipantsManager({
  participants,
  contingents,
  migrationMissing = false,
}: ParticipantsManagerProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [showCreateForm, setShowCreateForm] = useState(
    participants.length === 0,
  );
  const [selectedContingentId, setSelectedContingentId] = useState<string>("");
  const [isContingentLead, setIsContingentLead] = useState<boolean>(false);

  const [createState, createFormAction, createPending] = useActionState<
    CompetitionActionResult | null,
    FormData
  >(async (prev, formData) => {
    const result = await createParticipantAction(prev, formData);
    if (result.ok) {
      router.refresh();
    }
    return result;
  }, null);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredParticipants = participants.filter((p) => {
    if (scopeFilter === "contingent" && !p.contingent_id) return false;
    if (scopeFilter === "individual" && p.contingent_id) return false;
    if (scopeFilter === "active" && !p.is_active) return false;
    if (scopeFilter === "inactive" && p.is_active) return false;
    if (!normalizedQuery) return true;
    return (
      p.participant_code.toLowerCase().includes(normalizedQuery) ||
      p.full_name.toLowerCase().includes(normalizedQuery) ||
      p.institution_name.toLowerCase().includes(normalizedQuery) ||
      (p.contingent?.contingent_code ?? "")
        .toLowerCase()
        .includes(normalizedQuery) ||
      (p.external_registration_ref ?? "")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  });

  function handleContingentSelect(nextId: string) {
    setSelectedContingentId(nextId);
    if (!nextId) {
      setIsContingentLead(false);
    }
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
          in Supabase before registering participants.
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
              placeholder="Search code, name, or college"
              aria-label="Search participants"
              className="min-h-10 w-full rounded-md border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
            />
          </div>

          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value)}
            aria-label="Filter participants"
            className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
          >
            <option value="all">All participants</option>
            <option value="contingent">Contingent members</option>
            <option value="individual">Individual / No contingent</option>
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
            {showCreateForm ? "Hide Participant Form" : "Register Participant"}
          </span>
        </button>
      </div>

      {showCreateForm ? (
        <section
          aria-labelledby="create-participant-heading"
          className="rounded-lg border border-slate-200 bg-white p-6"
        >
          <div className="mb-5 space-y-1 border-b border-slate-100 pb-4">
            <h2
              id="create-participant-heading"
              className="font-display text-lg font-semibold text-slate-900"
            >
              Register Participant
            </h2>
            <p className="text-sm text-slate-600">
              Participants may belong to an existing contingent or remain
              independent individual competitors without a contingent.
            </p>
          </div>

          <form action={createFormAction} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="participant-code"
                  className="block text-xs font-medium text-slate-700"
                >
                  Participant Code
                </label>
                <input
                  id="participant-code"
                  name="participantCode"
                  type="text"
                  required
                  maxLength={40}
                  placeholder="e.g. PAR-01"
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm uppercase text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="participant-full-name"
                  className="block text-xs font-medium text-slate-700"
                >
                  Full Name
                </label>
                <input
                  id="participant-full-name"
                  name="fullName"
                  type="text"
                  required
                  maxLength={160}
                  placeholder="Participant full name"
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="participant-contingent"
                  className="block text-xs font-medium text-slate-700"
                >
                  Contingent (Optional)
                </label>
                <select
                  id="participant-contingent"
                  name="contingentId"
                  value={selectedContingentId}
                  onChange={(e) => handleContingentSelect(e.target.value)}
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                >
                  <option value="">
                    Individual / No Contingent
                  </option>
                  {contingents.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.contingent_code} — {c.name} ({c.institution_name})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="participant-institution"
                  className="block text-xs font-medium text-slate-700"
                >
                  College / Institution
                </label>
                <input
                  id="participant-institution"
                  name="institutionName"
                  type="text"
                  required
                  maxLength={200}
                  placeholder="Participant institution name"
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="participant-email"
                  className="block text-xs font-medium text-slate-700"
                >
                  Email (Optional)
                </label>
                <input
                  id="participant-email"
                  name="email"
                  type="email"
                  maxLength={254}
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="participant-phone"
                  className="block text-xs font-medium text-slate-700"
                >
                  Phone (Optional)
                </label>
                <input
                  id="participant-phone"
                  name="phone"
                  type="text"
                  maxLength={32}
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="participant-ext-ref"
                  className="block text-xs font-medium text-slate-700"
                >
                  External Registration Ref (Optional)
                </label>
                <input
                  id="participant-ext-ref"
                  name="externalRegistrationRef"
                  type="text"
                  maxLength={120}
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="participant-active"
                  className="block text-xs font-medium text-slate-700"
                >
                  Status
                </label>
                <select
                  id="participant-active"
                  name="isActive"
                  defaultValue="true"
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="participant-lead"
                name="isContingentLead"
                type="checkbox"
                checked={isContingentLead}
                disabled={!selectedContingentId}
                onChange={(e) => setIsContingentLead(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 accent-[#4B0507] disabled:opacity-50"
              />
              <label
                htmlFor="participant-lead"
                className={`text-sm ${
                  selectedContingentId ? "text-slate-800" : "text-slate-400"
                }`}
              >
                Mark as contingent lead (requires contingent selection)
              </label>
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
                {createPending ? "Registering..." : "Save Participant"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section aria-labelledby="participants-list-heading" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2
            id="participants-list-heading"
            className="font-display text-lg font-semibold text-slate-900"
          >
            Registered Participants
          </h2>
          <span className="font-mono text-xs tabular-nums text-slate-500">
            {filteredParticipants.length} of {participants.length} shown
          </span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-600">
                <th scope="col" className="px-4 py-3">
                  Code &amp; Participant
                </th>
                <th scope="col" className="px-4 py-3">
                  Affiliation
                </th>
                <th scope="col" className="px-4 py-3">
                  Institution
                </th>
                <th scope="col" className="px-4 py-3 font-mono">
                  External Ref
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
              {filteredParticipants.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-sm text-slate-500"
                  >
                    {participants.length === 0
                      ? "No participants have been registered yet."
                      : "No participants match your current filter."}
                  </td>
                </tr>
              ) : (
                filteredParticipants.map((p) => (
                  <tr key={p.id} className="align-top hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <Link
                        href={`/participants/${p.id}`}
                        className="group block space-y-0.5"
                      >
                        <span className="font-mono text-xs font-medium text-[#4B0507]">
                          {p.participant_code}
                        </span>
                        <span className="block font-medium text-slate-900 group-hover:text-[#4B0507] group-hover:underline">
                          {p.full_name}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      {p.contingent ? (
                        <Link
                          href={`/contingents/${p.contingent.id}`}
                          className="hover:text-[#4B0507] hover:underline"
                        >
                          <span className="font-mono text-[#4B0507]">
                            {p.contingent.contingent_code}
                          </span>{" "}
                          {p.contingent.name}
                          {p.is_contingent_lead ? " (Lead)" : ""}
                        </Link>
                      ) : (
                        <span className="text-slate-600">
                          Individual (No contingent)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      {p.institution_name}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {p.external_registration_ref ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium">
                      <span
                        className={
                          p.is_active ? "text-emerald-700" : "text-slate-500"
                        }
                      >
                        {p.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/participants/${p.id}`}
                        className="inline-flex min-h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap text-slate-800 hover:bg-slate-50"
                      >
                        <span>Manage</span>
                        <ArrowRight className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
