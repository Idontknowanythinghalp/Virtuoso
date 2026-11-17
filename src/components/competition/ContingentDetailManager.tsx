"use client";

import React, { useActionState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Plus } from "lucide-react";
import {
  createParticipantAction,
  updateContingentAction,
} from "@/app/actions/registry";
import type { CompetitionActionResult } from "@/app/actions/competition";
import {
  ENTRY_STATUS_LABELS,
  type ContingentRecord,
  type EventEntryRecord,
  type EventRecord,
  type ParticipantRecord,
} from "@/types/competition";

export interface ContingentEntryWithEvent extends EventEntryRecord {
  event: Pick<EventRecord, "id" | "code" | "name" | "status"> | null;
}

interface ContingentDetailManagerProps {
  contingent: ContingentRecord;
  members: ParticipantRecord[];
  entries: ContingentEntryWithEvent[];
}

export function ContingentDetailManager({
  contingent,
  members,
  entries,
}: ContingentDetailManagerProps) {
  const router = useRouter();

  const [editState, editFormAction, editPending] = useActionState<
    CompetitionActionResult | null,
    FormData
  >(async (prev, formData) => {
    const result = await updateContingentAction(prev, formData);
    if (result.ok) {
      router.refresh();
    }
    return result;
  }, null);

  const [addMemberState, addMemberFormAction, addMemberPending] =
    useActionState<CompetitionActionResult | null, FormData>(
      async (prev, formData) => {
        const result = await createParticipantAction(prev, formData);
        if (result.ok) {
          router.refresh();
        }
        return result;
      },
      null,
    );

  return (
    <div className="space-y-10">
      <div>
        <Link
          href="/contingents"
          className="inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-[#4B0507]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back to Contingents</span>
        </Link>
      </div>

      {/* Edit Contingent Form */}
      <section
        aria-labelledby="edit-contingent-heading"
        className="rounded-lg border border-slate-200 bg-white p-6"
      >
        <div className="mb-5 border-b border-slate-100 pb-4">
          <h2
            id="edit-contingent-heading"
            className="font-display text-lg font-semibold text-slate-900"
          >
            Contingent Details
          </h2>
          <p className="text-sm text-slate-600">
            Update college details, registration reference, and activation
            status.
          </p>
        </div>

        <form action={editFormAction} className="space-y-4">
          <input type="hidden" name="contingentId" value={contingent.id} />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="edit-contingent-code"
                className="block text-xs font-medium text-slate-700"
              >
                Contingent Code
              </label>
              <input
                id="edit-contingent-code"
                name="contingentCode"
                type="text"
                required
                maxLength={40}
                defaultValue={contingent.contingent_code}
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm uppercase text-slate-900"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="edit-contingent-name"
                className="block text-xs font-medium text-slate-700"
              >
                Contingent Name
              </label>
              <input
                id="edit-contingent-name"
                name="name"
                type="text"
                required
                maxLength={160}
                defaultValue={contingent.name}
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="edit-contingent-inst"
                className="block text-xs font-medium text-slate-700"
              >
                College / Institution
              </label>
              <input
                id="edit-contingent-inst"
                name="institutionName"
                type="text"
                required
                maxLength={200}
                defaultValue={contingent.institution_name}
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="edit-contingent-city"
                className="block text-xs font-medium text-slate-700"
              >
                City
              </label>
              <input
                id="edit-contingent-city"
                name="institutionCity"
                type="text"
                maxLength={120}
                defaultValue={contingent.institution_city ?? ""}
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="edit-contingent-ref"
                className="block text-xs font-medium text-slate-700"
              >
                External Registration Ref
              </label>
              <input
                id="edit-contingent-ref"
                name="externalRegistrationRef"
                type="text"
                maxLength={120}
                defaultValue={contingent.external_registration_ref ?? ""}
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="edit-contingent-email"
                  className="block text-xs font-medium text-slate-700"
                >
                  Contact Email
                </label>
                <input
                  id="edit-contingent-email"
                  name="contactEmail"
                  type="email"
                  maxLength={254}
                  defaultValue={contingent.contact_email ?? ""}
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="edit-contingent-phone"
                  className="block text-xs font-medium text-slate-700"
                >
                  Contact Phone
                </label>
                <input
                  id="edit-contingent-phone"
                  name="contactPhone"
                  type="text"
                  maxLength={32}
                  defaultValue={contingent.contact_phone ?? ""}
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <label
                htmlFor="edit-contingent-active"
                className="block text-xs font-medium text-slate-700"
              >
                Status
              </label>
              <select
                id="edit-contingent-active"
                name="isActive"
                defaultValue={contingent.is_active ? "true" : "false"}
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label
                htmlFor="edit-contingent-notes"
                className="block text-xs font-medium text-slate-700"
              >
                Notes
              </label>
              <input
                id="edit-contingent-notes"
                name="notes"
                type="text"
                maxLength={2000}
                defaultValue={contingent.notes ?? ""}
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </div>
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
              {editPending ? "Updating..." : "Update Contingent"}
            </button>
          </div>
        </form>
      </section>

      {/* Members Section (variable team sizes) */}
      <section aria-labelledby="contingent-members-heading" className="space-y-5">
        <div className="flex items-baseline justify-between">
          <div>
            <h2
              id="contingent-members-heading"
              className="font-display text-lg font-semibold text-slate-900"
            >
              Contingent Members
            </h2>
            <p className="text-sm text-slate-600">
              Any number of participants may belong to a contingent.
            </p>
          </div>
          <span className="font-mono text-xs tabular-nums text-slate-500">
            {members.length} {members.length === 1 ? "member" : "members"}
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
                  Role
                </th>
                <th scope="col" className="px-4 py-3">
                  Contact
                </th>
                <th scope="col" className="px-4 py-3">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Manage
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {members.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-slate-500"
                  >
                    No participants are linked to this contingent yet.
                  </td>
                </tr>
              ) : (
                members.map((member) => (
                  <tr key={member.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <Link
                        href={`/participants/${member.id}`}
                        className="group block space-y-0.5"
                      >
                        <span className="font-mono text-xs text-[#4B0507]">
                          {member.participant_code}
                        </span>
                        <span className="block font-medium text-slate-900 group-hover:text-[#4B0507] group-hover:underline">
                          {member.full_name}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      {member.is_contingent_lead ? "Contingent Lead" : "Member"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <span className="block">{member.email ?? "—"}</span>
                      {member.phone ? (
                        <span className="font-mono">{member.phone}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium">
                      <span
                        className={
                          member.is_active
                            ? "text-emerald-700"
                            : "text-slate-500"
                        }
                      >
                        {member.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/participants/${member.id}`}
                        className="inline-flex min-h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50"
                      >
                        <span>Edit</span>
                        <ArrowRight className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Add Member Directly to Contingent */}
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h3 className="mb-4 font-display text-base font-semibold text-slate-900">
            Add Member to {contingent.contingent_code}
          </h3>
          <form action={addMemberFormAction} className="space-y-4">
            <input type="hidden" name="contingentId" value={contingent.id} />
            <input type="hidden" name="isActive" value="true" />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="member-code"
                  className="block text-xs font-medium text-slate-700"
                >
                  Participant Code
                </label>
                <input
                  id="member-code"
                  name="participantCode"
                  type="text"
                  required
                  maxLength={40}
                  placeholder="e.g. PAR-01"
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm uppercase text-slate-900"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label
                  htmlFor="member-name"
                  className="block text-xs font-medium text-slate-700"
                >
                  Full Name
                </label>
                <input
                  id="member-name"
                  name="fullName"
                  type="text"
                  required
                  maxLength={160}
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="member-institution"
                  className="block text-xs font-medium text-slate-700"
                >
                  Institution
                </label>
                <input
                  id="member-institution"
                  name="institutionName"
                  type="text"
                  required
                  maxLength={200}
                  defaultValue={contingent.institution_name}
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="member-email"
                  className="block text-xs font-medium text-slate-700"
                >
                  Email (Optional)
                </label>
                <input
                  id="member-email"
                  name="email"
                  type="email"
                  maxLength={254}
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="member-phone"
                  className="block text-xs font-medium text-slate-700"
                >
                  Phone (Optional)
                </label>
                <input
                  id="member-phone"
                  name="phone"
                  type="text"
                  maxLength={32}
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="member-lead"
                name="isContingentLead"
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 accent-[#4B0507]"
              />
              <label htmlFor="member-lead" className="text-sm text-slate-800">
                Mark as contingent lead
              </label>
            </div>

            {addMemberState ? (
              <div
                role={addMemberState.ok ? "status" : "alert"}
                aria-live="polite"
                className={`rounded-md border px-3 py-2.5 text-sm ${
                  addMemberState.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-red-200 bg-red-50 text-red-900"
                }`}
              >
                {addMemberState.message}
              </div>
            ) : null}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={addMemberPending}
                className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#4B0507] px-4 py-2 text-sm font-medium whitespace-nowrap text-white hover:bg-[#380305] disabled:opacity-60"
              >
                <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{addMemberPending ? "Adding..." : "Add Member"}</span>
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Event Entries for this Contingent */}
      <section aria-labelledby="contingent-entries-heading" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2
            id="contingent-entries-heading"
            className="font-display text-lg font-semibold text-slate-900"
          >
            Event Entries
          </h2>
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
                    This contingent has not been entered into any events yet.
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
