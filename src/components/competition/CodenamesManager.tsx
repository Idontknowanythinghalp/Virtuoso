"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Edit2,
  Hash,
  Key,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import {
  assignCodenameAction,
  generateCodenamesAction,
} from "@/app/actions/codenames";
import type { CodenameView } from "@/types/data-operations";
import type { EventRecord, RoundRecord } from "@/types/competition";
import type { EventEntryView } from "@/components/competition/EventDetailManager";

interface CodenamesManagerProps {
  event: EventRecord;
  round?: RoundRecord | null;
  entries: EventEntryView[];
  initialCodenames: CodenameView[];
}

export function CodenamesManager({
  event,
  round,
  entries,
  initialCodenames,
}: CodenamesManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [codenames, setCodenames] = useState<CodenameView[]>(initialCodenames);
  const [searchQuery, setSearchQuery] = useState("");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Edit / Manual Assign Modal state
  const [editingEntry, setEditingEntry] = useState<{
    entryId: string;
    entryName: string;
    currentCodename: string;
  } | null>(null);
  const [manualInput, setManualInput] = useState("");

  // Bulk Generator Modal / state
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [customPrefix, setCustomPrefix] = useState("");

  const isPerRound = event.codename_mode === "per_round";
  const targetRoundId = isPerRound ? round?.id ?? null : null;

  // Map entry ID to codename
  const codenameMap = new Map<string, CodenameView>();
  for (const cn of codenames) {
    if (isPerRound) {
      if (cn.round_id === targetRoundId) {
        codenameMap.set(cn.event_entry_id, cn);
      }
    } else {
      if (!cn.round_id) {
        codenameMap.set(cn.event_entry_id, cn);
      }
    }
  }

  const assignedCount = entries.filter((e) => codenameMap.has(e.id)).length;
  const unassignedCount = entries.length - assignedCount;

  // Filter entries by search query
  const filteredEntries = entries.filter((entry) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const assigned = codenameMap.get(entry.id)?.codename.toLowerCase() ?? "";
    const name = (
      entry.entry_type === "contingent"
        ? entry.contingent?.name
        : entry.participant?.full_name
    )?.toLowerCase() ?? "";
    const code = (
      entry.entry_type === "contingent"
        ? entry.contingent?.contingent_code
        : entry.participant?.participant_code
    )?.toLowerCase() ?? "";
    return assigned.includes(q) || name.includes(q) || code.includes(q);
  });

  const handleBulkGenerate = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await generateCodenamesAction({
        eventId: event.id,
        roundId: targetRoundId,
        customPrefix: customPrefix.trim() || undefined,
      });

      if (!res.ok) {
        setFeedback({ type: "error", message: res.message });
      } else {
        setFeedback({ type: "success", message: res.message });
        setShowGenerateModal(false);
        router.refresh();
      }
    });
  };

  const handleOpenEdit = (entry: EventEntryView) => {
    const current = codenameMap.get(entry.id)?.codename ?? "";
    const name =
      entry.entry_type === "contingent"
        ? entry.contingent?.name ?? "Contingent Entry"
        : entry.participant?.full_name ?? "Individual Entry";

    setEditingEntry({
      entryId: entry.id,
      entryName: name,
      currentCodename: current,
    });
    setManualInput(current);
    setFeedback(null);
  };

  const handleSaveManualCodename = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry) return;

    setFeedback(null);
    startTransition(async () => {
      const res = await assignCodenameAction({
        eventId: event.id,
        roundId: targetRoundId,
        eventEntryId: editingEntry.entryId,
        codename: manualInput.trim(),
      });

      if (!res.ok) {
        setFeedback({ type: "error", message: res.message });
      } else {
        setFeedback({ type: "success", message: res.message });
        setEditingEntry(null);
        router.refresh();
      }
    });
  };

  return (
    <section
      aria-labelledby="codenames-heading"
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-[#4B0507]" />
            <h2
              id="codenames-heading"
              className="font-display text-lg font-bold text-slate-900"
            >
              Anonymous Codenames
            </h2>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                isPerRound
                  ? "bg-purple-100 text-purple-800"
                  : "bg-blue-100 text-blue-800"
              }`}
            >
              {isPerRound ? "Per-Round Scope" : "Event-Wide Scope"}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {isPerRound
              ? `Codenames are scoped to round ${round?.round_number ?? ""}: "${round?.name ?? ""}". Each round receives unique randomized codenames.`
              : "Codenames are scoped across the entire event. Each entry retains a single codename throughout all rounds."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowGenerateModal(true)}
            className="flex items-center gap-1.5 rounded-md bg-[#4B0507] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#380405] transition-colors cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Generate Codenames</span>
          </button>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-md p-3 text-xs ${
            feedback.type === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Summary Counts Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-4">
          <span className="text-slate-600">
            Total Entries: <strong className="text-slate-900">{entries.length}</strong>
          </span>
          <span className="text-emerald-700">
            Assigned: <strong>{assignedCount}</strong>
          </span>
          <span className="text-amber-700">
            Unassigned: <strong>{unassignedCount}</strong>
          </span>
        </div>

        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search entry or codename..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-[#4B0507] focus:outline-none"
          />
        </div>
      </div>

      {/* Table of Entries and Codenames */}
      {entries.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-500">
          No entries registered for this event yet. Add event entries first to assign codenames.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-3">Entry Name / Code</th>
                <th className="p-3">Type</th>
                <th className="p-3">Status</th>
                <th className="p-3">Assigned Codename</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEntries.map((entry) => {
                const cn = codenameMap.get(entry.id);
                const displayName =
                  entry.entry_type === "contingent"
                    ? entry.contingent?.name ?? "Contingent Entry"
                    : entry.participant?.full_name ?? "Individual Entry";
                const displayCode =
                  entry.entry_type === "contingent"
                    ? entry.contingent?.contingent_code
                    : entry.participant?.participant_code;

                return (
                  <tr key={entry.id} className="hover:bg-slate-50/50">
                    <td className="p-3">
                      <div className="font-semibold text-slate-900">{displayName}</div>
                      <div className="font-mono text-[11px] text-slate-500">
                        {displayCode || "(No code)"}
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-700">
                        {entry.entry_type}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-slate-700">
                        {entry.status}
                      </span>
                    </td>
                    <td className="p-3">
                      {cn ? (
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-stone-100 border border-stone-200 px-2.5 py-1 font-mono text-xs font-bold text-[#4B0507]">
                          <Hash className="h-3.5 w-3.5" />
                          <span>{cn.codename}</span>
                        </span>
                      ) : (
                        <span className="rounded bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(entry)}
                        className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <Edit2 className="h-3 w-3" />
                        <span>{cn ? "Change" : "Assign"}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Manual Assign / Edit Modal */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                Assign / Replace Codename
              </h3>
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveManualCodename} className="space-y-3">
              <div>
                <span className="text-xs text-slate-500">Target Entry:</span>
                <p className="text-xs font-semibold text-slate-800">
                  {editingEntry.entryName}
                </p>
              </div>

              <div>
                <label
                  htmlFor="manual-codename-input"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Codename (2–60 characters)
                </label>
                <input
                  id="manual-codename-input"
                  type="text"
                  required
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="e.g. SOLSTICE-01"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs uppercase text-slate-900 focus:border-[#4B0507] focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Must be unique within the current {isPerRound ? "round" : "event"} scope.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingEntry(null)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || !manualInput.trim()}
                  className="rounded-md bg-[#4B0507] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#380405] disabled:opacity-50"
                >
                  {isPending ? "Saving..." : "Save Codename"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Generator Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#4B0507]" />
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Bulk Codename Generator
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGenerateModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <p>
                Generates unique, human-readable codenames for all <strong>{unassignedCount}</strong> unassigned entry(s).
              </p>
              <div className="rounded-md bg-stone-50 border border-stone-200 p-2.5 text-[11px] text-stone-800">
                <strong>Non-Destructive Guarantee:</strong> Existing assigned codenames (<strong>{assignedCount}</strong>) will be strictly preserved and never overwritten or reassigned.
              </div>

              <div>
                <label
                  htmlFor="custom-prefix-input"
                  className="block font-semibold text-slate-700"
                >
                  Custom Prefix (Optional)
                </label>
                <input
                  id="custom-prefix-input"
                  type="text"
                  placeholder="e.g. SOL or leave blank for Solstice celestial theme"
                  value={customPrefix}
                  onChange={(e) => setCustomPrefix(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs uppercase text-slate-900 focus:border-[#4B0507] focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  If blank, generates names from Virtuoso theme words: SOLSTICE, AURORA, HELIOS, APOLLO, etc.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowGenerateModal(false)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkGenerate}
                disabled={isPending || unassignedCount === 0}
                className="flex items-center gap-1.5 rounded-md bg-[#4B0507] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#380405] disabled:opacity-50 cursor-pointer"
              >
                {isPending ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Generate {unassignedCount} Codenames</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
