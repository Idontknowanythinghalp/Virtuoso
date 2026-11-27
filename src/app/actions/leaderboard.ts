"use server";

import { revalidatePath } from "next/cache";
import type { CompetitionActionResult } from "@/app/actions/competition";
import {
  OrganiserAuthError,
  requireActiveUserForAction,
} from "@/lib/auth/guards";
import {
  ALL_ORGANISER_ROLES,
  SUPER_ADMIN_ONLY,
} from "@/lib/auth/policy";
import { validateUuid } from "@/lib/competition/validation";
import {
  canPublishEventLeaderboard,
  canUnpublishEventLeaderboard,
  formatLeaderboardScore,
  validateLeaderboardCreateInput,
  validateLeaderboardUpdateInput,
} from "@/lib/leaderboard/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  ContingentRecord,
  EventEntryRecord,
  EventRecord,
  LeaderboardEntryRecord,
  LeaderboardPublicationRecord,
} from "@/types/competition";

function mapLeaderboardDbError(
  err: { code?: string; message?: string },
  fallback: string,
): string {
  if (err.code === "23505") {
    if (err.message?.includes("leaderboard_entries_event_contingent_unique")) {
      return "This contingent already has an entry on this event's draft leaderboard.";
    }
    return "A conflicting leaderboard entry already exists for this event.";
  }

  if (err.code === "23514") {
    if (err.message?.includes("leaderboard_entries_score_check")) {
      return "Score must be between -1,000,000,000 and 1,000,000,000.";
    }
    if (err.message?.includes("leaderboard_entries_notes_check")) {
      return "Notes cannot exceed 500 characters.";
    }
  }

  if (err.code === "23503") {
    return "Selected contingent is not validly registered in this event.";
  }

  if (err.code === "42P01" || err.code === "42883") {
    if (
      err.message?.includes("leaderboard_published_entries") ||
      err.message?.includes("add_numeric_leaderboard_entry") ||
      err.message?.includes("update_numeric_leaderboard_entry")
    ) {
      return "Stage 4.4E database migration 0013 must be applied before using numeric draft & snapshot leaderboards.";
    }
    if (
      err.message?.includes("leaderboard_publications") ||
      err.message?.includes("publish_event_leaderboard")
    ) {
      return "Stage 4.4D/4.4E database migrations (0012 and 0013) must be applied before publishing or unpublishing the leaderboard.";
    }
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
      score: String(formData.get("score") ?? ""),
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
      "add_numeric_leaderboard_entry",
      {
        p_event_id: parsed.value.eventId,
        p_contingent_id: parsed.value.contingentId,
        p_score: parsed.value.score,
        p_notes: parsed.value.notes,
      },
    );

    if (rpcErr || !rpcRaw) {
      return {
        ok: false,
        message: mapLeaderboardDbError(
          rpcErr ?? {},
          "Unable to add contingent to the draft leaderboard.",
        ),
      };
    }

    const rpcResult = rpcRaw as { id?: string };

    revalidatePath(`/events/${parsed.value.eventId}`);
    revalidatePath(`/events/${parsed.value.eventId}/leaderboard`);

    const scoreSummary =
      parsed.value.score === null
        ? "unranked (no score yet)"
        : `score ${formatLeaderboardScore(parsed.value.score)}`;

    return {
      ok: true,
      createdId: rpcResult.id,
      message: `Saved ${contingentRes.data.contingent_code} (${contingentRes.data.name}) to draft with ${scoreSummary}. Publish Ranking when ready for participants to see changes.`,
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
      message: "Unexpected error while adding draft leaderboard entry.",
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
      score: String(formData.get("score") ?? ""),
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
          "Unable to load existing draft leaderboard entry.",
        ),
      };
    }

    if (!existingRow) {
      return {
        ok: false,
        message: "Draft leaderboard entry was not found for this event.",
      };
    }

    const { error: rpcErr } = await supabase.rpc(
      "update_numeric_leaderboard_entry",
      {
        p_event_id: parsed.value.eventId,
        p_entry_id: parsed.value.entryId,
        p_score: parsed.value.score,
        p_notes: parsed.value.notes,
      },
    );

    if (rpcErr) {
      return {
        ok: false,
        message: mapLeaderboardDbError(
          rpcErr,
          "Unable to update draft leaderboard entry.",
        ),
      };
    }

    revalidatePath(`/events/${parsed.value.eventId}`);
    revalidatePath(`/events/${parsed.value.eventId}/leaderboard`);

    const scoreSummary =
      parsed.value.score === null
        ? "unranked (no score)"
        : `score ${formatLeaderboardScore(parsed.value.score)}`;

    return {
      ok: true,
      message: `Updated draft entry to ${scoreSummary}. Publish Ranking to update what participants see.`,
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
      message: "Unexpected error while updating draft leaderboard entry.",
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
          "Unable to remove draft leaderboard entry.",
        ),
      };
    }

    revalidatePath(`/events/${eventCheck.value}`);
    revalidatePath(`/events/${eventCheck.value}/leaderboard`);

    return {
      ok: true,
      message:
        "Removed contingent from draft leaderboard. Publish Ranking when ready to update participant standings.",
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
      message: "Unexpected error while removing draft leaderboard entry.",
    };
  }
}

export async function publishLeaderboardAction(
  eventId: string,
): Promise<CompetitionActionResult> {
  try {
    await requireActiveUserForAction(SUPER_ADMIN_ONLY, {
      actionName: "leaderboard.published",
    });

    const eventCheck = validateUuid(eventId, "Event");
    if (!eventCheck.ok) {
      return { ok: false, message: eventCheck.error };
    }

    const supabase = await createSupabaseServerClient();

    const [eventRes, draftRowsRes, publicationRes] = await Promise.all([
      supabase
        .from("events")
        .select("id, code, status, entry_mode")
        .eq("id", eventCheck.value)
        .maybeSingle<Pick<EventRecord, "id" | "code" | "status" | "entry_mode">>(),
      supabase
        .from("leaderboard_entries")
        .select("id, score, display_value")
        .eq("event_id", eventCheck.value)
        .returns<
          Pick<LeaderboardEntryRecord, "id" | "score" | "display_value">[]
        >(),
      supabase
        .from("leaderboard_publications")
        .select("is_published")
        .eq("event_id", eventCheck.value)
        .maybeSingle<Pick<LeaderboardPublicationRecord, "is_published">>(),
    ]);

    if (eventRes.error || !eventRes.data) {
      return { ok: false, message: "Target event was not found." };
    }

    if (publicationRes.error) {
      const code = (publicationRes.error.code ?? "").trim().toUpperCase();
      if (code === "42P01" || code === "PGRST205") {
        return {
          ok: false,
          message:
            "Stage 4.4D/4.4E database migrations (0012 and 0013) must be applied before publishing the leaderboard.",
        };
      }
      return {
        ok: false,
        message: "Unable to verify current leaderboard publication status.",
      };
    }

    if (draftRowsRes.error) {
      return {
        ok: false,
        message: mapLeaderboardDbError(
          draftRowsRes.error,
          "Unable to verify draft leaderboard entries before publishing.",
        ),
      };
    }

    const draftRows = draftRowsRes.data ?? [];
    const hasLegacyNonNumericEntries = draftRows.some(
      (row) => row.score === null && Boolean(row.display_value?.trim()),
    );
    const wasAlreadyPublished = publicationRes.data?.is_published === true;

    const eligibility = canPublishEventLeaderboard({
      eventStatus: eventRes.data.status,
      entryMode: eventRes.data.entry_mode,
      entryCount: draftRows.length,
      isPublished: wasAlreadyPublished,
      hasLegacyNonNumericEntries,
    });

    if (!eligibility.ok) {
      return { ok: false, message: eligibility.error };
    }

    const { error: rpcErr } = await supabase.rpc("publish_event_leaderboard", {
      p_event_id: eventCheck.value,
    });

    if (rpcErr) {
      return {
        ok: false,
        message: mapLeaderboardDbError(
          rpcErr,
          "Unable to publish the event ranking.",
        ),
      };
    }

    revalidatePath(`/events/${eventCheck.value}`);
    revalidatePath(`/events/${eventCheck.value}/leaderboard`);
    revalidatePath("/team/leaderboard");

    return {
      ok: true,
      message: wasAlreadyPublished
        ? `Published updated ranking snapshot for ${eventRes.data.code}. Participants now see the latest calculated standings.`
        : `Published ranking snapshot for ${eventRes.data.code}. Registered teams can now view official standings.`,
    };
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    console.error(
      "[leaderboard] publish error:",
      err instanceof Error ? err.message : "unknown",
    );
    return {
      ok: false,
      message: "Unexpected error while publishing the event ranking.",
    };
  }
}

export async function unpublishLeaderboardAction(
  eventId: string,
): Promise<CompetitionActionResult> {
  try {
    await requireActiveUserForAction(SUPER_ADMIN_ONLY, {
      actionName: "leaderboard.unpublished",
    });

    const eventCheck = validateUuid(eventId, "Event");
    if (!eventCheck.ok) {
      return { ok: false, message: eventCheck.error };
    }

    const supabase = await createSupabaseServerClient();

    const [eventRes, publicationRes] = await Promise.all([
      supabase
        .from("events")
        .select("id, code, status")
        .eq("id", eventCheck.value)
        .maybeSingle<Pick<EventRecord, "id" | "code" | "status">>(),
      supabase
        .from("leaderboard_publications")
        .select("is_published")
        .eq("event_id", eventCheck.value)
        .maybeSingle<Pick<LeaderboardPublicationRecord, "is_published">>(),
    ]);

    if (eventRes.error || !eventRes.data) {
      return { ok: false, message: "Target event was not found." };
    }

    if (publicationRes.error) {
      const code = (publicationRes.error.code ?? "").trim().toUpperCase();
      if (code === "42P01" || code === "PGRST205") {
        return {
          ok: false,
          message:
            "Stage 4.4D/4.4E database migrations (0012 and 0013) must be applied before unpublishing the leaderboard.",
        };
      }
      return {
        ok: false,
        message: "Unable to verify current leaderboard publication status.",
      };
    }

    const eligibility = canUnpublishEventLeaderboard({
      eventStatus: eventRes.data.status,
      isPublished: publicationRes.data?.is_published === true,
    });

    if (!eligibility.ok) {
      return { ok: false, message: eligibility.error };
    }

    const { error: rpcErr } = await supabase.rpc(
      "unpublish_event_leaderboard",
      {
        p_event_id: eventCheck.value,
      },
    );

    if (rpcErr) {
      return {
        ok: false,
        message: mapLeaderboardDbError(
          rpcErr,
          "Unable to unpublish the event leaderboard.",
        ),
      };
    }

    revalidatePath(`/events/${eventCheck.value}`);
    revalidatePath(`/events/${eventCheck.value}/leaderboard`);
    revalidatePath("/team/leaderboard");

    return {
      ok: true,
      message: `Unpublished leaderboard for ${eventRes.data.code}. Standings are now hidden from participants while draft entries remain saved.`,
    };
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    console.error(
      "[leaderboard] unpublish error:",
      err instanceof Error ? err.message : "unknown",
    );
    return {
      ok: false,
      message: "Unexpected error while unpublishing the event leaderboard.",
    };
  }
}
