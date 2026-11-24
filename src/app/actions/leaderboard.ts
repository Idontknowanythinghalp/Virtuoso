"use server";

import { revalidatePath } from "next/cache";
import type { CompetitionActionResult } from "@/app/actions/competition";
import {
  OrganiserAuthError,
  requireActiveUserForAction,
} from "@/lib/auth/guards";
import { ALL_ORGANISER_ROLES } from "@/lib/auth/policy";
import { validateUuid } from "@/lib/competition/validation";
import {
  validateLeaderboardCreateInput,
  validateLeaderboardUpdateInput,
} from "@/lib/leaderboard/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  ContingentRecord,
  EventEntryRecord,
  EventRecord,
  LeaderboardEntryRecord,
} from "@/types/competition";

function mapLeaderboardDbError(
  err: { code?: string; message?: string },
  fallback: string,
): string {
  if (err.code === "23505") {
    if (err.message?.includes("leaderboard_entries_event_contingent_unique")) {
      return "This contingent already has an entry on this event's leaderboard.";
    }
    return "A conflicting leaderboard entry already exists for this event.";
  }

  if (err.code === "23514") {
    if (err.message?.includes("leaderboard_entries_position_check")) {
      return "Position must be a whole number between 1 and 10,000.";
    }
    if (err.message?.includes("leaderboard_entries_display_value_check")) {
      return "Displayed score or result value must be between 1 and 120 characters.";
    }
    if (err.message?.includes("leaderboard_entries_notes_check")) {
      return "Notes cannot exceed 500 characters.";
    }
  }

  if (err.code === "23503") {
    return "Selected contingent is not validly registered in this event.";
  }

  if (err.code === "42P01" || err.code === "42883") {
    return "Stage 3A database migration 0008 must be applied before modifying the leaderboard.";
  }

  if (err.code === "P0001" && err.message) {
    return err.message;
  }

  return fallback;
}

export async function addLeaderboardEntryAction(
  _prevState: CompetitionActionResult | null,
  formData: FormData,
): Promise<CompetitionActionResult> {
  try {
    await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "leaderboard.entry_added",
    });

    const parsed = validateLeaderboardCreateInput({
      eventId: String(formData.get("eventId") ?? ""),
      contingentId: String(formData.get("contingentId") ?? ""),
      position: String(formData.get("position") ?? ""),
      displayValue: String(formData.get("displayValue") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    });

    if (!parsed.ok) {
      return { ok: false, message: parsed.error };
    }

    const supabase = await createSupabaseServerClient();

    const [eventRes, contingentRes, entryRes] = await Promise.all([
      supabase
        .from("events")
        .select("id, status, entry_mode")
        .eq("id", parsed.value.eventId)
        .maybeSingle<Pick<EventRecord, "id" | "status" | "entry_mode">>(),
      supabase
        .from("contingents")
        .select("id, contingent_code, name, is_active")
        .eq("id", parsed.value.contingentId)
        .maybeSingle<
          Pick<ContingentRecord, "id" | "contingent_code" | "name" | "is_active">
        >(),
      supabase
        .from("event_entries")
        .select("id, status")
        .eq("event_id", parsed.value.eventId)
        .eq("entry_type", "contingent")
        .eq("contingent_id", parsed.value.contingentId)
        .maybeSingle<Pick<EventEntryRecord, "id" | "status">>(),
    ]);

    if (eventRes.error || !eventRes.data) {
      return { ok: false, message: "Target event was not found." };
    }

    if (eventRes.data.status === "archived") {
      return {
        ok: false,
        message: "Cannot add leaderboard entries to an archived event.",
      };
    }

    if (
      eventRes.data.entry_mode !== "contingent" &&
      eventRes.data.entry_mode !== "hybrid"
    ) {
      return {
        ok: false,
        message:
          "Overall leaderboard requires contingent entries; this event is configured for individual entries only.",
      };
    }

    if (contingentRes.error || !contingentRes.data) {
      return { ok: false, message: "Selected contingent was not found." };
    }

    if (!contingentRes.data.is_active) {
      return {
        ok: false,
        message: "Inactive contingents cannot be added to the leaderboard.",
      };
    }

    if (entryRes.error || !entryRes.data) {
      return {
        ok: false,
        message: "Selected contingent is not registered in this event.",
      };
    }

    if (
      entryRes.data.status !== "registered" &&
      entryRes.data.status !== "checked_in"
    ) {
      return {
        ok: false,
        message:
          "Only registered or checked-in contingents can be added to the leaderboard.",
      };
    }

    const { data: rpcRaw, error: rpcErr } = await supabase.rpc(
      "add_leaderboard_entry",
      {
        p_event_id: parsed.value.eventId,
        p_contingent_id: parsed.value.contingentId,
        p_position: parsed.value.position,
        p_display_value: parsed.value.displayValue,
        p_notes: parsed.value.notes,
      },
    );

    if (rpcErr || !rpcRaw) {
      return {
        ok: false,
        message: mapLeaderboardDbError(
          rpcErr ?? {},
          "Unable to add contingent to the leaderboard.",
        ),
      };
    }

    const rpcResult = rpcRaw as { id?: string };

    revalidatePath(`/events/${parsed.value.eventId}`);
    revalidatePath(`/events/${parsed.value.eventId}/leaderboard`);

    return {
      ok: true,
      createdId: rpcResult.id,
      message: `Added ${contingentRes.data.contingent_code} (${contingentRes.data.name}) at position #${parsed.value.position}.`,
    };
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    console.error(
      "[leaderboard] add error:",
      err instanceof Error ? err.message : "unknown",
    );
    return {
      ok: false,
      message: "Unexpected error while adding leaderboard entry.",
    };
  }
}

export async function updateLeaderboardEntryAction(
  _prevState: CompetitionActionResult | null,
  formData: FormData,
): Promise<CompetitionActionResult> {
  try {
    await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "leaderboard.entry_updated",
    });

    const parsed = validateLeaderboardUpdateInput({
      eventId: String(formData.get("eventId") ?? ""),
      entryId: String(formData.get("entryId") ?? ""),
      position: String(formData.get("position") ?? ""),
      displayValue: String(formData.get("displayValue") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    });

    if (!parsed.ok) {
      return { ok: false, message: parsed.error };
    }

    const supabase = await createSupabaseServerClient();

    const { data: existingRow, error: existingErr } = await supabase
      .from("leaderboard_entries")
      .select("id, event_id")
      .eq("id", parsed.value.entryId)
      .eq("event_id", parsed.value.eventId)
      .maybeSingle<Pick<LeaderboardEntryRecord, "id" | "event_id">>();

    if (existingErr) {
      return {
        ok: false,
        message: mapLeaderboardDbError(
          existingErr,
          "Unable to load existing leaderboard entry.",
        ),
      };
    }

    if (!existingRow) {
      return {
        ok: false,
        message: "Leaderboard entry was not found for this event.",
      };
    }

    const { error: rpcErr } = await supabase.rpc("update_leaderboard_entry", {
      p_event_id: parsed.value.eventId,
      p_entry_id: parsed.value.entryId,
      p_position: parsed.value.position,
      p_display_value: parsed.value.displayValue,
      p_notes: parsed.value.notes,
    });

    if (rpcErr) {
      return {
        ok: false,
        message: mapLeaderboardDbError(
          rpcErr,
          "Unable to update leaderboard entry.",
        ),
      };
    }

    revalidatePath(`/events/${parsed.value.eventId}`);
    revalidatePath(`/events/${parsed.value.eventId}/leaderboard`);

    return {
      ok: true,
      message: `Updated leaderboard entry to position #${parsed.value.position} (${parsed.value.displayValue}).`,
    };
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    console.error(
      "[leaderboard] update error:",
      err instanceof Error ? err.message : "unknown",
    );
    return {
      ok: false,
      message: "Unexpected error while updating leaderboard entry.",
    };
  }
}

export async function removeLeaderboardEntryAction(
  eventId: string,
  entryId: string,
): Promise<CompetitionActionResult> {
  try {
    await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "leaderboard.entry_removed",
    });

    const eventCheck = validateUuid(eventId, "Event");
    if (!eventCheck.ok) return { ok: false, message: eventCheck.error };

    const entryCheck = validateUuid(entryId, "Leaderboard entry");
    if (!entryCheck.ok) return { ok: false, message: entryCheck.error };

    const supabase = await createSupabaseServerClient();

    const { error: rpcErr } = await supabase.rpc("remove_leaderboard_entry", {
      p_event_id: eventCheck.value,
      p_entry_id: entryCheck.value,
    });

    if (rpcErr) {
      return {
        ok: false,
        message: mapLeaderboardDbError(
          rpcErr,
          "Unable to remove leaderboard entry.",
        ),
      };
    }

    revalidatePath(`/events/${eventCheck.value}`);
    revalidatePath(`/events/${eventCheck.value}/leaderboard`);

    return {
      ok: true,
      message: "Removed contingent from the event leaderboard.",
    };
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    console.error(
      "[leaderboard] remove error:",
      err instanceof Error ? err.message : "unknown",
    );
    return {
      ok: false,
      message: "Unexpected error while removing leaderboard entry.",
    };
  }
}
