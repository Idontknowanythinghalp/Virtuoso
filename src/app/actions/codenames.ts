"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  OrganiserAuthError,
  requireActiveUserForAction,
} from "@/lib/auth/guards";
import { ALL_ORGANISER_ROLES } from "@/lib/auth/policy";
import { validateUuid } from "@/lib/competition/validation";
import {
  planMissingCodenameAssignments,
  validateCodenameScope,
  validateManualCodename,
} from "@/lib/codenames/validation";
import type { CompetitionActionResult } from "@/app/actions/competition";
import type {
  EntryCodenameRecord,
  EventEntryRecord,
  EventRecord,
  RoundRecord,
} from "@/types/competition";

function mapCodenameDbError(
  err: { code?: string; message?: string },
  fallback: string,
): string {
  if (err.code === "23505") {
    if (
      err.message?.includes("entry_codenames_event_wide_code") ||
      err.message?.includes("entry_codenames_per_round_code")
    ) {
      return "That codename is already assigned to another entry in this scope.";
    }
    if (
      err.message?.includes("entry_codenames_event_wide_entry") ||
      err.message?.includes("entry_codenames_per_round_entry")
    ) {
      return "This entry already has a codename assigned in this scope.";
    }
    return "A conflicting codename assignment already exists in this scope.";
  }

  if (err.code === "23514" && err.message?.includes("entry_codenames_code_format")) {
    return "Codename format is invalid. Use 4–40 letters, numbers, and single hyphens.";
  }

  if (err.code === "P0001" && err.message) {
    return err.message;
  }

  return fallback;
}

interface AssignBatchRpcResult {
  assigned_count: number;
  skipped_existing_count: number;
  assigned_items: Array<{
    id: string;
    event_entry_id: string;
    codename: string;
  }>;
}

interface UpsertCodenameRpcResult {
  operation: "assigned" | "corrected";
  id: string;
  before_codename: string | null;
  after_codename: string;
  before_source: string | null;
  after_source: string;
  before_notes: string | null;
  after_notes: string | null;
}

export async function assignMissingCodenamesAction(input: {
  eventId: string;
  roundId?: string | null;
}): Promise<CompetitionActionResult> {
  try {
    await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "codename.batch_assigned",
    });

    const eventCheck = validateUuid(input.eventId, "Event");
    if (!eventCheck.ok) return { ok: false, message: eventCheck.error };

    const requestedRoundId = input.roundId?.trim() || null;
    if (requestedRoundId) {
      const roundCheck = validateUuid(requestedRoundId, "Round");
      if (!roundCheck.ok) return { ok: false, message: roundCheck.error };
    }

    const supabase = await createSupabaseServerClient();

    const { data: eventRow, error: eventErr } = await supabase
      .from("events")
      .select("id, code, name, codename_mode, status")
      .eq("id", eventCheck.value)
      .maybeSingle<
        Pick<EventRecord, "id" | "code" | "name" | "codename_mode" | "status">
      >();

    if (eventErr || !eventRow) {
      return { ok: false, message: "Target event was not found." };
    }

    if (eventRow.codename_mode === "event_wide" && requestedRoundId !== null) {
      return {
        ok: false,
        message:
          "This event uses Event-Wide codenames; round-specific assignments are not allowed.",
      };
    }

    let roundRow: Pick<
      RoundRecord,
      "id" | "event_id" | "round_number" | "name" | "status"
    > | null = null;

    if (eventRow.codename_mode === "per_round") {
      if (!requestedRoundId) {
        return {
          ok: false,
          message:
            "This event uses Per-Round codenames; select a round before assigning codenames.",
        };
      }

      const { data: loadedRound, error: roundErr } = await supabase
        .from("rounds")
        .select("id, event_id, round_number, name, status")
        .eq("id", requestedRoundId)
        .eq("event_id", eventRow.id)
        .maybeSingle<
          Pick<RoundRecord, "id" | "event_id" | "round_number" | "name" | "status">
        >();

      if (roundErr || !loadedRound) {
        return {
          ok: false,
          message: "Selected round was not found for this event.",
        };
      }
      roundRow = loadedRound;
    }

    const scopeCheck = validateCodenameScope({
      eventId: eventRow.id,
      codenameMode: eventRow.codename_mode,
      eventStatus: eventRow.status,
      roundId: requestedRoundId,
      round: roundRow,
    });
    if (!scopeCheck.ok) {
      return { ok: false, message: scopeCheck.error };
    }

    const { data: entries, error: entriesErr } = await supabase
      .from("event_entries")
      .select("id, event_id, status")
      .eq("event_id", eventRow.id)
      .returns<Pick<EventEntryRecord, "id" | "event_id" | "status">[]>();

    if (entriesErr) {
      return {
        ok: false,
        message:
          "Unable to load event entries. Verify Stage 2A and Stage 2B.3 migrations are applied.",
      };
    }

    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      let existingQuery = supabase
        .from("entry_codenames")
        .select("event_id, event_entry_id, round_id, codename")
        .eq("event_id", eventRow.id);

      if (scopeCheck.value.roundId === null) {
        existingQuery = existingQuery.is("round_id", null);
      } else {
        existingQuery = existingQuery.eq("round_id", scopeCheck.value.roundId);
      }

      const { data: existingRows, error: existingErr } = await existingQuery.returns<
        Pick<
          EntryCodenameRecord,
          "event_id" | "event_entry_id" | "round_id" | "codename"
        >[]
      >();

      if (existingErr) {
        return {
          ok: false,
          message:
            "Unable to load existing codename assignments. Verify Stage 2B.3 database migration 0005 is applied.",
        };
      }

      const plan = planMissingCodenameAssignments({
        event: eventRow,
        round: roundRow,
        entries: entries ?? [],
        existingAssignments: existingRows ?? [],
      });

      if (!plan.ok) {
        return { ok: false, message: plan.error };
      }

      if (plan.assignmentsToInsert.length === 0) {
        if (plan.skippedAlreadyAssignedCount > 0) {
          return {
            ok: true,
            message:
              "All eligible entries in this scope already have codenames assigned. No existing codenames were modified.",
          };
        }
        return {
          ok: false,
          message:
            "No eligible unassigned entries (registered or checked in) were found for codename assignment.",
        };
      }

      const { data: rpcRaw, error: rpcErr } = await supabase.rpc(
        "assign_event_codenames",
        {
          p_event_id: eventRow.id,
          p_round_id: scopeCheck.value.roundId,
          p_assignments: plan.assignmentsToInsert,
        },
      );

      if (rpcErr) {
        if (rpcErr.code === "23505" && attempt < maxRetries) {
          continue;
        }
        return {
          ok: false,
          message: mapCodenameDbError(
            rpcErr,
            "Unable to assign codenames. Please retry.",
          ),
        };
      }

      const rpcResult = rpcRaw as AssignBatchRpcResult | null;
      const assignedCount = rpcResult?.assigned_count ?? 0;
      const skippedExisting = rpcResult?.skipped_existing_count ?? 0;

      revalidatePath(`/events/${eventRow.id}`);
      revalidatePath(`/events/${eventRow.id}/codenames`);

      const scopeLabel = roundRow
        ? `Round ${roundRow.round_number} (${roundRow.name})`
        : `${eventRow.code} (Event-Wide)`;

      return {
        ok: true,
        message:
          assignedCount > 0
            ? `Assigned ${assignedCount} new ${assignedCount === 1 ? "codename" : "codenames"} for ${scopeLabel}.${skippedExisting > 0 ? ` Preserved ${skippedExisting} existing assignment(s).` : ""}`
            : "All eligible entries in this scope already had codenames assigned.",
      };
    }

    return {
      ok: false,
      message:
        "Concurrent codename assignment caused repeated collisions. Please retry.",
    };
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    console.error(
      "[codenames] batch assign error:",
      err instanceof Error ? err.message : "unknown",
    );
    return {
      ok: false,
      message: "Unexpected error while assigning codenames.",
    };
  }
}

export async function assignManualCodenameAction(
  _prevState: CompetitionActionResult | null,
  formData: FormData,
): Promise<CompetitionActionResult> {
  return handleManualCodenameMutation(formData, false);
}

export async function correctEntryCodenameAction(
  _prevState: CompetitionActionResult | null,
  formData: FormData,
): Promise<CompetitionActionResult> {
  return handleManualCodenameMutation(formData, true);
}

async function handleManualCodenameMutation(
  formData: FormData,
  isCorrection: boolean,
): Promise<CompetitionActionResult> {
  const actionName = isCorrection
    ? "codename.corrected"
    : "codename.manual_assigned";

  try {
    await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName,
    });

    if (isCorrection) {
      const confirmed =
        formData.get("confirmOverwrite") === "true" ||
        formData.get("confirmOverwrite") === "on";
      if (!confirmed) {
        return {
          ok: false,
          message:
            "Explicit confirmation is required before overwriting an existing codename.",
        };
      }
    }

    const eventCheck = validateUuid(
      String(formData.get("eventId") ?? ""),
      "Event",
    );
    if (!eventCheck.ok) return { ok: false, message: eventCheck.error };

    const entryCheck = validateUuid(
      String(formData.get("eventEntryId") ?? ""),
      "Event Entry",
    );
    if (!entryCheck.ok) return { ok: false, message: entryCheck.error };

    const requestedRoundId = String(formData.get("roundId") ?? "").trim() || null;
    if (requestedRoundId) {
      const roundCheck = validateUuid(requestedRoundId, "Round");
      if (!roundCheck.ok) return { ok: false, message: roundCheck.error };
    }

    const codenameCheck = validateManualCodename(
      String(formData.get("codename") ?? ""),
    );
    if (!codenameCheck.ok) return { ok: false, message: codenameCheck.error };

    const notesRaw = String(formData.get("notes") ?? "").trim();
    const notes = notesRaw ? notesRaw.slice(0, 500) : null;

    const supabase = await createSupabaseServerClient();

    const { data: eventRow, error: eventErr } = await supabase
      .from("events")
      .select("id, code, codename_mode, status")
      .eq("id", eventCheck.value)
      .maybeSingle<
        Pick<EventRecord, "id" | "code" | "codename_mode" | "status">
      >();

    if (eventErr || !eventRow) {
      return { ok: false, message: "Target event was not found." };
    }

    if (eventRow.codename_mode === "event_wide" && requestedRoundId !== null) {
      return {
        ok: false,
        message:
          "This event uses Event-Wide codenames; round-specific assignments are not allowed.",
      };
    }

    let roundRow: Pick<
      RoundRecord,
      "id" | "event_id" | "round_number" | "status"
    > | null = null;

    if (eventRow.codename_mode === "per_round") {
      if (!requestedRoundId) {
        return {
          ok: false,
          message:
            "This event uses Per-Round codenames; select a round before assigning or correcting codenames.",
        };
      }

      const { data: loadedRound, error: roundErr } = await supabase
        .from("rounds")
        .select("id, event_id, round_number, status")
        .eq("id", requestedRoundId)
        .eq("event_id", eventRow.id)
        .maybeSingle<
          Pick<RoundRecord, "id" | "event_id" | "round_number" | "status">
        >();

      if (roundErr || !loadedRound) {
        return {
          ok: false,
          message: "Selected round was not found for this event.",
        };
      }
      roundRow = loadedRound;
    }

    const scopeCheck = validateCodenameScope({
      eventId: eventRow.id,
      codenameMode: eventRow.codename_mode,
      eventStatus: eventRow.status,
      roundId: requestedRoundId,
      round: roundRow,
    });
    if (!scopeCheck.ok) return { ok: false, message: scopeCheck.error };

    let existingQuery = supabase
      .from("entry_codenames")
      .select("id, codename, notes")
      .eq("event_id", eventRow.id)
      .eq("event_entry_id", entryCheck.value);

    if (scopeCheck.value.roundId === null) {
      existingQuery = existingQuery.is("round_id", null);
    } else {
      existingQuery = existingQuery.eq("round_id", scopeCheck.value.roundId);
    }

    const { data: existingAssignment } = await existingQuery.maybeSingle<{
      id: string;
      codename: string;
      notes: string | null;
    }>();

    if (isCorrection && !existingAssignment) {
      return {
        ok: false,
        message:
          "No existing codename assignment was found for this entry in the selected scope.",
      };
    }

    if (
      isCorrection &&
      existingAssignment &&
      existingAssignment.codename === codenameCheck.value &&
      (existingAssignment.notes ?? null) === notes
    ) {
      return {
        ok: false,
        message: "The codename and note are already set to those values.",
      };
    }

    const { data: rpcRaw, error: rpcErr } = await supabase.rpc(
      "upsert_entry_codename",
      {
        p_event_id: eventRow.id,
        p_round_id: scopeCheck.value.roundId,
        p_event_entry_id: entryCheck.value,
        p_codename: codenameCheck.value,
        p_allow_overwrite: isCorrection,
        p_notes: notes,
      },
    );

    if (rpcErr || !rpcRaw) {
      return {
        ok: false,
        message: mapCodenameDbError(
          rpcErr ?? {},
          "Unable to save codename assignment.",
        ),
      };
    }

    const rpcResult = rpcRaw as UpsertCodenameRpcResult;

    revalidatePath(`/events/${eventRow.id}`);
    revalidatePath(`/events/${eventRow.id}/codenames`);

    const successMessage =
      rpcResult.operation === "corrected"
        ? `Updated codename from ${rpcResult.before_codename} to ${rpcResult.after_codename}.`
        : `Assigned codename ${rpcResult.after_codename}.`;

    return { ok: true, message: successMessage };
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    console.error(
      "[codenames] manual mutation error:",
      err instanceof Error ? err.message : "unknown",
    );
    return {
      ok: false,
      message: "Unexpected error while saving codename assignment.",
    };
  }
}
