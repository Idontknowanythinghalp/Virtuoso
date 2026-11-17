"use client";

import React, { useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { updateParticipantAction } from "@/app/actions/registry";
import type { CompetitionActionResult } from "@/app/actions/competition";
import {
  ENTRY_STATUS_LABELS,
  type ContingentRecord,
  type EventEntryRecord,
  type EventRecord,
  type ParticipantRecord,
} from "@/types/competition";

export interface ParticipantEntryWithEvent extends EventEntryRecord {
  event: Pick<EventRecord, "id" | "code" | "name" | "status"> | null;
}

interface ParticipantDetailManagerProps {
  participant: ParticipantRecord;
  contingents: Pick<
    ContingentRecord,
    "id" | "contingent_code" | "name" | "institution_name" | "is_active"
  >[];
  entries: ParticipantEntryWithEvent[];
}

export function ParticipantDetailManager({
  participant,
  contingents,
  entries,
}: ParticipantDetailManagerProps) {
  const router = useRouter();
  const [selectedContingentId, setSelectedContingentId] = useState<string>(
    participant.contingent_id ?? "",
  );
  const [isContingentLead, setIsContingentLead] = useState<boolean>(
    participant.is_contingent_lead,
  );

  const [editState, editFormAction, editPending] = useActionState<
    CompetitionActionResult | null,
    FormData
  >(async (prev, formData) => {
    const result = await updateParticipantAction(prev, formData);
    if (result.ok) {
      router.refresh();
    }
    return result;
  }, null);

  function handleContingentSelect(nextId: string) {
    setSelectedContingentId(nextId);
    if (!nextId) {
      setIsContingentLead(false);
    }
  }

  return (
    <div className="space-y-10">
      <div>
        <Link
          href="/participants"
          className="inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-[#4B0507]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back to Participants</span>
        </Link>
      </div>

      {/* Edit Participant Form */}
      <section
        aria-labelledby="edit-participant-heading"
        className="rounded-lg border border-slate-200 bg-white p-6"
      >
        <div className="mb-5 border-b border-slate-100 pb-4">
          <h2
            id="edit-participant-heading"
            className="font-display text-lg font-semibold text-slate-900"
          >
            Participant Profile
          </h2>
          <p className="text-sm text-slate-600">
            Update participant identity, optional contingent assignment, or
            activation status.
          </p>
        </div>

        <form action={editFormAction} className="space-y-4">
          <input type="hidden" name="participantId" value={participant.id} />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="edit-participant-code"
                className="block text-xs font-medium text-slate-700"
              >
                Participant Code
              </label>
              <input
                id="edit-participant-code"
                name="participantCode"
                type="text"
                required
                maxLength={40}
                defaultValue={participant.participant_code}
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm uppercase text-slate-900"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="edit-participant-name"
                className="block text-xs font-medium text-slate-700"
              >
                Full Name
              </label>
              <input
                id="edit-participant-name"
                name="fullName"
                type="text"
                required
                maxLength={160}
                defaultValue={participant.full_name}
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="edit-participant-contingent"
                className="block text-xs font-medium text-slate-700"
              >
                Contingent (Optional)
              </label>
              <select
                id="edit-participant-contingent"
                name="contingentId"
                value={selectedContingentId}
                onChange={(e) => handleContingentSelect(e.target.value)}
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="">Individual / No Contingent</option>
                {contingents.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.contingent_code} — {c.name} ({c.institution_name})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="edit-participant-institution"
                className="block text-xs font-medium text-slate-700"
              >
                College / Institution
              </label>
              <input
                id="edit-participant-institution"
                name="institutionName"
                type="text"
                required
                maxLength={200}
                defaultValue={participant.institution_name}
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="edit-participant-email"
                className="block text-xs font-medium text-slate-700"
              >
                Email
              </label>
              <input
                id="edit-participant-email"
                name="email"
                type="email"
                maxLength={254}
                defaultValue={participant.email ?? ""}
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="edit-participant-phone"
                className="block text-xs font-medium text-slate-700"
              >
                Phone
              </label>
              <input
                id="edit-participant-phone"
                name="phone"
                type="text"
                maxLength={32}
                defaultValue={participant.phone ?? ""}
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="edit-participant-ref"
                className="block text-xs font-medium text-slate-700"
              >
                External Registration Ref
              </label>
              <input
                id="edit-participant-ref"
                name="externalRegistrationRef"
                type="text"
                maxLength={120}
                defaultValue={participant.external_registration_ref ?? ""}
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="edit-participant-active"
                className="block text-xs font-medium text-slate-700"
              >
                Status
              </label>
              <select
                id="edit-participant-active"
                name="isActive"
                defaultValue={participant.is_active ? "true" : "false"}
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="edit-participant-lead"
              name="isContingentLead"
              type="checkbox"
              checked={isContingentLead}
              disabled={!selectedContingentId}
              onChange={(e) => setIsContingentLead(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-[#4B0507] disabled:opacity-50"
            />
            <label
              htmlFor="edit-participant-lead"
              className={`text-sm ${
                selectedContingentId ? "text-slate-800" : "text-slate-400"
              }`}
            >
              Mark as contingent lead (requires contingent selection)
            </label>
          </div>

          {editState ? (
            <div
              role={editState.ok ? "status" : "alert"}
              aria-live="polite"
              className={`rounded-md border px-3 py-2.5 text-sm ${
                editState.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-red-200 bg-red-50 text-red-900"
              }`}
            >
              {editState.message}
            </div>
          ) : null}

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <button
              type="submit"
              disabled={editPending}
              className="min-h-10 rounded-md bg-[#4B0507] px-5 py-2 text-sm font-medium whitespace-nowrap text-white hover:bg-[#380305] disabled:opacity-60"
            >
              {editPending ? "Updating..." : "Update Participant"}
            </button>
          </div>
        </form>
      </section>

      {/* Individual Event Entries */}
      <section aria-labelledby="participant-entries-heading" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <div>
            <h2
              id="participant-entries-heading"
              className="font-display text-lg font-semibold text-slate-900"
            >
              Individual Event Entries
            </h2>
            <p className="text-sm text-slate-600">
              Events where this participant is registered as an individual entry.
            </p>
          </div>
          <span className="font-mono text-xs tabular-nums text-slate-500">
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-600">
                <th scope="col" className="px-4 py-3">
                  Event
                </th>
                <th scope="col" className="px-4 py-3">
                  Entry Status
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Open Event
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {entries.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-8 text-center text-sm text-slate-500"
                  >
                    This participant has no direct individual event entries.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      {entry.event ? (
                        <Link
                          href={`/events/${entry.event.id}`}
                          className="font-medium text-slate-900 hover:text-[#4B0507] hover:underline"
                        >
                          <span className="font-mono text-xs text-[#4B0507]">
                            {entry.event.code}
                          </span>{" "}
                          {entry.event.name}
                        </Link>
                      ) : (
                        <span className="text-slate-500">Unknown event</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      {ENTRY_STATUS_LABELS[entry.status]}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {entry.event ? (
                        <Link
                          href={`/events/${entry.event.id}`}
                          className="inline-flex min-h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50"
                        >
                          <span>View Event</span>
                          <ArrowRight className="h-3 w-3" aria-hidden="true" />
                        </Link>
                      ) : null}
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
