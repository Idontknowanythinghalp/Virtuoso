"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminSupabaseConfigured } from "@/lib/supabase/server-env";
import { recordAuditLog } from "@/lib/audit/logger";
import {
  OrganiserAuthError,
  requireActiveUserForAction,
} from "@/lib/auth/guards";
import { ALL_ORGANISER_ROLES } from "@/lib/auth/policy";
import {
  validateEventInput,
  validateJudgingCriterionInput,
  validateRoundAllowsCriteriaMutation,
  validateRoundInput,
  validateUuid,
} from "@/lib/competition/validation";
import type {
  EventRecord,
  EventStatus,
  JudgingCriterionRecord,
  RoundRecord,
} from "@/types/competition";

export interface CompetitionActionResult {
  ok: boolean;
  message: string;
  createdId?: string;
}

function mapCompetitionDbError(
  err: { code?: string; message?: string },
  fallback: string,
): string {
  if (err.code === "23505") {
    if (err.message?.includes("events_code")) {
      return "An event with this event code already exists.";
    }
    if (err.message?.includes("rounds_event_number")) {
      return "Another round in this event already uses that round number.";
    }
    if (err.message?.includes("judging_criteria_round_order")) {
      return "Another criterion in this round already uses that display order.";
    }
    if (err.message?.includes("judging_criteria_round_name")) {
      return "A criterion with this name already exists in this round.";
    }
    return "A duplicate record already exists.";
  }
  if (err.code === "P0001" && err.message) {
    return err.message;
  }
  return fallback;
}

async function ensureAuditResult(
  successMessage: string,
  auditPromise: Promise<{ ok: boolean; error?: string }>,
  createdId?: string,
): Promise<CompetitionActionResult> {
  const audit = await auditPromise;
  if (!audit.ok) {
    return {
      ok: false,
      message: `${successMessage}, but audit logging failed: ${audit.error ?? "Unknown audit error."}`,
      createdId,
    };
  }
  return { ok: true, message: successMessage, createdId };
}

async function ensureNoLiveRoundsBeforeDeactivatingEvent(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  eventId: string,
): Promise<string | null> {
  const [
    { data: openSessions, error: sessionsErr },
    { data: dbNowRaw, error: dbNowErr },
  ] = await Promise.all([
    supabase
      .from("round_release_sessions")
      .select("id, expires_at")
      .eq("event_id", eventId)
      .is("closed_at", null),
    supabase.rpc("get_db_server_timestamp"),
  ]);

  if (sessionsErr) {
    return "Unable to verify active round release sessions before changing event status.";
  }

  if (dbNowErr || typeof dbNowRaw !== "string") {
    return "Unable to verify authoritative database clock before changing event status.";
  }

  const dbNowMs = Date.parse(dbNowRaw);
  if (!Number.isFinite(dbNowMs)) {
    return "Received invalid database timestamp while verifying active round release sessions.";
  }

  const hasLiveSession = (openSessions ?? []).some((s) => {
    const expiresMs = Date.parse((s as { expires_at: string }).expires_at);
    return !Number.isFinite(expiresMs) || expiresMs > dbNowMs;
  });

  if (hasLiveSession) {
    return 'Cannot change event status away from "Active" while a round has a live release session. Close active rounds first.';
  }

  return null;
}

export async function createEventAction(
  _prevState: CompetitionActionResult | null,
  formData: FormData,
): Promise<CompetitionActionResult> {
  try {
    const actor = await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "event.create",
    });

    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        message:
          "Audit logging is required before creating competition records. Configure SUPABASE_SERVICE_ROLE_KEY on the server.",
      };
    }

    const checked = validateEventInput({
      code: String(formData.get("code") ?? ""),
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      entryMode: String(formData.get("entryMode") ?? "contingent"),
      codenameMode: String(formData.get("codenameMode") ?? "event_wide"),
      status: String(formData.get("status") ?? "draft"),
      minTeamSize: String(formData.get("minTeamSize") ?? ""),
      maxTeamSize: String(formData.get("maxTeamSize") ?? ""),
    });

    if (!checked.ok) {
      return { ok: false, message: checked.error };
    }

    const supabase = await createSupabaseServerClient();
    const { data: created, error } = await supabase
      .from("events")
      .insert({
        ...checked.value,
        created_by: actor.userId,
      })
      .select("*")
      .single<EventRecord>();

    if (error || !created) {
      return {
        ok: false,
        message: mapCompetitionDbError(
          error ?? {},
          "Unable to create event. Verify database migrations and permissions.",
        ),
      };
    }

    revalidatePath("/events");
    revalidatePath("/");

    return ensureAuditResult(
      `Created event "${created.name}" (${created.code}).`,
      recordAuditLog({
        actorUserId: actor.userId,
        actorEmail: actor.profile.email,
        action: "event.created",
        entityType: "event",
        entityId: created.id,
        afterData: {
          code: created.code,
          name: created.name,
          entry_mode: created.entry_mode,
          codename_mode: created.codename_mode,
          status: created.status,
          min_team_size: created.min_team_size,
          max_team_size: created.max_team_size,
        },
      }),
      created.id,
    );
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    console.error("[events] create error:", err instanceof Error ? err.message : "unknown");
    return { ok: false, message: "Unexpected error while creating event." };
  }
}

export async function updateEventAction(
  _prevState: CompetitionActionResult | null,
  formData: FormData,
): Promise<CompetitionActionResult> {
  try {
    const actor = await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "event.update",
    });

    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        message:
          "Audit logging is required before updating competition records. Configure SUPABASE_SERVICE_ROLE_KEY on the server.",
      };
    }

    const idCheck = validateUuid(String(formData.get("eventId") ?? ""), "Event");
    if (!idCheck.ok) return { ok: false, message: idCheck.error };

    const checked = validateEventInput({
      code: String(formData.get("code") ?? ""),
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      entryMode: String(formData.get("entryMode") ?? ""),
      codenameMode: String(formData.get("codenameMode") ?? ""),
      status: String(formData.get("status") ?? ""),
      minTeamSize: String(formData.get("minTeamSize") ?? ""),
      maxTeamSize: String(formData.get("maxTeamSize") ?? ""),
    });

    if (!checked.ok) return { ok: false, message: checked.error };

    const supabase = await createSupabaseServerClient();
    const { data: before, error: loadError } = await supabase
      .from("events")
      .select("*")
      .eq("id", idCheck.value)
      .maybeSingle<EventRecord>();

    if (loadError || !before) {
      return { ok: false, message: "Event not found." };
    }

    if (before.status === "active" && checked.value.status !== "active") {
      const liveCheckError = await ensureNoLiveRoundsBeforeDeactivatingEvent(
        supabase,
        idCheck.value,
      );
      if (liveCheckError) {
        return { ok: false, message: liveCheckError };
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from("events")
      .update(checked.value)
      .eq("id", idCheck.value)
      .select("*")
      .single<EventRecord>();

    if (updateError || !updated) {
      return {
        ok: false,
        message: mapCompetitionDbError(
          updateError ?? {},
          "Unable to update event.",
        ),
      };
    }

    revalidatePath("/events");
    revalidatePath(`/events/${idCheck.value}`);

    return ensureAuditResult(
      `Updated event "${updated.name}".`,
      recordAuditLog({
        actorUserId: actor.userId,
        actorEmail: actor.profile.email,
        action: "event.updated",
        entityType: "event",
        entityId: updated.id,
        beforeData: {
          code: before.code,
          name: before.name,
          entry_mode: before.entry_mode,
          codename_mode: before.codename_mode,
          status: before.status,
          min_team_size: before.min_team_size,
          max_team_size: before.max_team_size,
        },
        afterData: {
          code: updated.code,
          name: updated.name,
          entry_mode: updated.entry_mode,
          codename_mode: updated.codename_mode,
          status: updated.status,
          min_team_size: updated.min_team_size,
          max_team_size: updated.max_team_size,
        },
      }),
    );
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    console.error("[events] update error:", err instanceof Error ? err.message : "unknown");
    return { ok: false, message: "Unexpected error while updating event." };
  }
}

export async function updateEventStatusAction(
  eventId: string,
  nextStatus: EventStatus,
): Promise<CompetitionActionResult> {
  try {
    const actor = await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "event.status_change",
    });

    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        message:
          "Audit logging is required before changing event status. Configure SUPABASE_SERVICE_ROLE_KEY on the server.",
      };
    }

    const idCheck = validateUuid(eventId, "Event");
    if (!idCheck.ok) return { ok: false, message: idCheck.error };

    if (!["draft", "active", "inactive", "archived"].includes(nextStatus)) {
      return { ok: false, message: "Invalid event status." };
    }

    const supabase = await createSupabaseServerClient();
    const { data: before, error: loadError } = await supabase
      .from("events")
      .select("*")
      .eq("id", idCheck.value)
      .maybeSingle<EventRecord>();

    if (loadError || !before) {
      return { ok: false, message: "Event not found." };
    }

    if (before.status === nextStatus) {
      return { ok: true, message: "Event status is already up to date." };
    }

    if (before.status === "active" && nextStatus !== "active") {
      const liveCheckError = await ensureNoLiveRoundsBeforeDeactivatingEvent(
        supabase,
        idCheck.value,
      );
      if (liveCheckError) {
        return { ok: false, message: liveCheckError };
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from("events")
      .update({ status: nextStatus })
      .eq("id", idCheck.value)
      .select("*")
      .single<EventRecord>();

    if (updateError || !updated) {
      return {
        ok: false,
        message: mapCompetitionDbError(
          updateError ?? {},
          "Unable to update event status.",
        ),
      };
    }

    revalidatePath("/events");
    revalidatePath(`/events/${idCheck.value}`);

    const actionName =
      nextStatus === "archived"
        ? "event.archived"
        : nextStatus === "active"
          ? "event.activated"
          : "event.status_changed";

    return ensureAuditResult(
      `Event "${updated.name}" marked as ${nextStatus}.`,
      recordAuditLog({
        actorUserId: actor.userId,
        actorEmail: actor.profile.email,
        action: actionName,
        entityType: "event",
        entityId: updated.id,
        beforeData: { status: before.status },
        afterData: { status: updated.status },
      }),
    );
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    return { ok: false, message: "Unexpected error while updating event status." };
  }
}

export async function createRoundAction(
  _prevState: CompetitionActionResult | null,
  formData: FormData,
): Promise<CompetitionActionResult> {
  try {
    const actor = await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "round.create",
    });

    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        message:
          "Audit logging is required before creating rounds. Configure SUPABASE_SERVICE_ROLE_KEY on the server.",
      };
    }

    const eventCheck = validateUuid(String(formData.get("eventId") ?? ""), "Event");
    if (!eventCheck.ok) return { ok: false, message: eventCheck.error };

    const checked = validateRoundInput({
      roundNumber: String(formData.get("roundNumber") ?? ""),
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      scoringMethod: String(formData.get("scoringMethod") ?? "criteria_sum"),
      attributionMode: String(
        formData.get("attributionMode") ?? "individual_judge",
      ),
      status: String(formData.get("status") ?? "draft"),
      isLocked: formData.get("isLocked") === "true" || formData.get("isLocked") === "on",
      durationMinutes: String(formData.get("durationMinutes") ?? ""),
    });

    if (!checked.ok) return { ok: false, message: checked.error };

    if (
      checked.value.status === "deployed" ||
      checked.value.status === "closed"
    ) {
      return {
        ok: false,
        message:
          'New rounds must be created as "Draft" or "Ready" and released through the Round Release controls.',
      };
    }

    const supabase = await createSupabaseServerClient();
    const { data: eventRow, error: eventError } = await supabase
      .from("events")
      .select("id, status")
      .eq("id", eventCheck.value)
      .maybeSingle<{ id: string; status: string }>();

    if (eventError || !eventRow) {
      return { ok: false, message: "Parent event was not found." };
    }

    const { data: created, error } = await supabase
      .from("rounds")
      .insert({
        event_id: eventRow.id,
        ...checked.value,
      })
      .select("*")
      .single<RoundRecord>();

    if (error || !created) {
      return {
        ok: false,
        message: mapCompetitionDbError(
          error ?? {},
          "Unable to create round.",
        ),
      };
    }

    revalidatePath(`/events/${eventRow.id}`);

    return ensureAuditResult(
      `Created Round ${created.round_number}: "${created.name}".`,
      recordAuditLog({
        actorUserId: actor.userId,
        actorEmail: actor.profile.email,
        action: "round.created",
        entityType: "round",
        entityId: created.id,
        afterData: {
          event_id: created.event_id,
          round_number: created.round_number,
          name: created.name,
          scoring_method: created.scoring_method,
          attribution_mode: created.attribution_mode,
          status: created.status,
          is_locked: created.is_locked,
          duration_minutes: created.duration_minutes,
        },
      }),
      created.id,
    );
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    return { ok: false, message: "Unexpected error while creating round." };
  }
}

export async function updateRoundAction(
  _prevState: CompetitionActionResult | null,
  formData: FormData,
): Promise<CompetitionActionResult> {
  try {
    const actor = await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "round.update",
    });

    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        message:
          "Audit logging is required before updating rounds. Configure SUPABASE_SERVICE_ROLE_KEY on the server.",
      };
    }

    const eventCheck = validateUuid(String(formData.get("eventId") ?? ""), "Event");
    if (!eventCheck.ok) return { ok: false, message: eventCheck.error };

    const roundCheck = validateUuid(String(formData.get("roundId") ?? ""), "Round");
    if (!roundCheck.ok) return { ok: false, message: roundCheck.error };

    const checked = validateRoundInput({
      roundNumber: String(formData.get("roundNumber") ?? ""),
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      scoringMethod: String(formData.get("scoringMethod") ?? ""),
      attributionMode: String(formData.get("attributionMode") ?? ""),
      status: String(formData.get("status") ?? ""),
      isLocked: formData.get("isLocked") === "true" || formData.get("isLocked") === "on",
      durationMinutes: String(formData.get("durationMinutes") ?? ""),
    });

    if (!checked.ok) return { ok: false, message: checked.error };

    const supabase = await createSupabaseServerClient();
    const [
      { data: before, error: loadError },
      { data: releaseSessions, error: sessionsErr },
    ] = await Promise.all([
      supabase
        .from("rounds")
        .select("*")
        .eq("id", roundCheck.value)
        .eq("event_id", eventCheck.value)
        .maybeSingle<RoundRecord>(),
      supabase
        .from("round_release_sessions")
        .select("id, closed_at")
        .eq("round_id", roundCheck.value)
        .eq("event_id", eventCheck.value),
    ]);

    if (loadError || !before) {
      return {
        ok: false,
        message: "Round not found for the specified event.",
      };
    }

    if (sessionsErr) {
      return {
        ok: false,
        message: mapCompetitionDbError(
          sessionsErr,
          "Unable to verify round release history before updating round settings.",
        ),
      };
    }

    const hasAnySession = (releaseSessions?.length ?? 0) > 0;

    if (
      before.is_locked &&
      !checked.value.is_locked &&
      (hasAnySession || before.status === "deployed" || before.status === "closed")
    ) {
      return {
        ok: false,
        message:
          "Judging criteria lock cannot be removed after a round has been released.",
      };
    }

    if (checked.value.status !== before.status) {
      if (
        checked.value.status === "deployed" ||
        checked.value.status === "closed"
      ) {
        return {
          ok: false,
          message:
            'Release-managed statuses ("Deployed" / "Closed") can only be changed via the Round Release controls.',
        };
      }
      if (before.status === "deployed") {
        return {
          ok: false,
          message:
            "Cannot change a deployed round's status directly. Close the active release session first.",
        };
      }
      if (
        before.status === "closed" &&
        (checked.value.status === "draft" || checked.value.status === "ready")
      ) {
        return {
          ok: false,
          message:
            "A closed round cannot revert to Draft or Ready. Use Reopen in Round Release Controls to start a new release session.",
        };
      }
    }

    if (
      hasAnySession &&
      checked.value.duration_minutes !== before.duration_minutes
    ) {
      return {
        ok: false,
        message:
          "Configured duration cannot be changed after release history exists. Override duration only when reopening the round.",
      };
    }

    const { data: updated, error: updateError } = await supabase
      .from("rounds")
      .update(checked.value)
      .eq("id", roundCheck.value)
      .eq("event_id", eventCheck.value)
      .select("*")
      .single<RoundRecord>();

    if (updateError || !updated) {
      return {
        ok: false,
        message: mapCompetitionDbError(
          updateError ?? {},
          "Unable to update round.",
        ),
      };
    }

    revalidatePath(`/events/${eventCheck.value}`);
    revalidatePath(`/events/${eventCheck.value}/rounds/${roundCheck.value}`);

    return ensureAuditResult(
      `Updated Round ${updated.round_number}: "${updated.name}".`,
      recordAuditLog({
        actorUserId: actor.userId,
        actorEmail: actor.profile.email,
        action: "round.updated",
        entityType: "round",
        entityId: updated.id,
        beforeData: {
          round_number: before.round_number,
          name: before.name,
          scoring_method: before.scoring_method,
          attribution_mode: before.attribution_mode,
          status: before.status,
          is_locked: before.is_locked,
          duration_minutes: before.duration_minutes,
        },
        afterData: {
          round_number: updated.round_number,
          name: updated.name,
          scoring_method: updated.scoring_method,
          attribution_mode: updated.attribution_mode,
          status: updated.status,
          is_locked: updated.is_locked,
          duration_minutes: updated.duration_minutes,
        },
      }),
    );
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    return { ok: false, message: "Unexpected error while updating round." };
  }
}

export async function reorderRoundsAction(
  eventId: string,
  orderedRoundIds: string[],
): Promise<CompetitionActionResult> {
  try {
    const actor = await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "round.reordered",
    });

    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        message:
          "Audit logging is required before reordering rounds. Configure SUPABASE_SERVICE_ROLE_KEY on the server.",
      };
    }

    const eventCheck = validateUuid(eventId, "Event");
    if (!eventCheck.ok) return { ok: false, message: eventCheck.error };

    for (const rid of orderedRoundIds) {
      const check = validateUuid(rid, "Round");
      if (!check.ok) return { ok: false, message: check.error };
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("reorder_event_rounds", {
      p_event_id: eventCheck.value,
      p_round_ids: orderedRoundIds,
    });

    if (error) {
      return {
        ok: false,
        message: mapCompetitionDbError(
          error,
          "Unable to reorder rounds.",
        ),
      };
    }

    revalidatePath(`/events/${eventCheck.value}`);

    return ensureAuditResult(
      "Updated round order.",
      recordAuditLog({
        actorUserId: actor.userId,
        actorEmail: actor.profile.email,
        action: "round.reordered",
        entityType: "event",
        entityId: eventCheck.value,
        afterData: { ordered_round_ids: orderedRoundIds },
      }),
    );
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    return { ok: false, message: "Unexpected error while reordering rounds." };
  }
}

export async function createJudgingCriterionAction(
  _prevState: CompetitionActionResult | null,
  formData: FormData,
): Promise<CompetitionActionResult> {
  try {
    const actor = await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "judging_criterion.create",
    });

    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        message:
          "Audit logging is required before adding judging criteria. Configure SUPABASE_SERVICE_ROLE_KEY on the server.",
      };
    }

    const eventCheck = validateUuid(String(formData.get("eventId") ?? ""), "Event");
    if (!eventCheck.ok) return { ok: false, message: eventCheck.error };

    const roundCheck = validateUuid(String(formData.get("roundId") ?? ""), "Round");
    if (!roundCheck.ok) return { ok: false, message: roundCheck.error };

    const checked = validateJudgingCriterionInput({
      displayOrder: String(formData.get("displayOrder") ?? ""),
      name: String(formData.get("name") ?? ""),
      maxPoints: String(formData.get("maxPoints") ?? ""),
      weight: String(formData.get("weight") ?? "1"),
      rubricGuidance: String(formData.get("rubricGuidance") ?? ""),
    });

    if (!checked.ok) return { ok: false, message: checked.error };

    const supabase = await createSupabaseServerClient();
    const { data: roundRow, error: roundError } = await supabase
      .from("rounds")
      .select("id, event_id, is_locked")
      .eq("id", roundCheck.value)
      .eq("event_id", eventCheck.value)
      .maybeSingle<{ id: string; event_id: string; is_locked: boolean }>();

    if (roundError || !roundRow) {
      return {
        ok: false,
        message: "Round not found for the specified event.",
      };
    }

    const lockCheck = validateRoundAllowsCriteriaMutation(roundRow);
    if (!lockCheck.ok) return { ok: false, message: lockCheck.error };

    const { data: created, error } = await supabase
      .from("judging_criteria")
      .insert({
        round_id: roundRow.id,
        ...checked.value,
      })
      .select("*")
      .single<JudgingCriterionRecord>();

    if (error || !created) {
      return {
        ok: false,
        message: mapCompetitionDbError(
          error ?? {},
          "Unable to add judging criterion.",
        ),
      };
    }

    revalidatePath(`/events/${eventCheck.value}/rounds/${roundCheck.value}`);

    return ensureAuditResult(
      `Added criterion "${created.name}".`,
      recordAuditLog({
        actorUserId: actor.userId,
        actorEmail: actor.profile.email,
        action: "judging_criterion.created",
        entityType: "judging_criterion",
        entityId: created.id,
        afterData: {
          round_id: created.round_id,
          display_order: created.display_order,
          name: created.name,
          max_points: created.max_points,
          weight: created.weight,
        },
      }),
      created.id,
    );
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    return {
      ok: false,
      message: "Unexpected error while adding judging criterion.",
    };
  }
}

export async function updateJudgingCriterionAction(
  formData: FormData,
): Promise<CompetitionActionResult> {
  try {
    const actor = await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "judging_criterion.update",
    });

    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        message:
          "Audit logging is required before updating judging criteria. Configure SUPABASE_SERVICE_ROLE_KEY on the server.",
      };
    }

    const eventCheck = validateUuid(String(formData.get("eventId") ?? ""), "Event");
    if (!eventCheck.ok) return { ok: false, message: eventCheck.error };

    const roundCheck = validateUuid(String(formData.get("roundId") ?? ""), "Round");
    if (!roundCheck.ok) return { ok: false, message: roundCheck.error };

    const criterionCheck = validateUuid(
      String(formData.get("criterionId") ?? ""),
      "Criterion",
    );
    if (!criterionCheck.ok) return { ok: false, message: criterionCheck.error };

    const checked = validateJudgingCriterionInput({
      displayOrder: String(formData.get("displayOrder") ?? ""),
      name: String(formData.get("name") ?? ""),
      maxPoints: String(formData.get("maxPoints") ?? ""),
      weight: String(formData.get("weight") ?? ""),
      rubricGuidance: String(formData.get("rubricGuidance") ?? ""),
    });

    if (!checked.ok) return { ok: false, message: checked.error };

    const supabase = await createSupabaseServerClient();
    const { data: roundRow, error: roundError } = await supabase
      .from("rounds")
      .select("id, event_id, is_locked")
      .eq("id", roundCheck.value)
      .eq("event_id", eventCheck.value)
      .maybeSingle<{ id: string; event_id: string; is_locked: boolean }>();

    if (roundError || !roundRow) {
      return { ok: false, message: "Round not found for the specified event." };
    }

    const lockCheck = validateRoundAllowsCriteriaMutation(roundRow);
    if (!lockCheck.ok) return { ok: false, message: lockCheck.error };

    const { data: before, error: loadError } = await supabase
      .from("judging_criteria")
      .select("*")
      .eq("id", criterionCheck.value)
      .eq("round_id", roundCheck.value)
      .maybeSingle<JudgingCriterionRecord>();

    if (loadError || !before) {
      return { ok: false, message: "Judging criterion not found in this round." };
    }

    const { data: updated, error: updateError } = await supabase
      .from("judging_criteria")
      .update(checked.value)
      .eq("id", criterionCheck.value)
      .eq("round_id", roundCheck.value)
      .select("*")
      .single<JudgingCriterionRecord>();

    if (updateError || !updated) {
      return {
        ok: false,
        message: mapCompetitionDbError(
          updateError ?? {},
          "Unable to update judging criterion.",
        ),
      };
    }

    revalidatePath(`/events/${eventCheck.value}/rounds/${roundCheck.value}`);

    return ensureAuditResult(
      `Updated criterion "${updated.name}".`,
      recordAuditLog({
        actorUserId: actor.userId,
        actorEmail: actor.profile.email,
        action: "judging_criterion.updated",
        entityType: "judging_criterion",
        entityId: updated.id,
        beforeData: {
          display_order: before.display_order,
          name: before.name,
          max_points: before.max_points,
          weight: before.weight,
        },
        afterData: {
          display_order: updated.display_order,
          name: updated.name,
          max_points: updated.max_points,
          weight: updated.weight,
        },
      }),
    );
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    return {
      ok: false,
      message: "Unexpected error while updating judging criterion.",
    };
  }
}

export async function reorderJudgingCriteriaAction(
  eventId: string,
  roundId: string,
  orderedCriterionIds: string[],
): Promise<CompetitionActionResult> {
  try {
    const actor = await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "judging_criterion.reordered",
    });

    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        message:
          "Audit logging is required before reordering judging criteria. Configure SUPABASE_SERVICE_ROLE_KEY on the server.",
      };
    }

    const eventCheck = validateUuid(eventId, "Event");
    if (!eventCheck.ok) return { ok: false, message: eventCheck.error };

    const roundCheck = validateUuid(roundId, "Round");
    if (!roundCheck.ok) return { ok: false, message: roundCheck.error };

    for (const cid of orderedCriterionIds) {
      const check = validateUuid(cid, "Criterion");
      if (!check.ok) return { ok: false, message: check.error };
    }

    const supabase = await createSupabaseServerClient();
    const { data: roundRow, error: roundError } = await supabase
      .from("rounds")
      .select("id, is_locked")
      .eq("id", roundCheck.value)
      .eq("event_id", eventCheck.value)
      .maybeSingle<{ id: string; is_locked: boolean }>();

    if (roundError || !roundRow) {
      return { ok: false, message: "Round not found for the specified event." };
    }

    const lockCheck = validateRoundAllowsCriteriaMutation(roundRow);
    if (!lockCheck.ok) return { ok: false, message: lockCheck.error };

    const { error } = await supabase.rpc("reorder_round_criteria", {
      p_round_id: roundCheck.value,
      p_criterion_ids: orderedCriterionIds,
    });

    if (error) {
      return {
        ok: false,
        message: mapCompetitionDbError(
          error,
          "Unable to reorder judging criteria.",
        ),
      };
    }

    revalidatePath(`/events/${eventCheck.value}/rounds/${roundCheck.value}`);

    return ensureAuditResult(
      "Updated criteria display order.",
      recordAuditLog({
        actorUserId: actor.userId,
        actorEmail: actor.profile.email,
        action: "judging_criterion.reordered",
        entityType: "round",
        entityId: roundCheck.value,
        afterData: { ordered_criterion_ids: orderedCriterionIds },
      }),
    );
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    return {
      ok: false,
      message: "Unexpected error while reordering judging criteria.",
    };
  }
}

export async function deleteJudgingCriterionAction(
  eventId: string,
  roundId: string,
  criterionId: string,
): Promise<CompetitionActionResult> {
  try {
    const actor = await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "judging_criterion.deleted",
    });

    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        message:
          "Audit logging is required before removing judging criteria. Configure SUPABASE_SERVICE_ROLE_KEY on the server.",
      };
    }

    const eventCheck = validateUuid(eventId, "Event");
    if (!eventCheck.ok) return { ok: false, message: eventCheck.error };

    const roundCheck = validateUuid(roundId, "Round");
    if (!roundCheck.ok) return { ok: false, message: roundCheck.error };

    const criterionCheck = validateUuid(criterionId, "Criterion");
    if (!criterionCheck.ok) return { ok: false, message: criterionCheck.error };

    const supabase = await createSupabaseServerClient();
    const { data: roundRow, error: roundError } = await supabase
      .from("rounds")
      .select("id, is_locked")
      .eq("id", roundCheck.value)
      .eq("event_id", eventCheck.value)
      .maybeSingle<{ id: string; is_locked: boolean }>();

    if (roundError || !roundRow) {
      return { ok: false, message: "Round not found for the specified event." };
    }

    const lockCheck = validateRoundAllowsCriteriaMutation(roundRow);
    if (!lockCheck.ok) return { ok: false, message: lockCheck.error };

    const { data: before, error: loadError } = await supabase
      .from("judging_criteria")
      .select("*")
      .eq("id", criterionCheck.value)
      .eq("round_id", roundCheck.value)
      .maybeSingle<JudgingCriterionRecord>();

    if (loadError || !before) {
      return { ok: false, message: "Judging criterion not found." };
    }

    const { error: deleteError } = await supabase
      .from("judging_criteria")
      .delete()
      .eq("id", criterionCheck.value)
      .eq("round_id", roundCheck.value);

    if (deleteError) {
      return {
        ok: false,
        message: mapCompetitionDbError(
          deleteError,
          "Unable to remove judging criterion.",
        ),
      };
    }

    revalidatePath(`/events/${eventCheck.value}/rounds/${roundCheck.value}`);

    return ensureAuditResult(
      `Removed criterion "${before.name}".`,
      recordAuditLog({
        actorUserId: actor.userId,
        actorEmail: actor.profile.email,
        action: "judging_criterion.deleted",
        entityType: "judging_criterion",
        entityId: before.id,
        beforeData: {
          round_id: before.round_id,
          display_order: before.display_order,
          name: before.name,
          max_points: before.max_points,
          weight: before.weight,
        },
      }),
    );
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    return {
      ok: false,
      message: "Unexpected error while removing judging criterion.",
    };
  }
}
