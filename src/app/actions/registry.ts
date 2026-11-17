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
  validateContingentInput,
  validateEventEntryInput,
  validateEventEntryStatus,
  validateParticipantInput,
  validateUuid,
} from "@/lib/competition/validation";
import type {
  ContingentRecord,
  EventEntryRecord,
  EventEntryStatus,
  EventRecord,
  ParticipantRecord,
} from "@/types/competition";
import type { CompetitionActionResult } from "@/app/actions/competition";

function mapRegistryDbError(
  err: { code?: string; message?: string },
  fallback: string,
): string {
  if (err.code === "23505") {
    if (err.message?.includes("contingents_code")) {
      return "A contingent with this contingent code already exists.";
    }
    if (err.message?.includes("contingents_ext_ref")) {
      return "A contingent with this external registration reference already exists.";
    }
    if (err.message?.includes("participants_code")) {
      return "A participant with this participant code already exists.";
    }
    if (err.message?.includes("participants_ext_ref")) {
      return "A participant with this external registration reference already exists.";
    }
    if (err.message?.includes("event_entries_unique_contingent")) {
      return "This contingent is already entered in this event.";
    }
    if (err.message?.includes("event_entries_unique_participant")) {
      return "This participant is already entered in this event.";
    }
    return "A duplicate record already exists.";
  }
  if (err.code === "P0001" && err.message) {
    return err.message;
  }
  return fallback;
}

async function ensureRegistryAudit(
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

export async function createContingentAction(
  _prevState: CompetitionActionResult | null,
  formData: FormData,
): Promise<CompetitionActionResult> {
  try {
    const actor = await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "contingent.create",
    });

    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        message:
          "Audit logging is required before creating contingents. Configure SUPABASE_SERVICE_ROLE_KEY on the server.",
      };
    }

    const checked = validateContingentInput({
      contingentCode: String(formData.get("contingentCode") ?? ""),
      name: String(formData.get("name") ?? ""),
      institutionName: String(formData.get("institutionName") ?? ""),
      institutionCity: String(formData.get("institutionCity") ?? ""),
      externalRegistrationRef: String(
        formData.get("externalRegistrationRef") ?? "",
      ),
      contactEmail: String(formData.get("contactEmail") ?? ""),
      contactPhone: String(formData.get("contactPhone") ?? ""),
      isActive: formData.get("isActive") !== "false",
      notes: String(formData.get("notes") ?? ""),
    });

    if (!checked.ok) return { ok: false, message: checked.error };

    const supabase = await createSupabaseServerClient();
    const { data: created, error } = await supabase
      .from("contingents")
      .insert(checked.value)
      .select("*")
      .single<ContingentRecord>();

    if (error || !created) {
      return {
        ok: false,
        message: mapRegistryDbError(
          error ?? {},
          "Unable to create contingent.",
        ),
      };
    }

    revalidatePath("/contingents");

    return ensureRegistryAudit(
      `Created contingent "${created.name}" (${created.contingent_code}).`,
      recordAuditLog({
        actorUserId: actor.userId,
        actorEmail: actor.profile.email,
        action: "contingent.created",
        entityType: "contingent",
        entityId: created.id,
        afterData: {
          contingent_code: created.contingent_code,
          name: created.name,
          institution_name: created.institution_name,
          is_active: created.is_active,
        },
      }),
      created.id,
    );
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    return { ok: false, message: "Unexpected error while creating contingent." };
  }
}

export async function updateContingentAction(
  _prevState: CompetitionActionResult | null,
  formData: FormData,
): Promise<CompetitionActionResult> {
  try {
    const actor = await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "contingent.update",
    });

    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        message:
          "Audit logging is required before updating contingents. Configure SUPABASE_SERVICE_ROLE_KEY on the server.",
      };
    }

    const idCheck = validateUuid(
      String(formData.get("contingentId") ?? ""),
      "Contingent",
    );
    if (!idCheck.ok) return { ok: false, message: idCheck.error };

    const checked = validateContingentInput({
      contingentCode: String(formData.get("contingentCode") ?? ""),
      name: String(formData.get("name") ?? ""),
      institutionName: String(formData.get("institutionName") ?? ""),
      institutionCity: String(formData.get("institutionCity") ?? ""),
      externalRegistrationRef: String(
        formData.get("externalRegistrationRef") ?? "",
      ),
      contactEmail: String(formData.get("contactEmail") ?? ""),
      contactPhone: String(formData.get("contactPhone") ?? ""),
      isActive: formData.get("isActive") === "true" || formData.get("isActive") === "on",
      notes: String(formData.get("notes") ?? ""),
    });

    if (!checked.ok) return { ok: false, message: checked.error };

    const supabase = await createSupabaseServerClient();
    const { data: before, error: loadError } = await supabase
      .from("contingents")
      .select("*")
      .eq("id", idCheck.value)
      .maybeSingle<ContingentRecord>();

    if (loadError || !before) {
      return { ok: false, message: "Contingent not found." };
    }

    const { data: updated, error: updateError } = await supabase
      .from("contingents")
      .update(checked.value)
      .eq("id", idCheck.value)
      .select("*")
      .single<ContingentRecord>();

    if (updateError || !updated) {
      return {
        ok: false,
        message: mapRegistryDbError(
          updateError ?? {},
          "Unable to update contingent.",
        ),
      };
    }

    revalidatePath("/contingents");
    revalidatePath(`/contingents/${idCheck.value}`);

    return ensureRegistryAudit(
      `Updated contingent "${updated.name}".`,
      recordAuditLog({
        actorUserId: actor.userId,
        actorEmail: actor.profile.email,
        action: "contingent.updated",
        entityType: "contingent",
        entityId: updated.id,
        beforeData: {
          contingent_code: before.contingent_code,
          name: before.name,
          institution_name: before.institution_name,
          is_active: before.is_active,
        },
        afterData: {
          contingent_code: updated.contingent_code,
          name: updated.name,
          institution_name: updated.institution_name,
          is_active: updated.is_active,
        },
      }),
    );
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    return { ok: false, message: "Unexpected error while updating contingent." };
  }
}

export async function toggleContingentActiveAction(
  contingentId: string,
  nextIsActive: boolean,
): Promise<CompetitionActionResult> {
  try {
    const actor = await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "contingent.status_change",
    });

    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        message:
          "Audit logging is required before updating contingent status. Configure SUPABASE_SERVICE_ROLE_KEY on the server.",
      };
    }

    const idCheck = validateUuid(contingentId, "Contingent");
    if (!idCheck.ok) return { ok: false, message: idCheck.error };

    const supabase = await createSupabaseServerClient();
    const { data: before, error: loadError } = await supabase
      .from("contingents")
      .select("*")
      .eq("id", idCheck.value)
      .maybeSingle<ContingentRecord>();

    if (loadError || !before) {
      return { ok: false, message: "Contingent not found." };
    }

    const { data: updated, error: updateError } = await supabase
      .from("contingents")
      .update({ is_active: nextIsActive })
      .eq("id", idCheck.value)
      .select("*")
      .single<ContingentRecord>();

    if (updateError || !updated) {
      return { ok: false, message: "Unable to update contingent status." };
    }

    revalidatePath("/contingents");
    revalidatePath(`/contingents/${idCheck.value}`);

    return ensureRegistryAudit(
      `Contingent "${updated.name}" marked as ${nextIsActive ? "active" : "inactive"}.`,
      recordAuditLog({
        actorUserId: actor.userId,
        actorEmail: actor.profile.email,
        action: nextIsActive ? "contingent.activated" : "contingent.deactivated",
        entityType: "contingent",
        entityId: updated.id,
        beforeData: { is_active: before.is_active },
        afterData: { is_active: updated.is_active },
      }),
    );
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    return {
      ok: false,
      message: "Unexpected error while updating contingent status.",
    };
  }
}

export async function createParticipantAction(
  _prevState: CompetitionActionResult | null,
  formData: FormData,
): Promise<CompetitionActionResult> {
  try {
    const actor = await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "participant.create",
    });

    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        message:
          "Audit logging is required before creating participants. Configure SUPABASE_SERVICE_ROLE_KEY on the server.",
      };
    }

    const checked = validateParticipantInput({
      contingentId: String(formData.get("contingentId") ?? ""),
      participantCode: String(formData.get("participantCode") ?? ""),
      fullName: String(formData.get("fullName") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      institutionName: String(formData.get("institutionName") ?? ""),
      externalRegistrationRef: String(
        formData.get("externalRegistrationRef") ?? "",
      ),
      isContingentLead:
        formData.get("isContingentLead") === "true" ||
        formData.get("isContingentLead") === "on",
      isActive: formData.get("isActive") !== "false",
    });

    if (!checked.ok) return { ok: false, message: checked.error };

    const supabase = await createSupabaseServerClient();
    if (checked.value.contingent_id) {
      const { data: contRow, error: contErr } = await supabase
        .from("contingents")
        .select("id")
        .eq("id", checked.value.contingent_id)
        .maybeSingle<{ id: string }>();

      if (contErr || !contRow) {
        return { ok: false, message: "Selected contingent does not exist." };
      }
    }

    const { data: created, error } = await supabase
      .from("participants")
      .insert(checked.value)
      .select("*")
      .single<ParticipantRecord>();

    if (error || !created) {
      return {
        ok: false,
        message: mapRegistryDbError(
          error ?? {},
          "Unable to create participant.",
        ),
      };
    }

    revalidatePath("/participants");
    if (created.contingent_id) {
      revalidatePath(`/contingents/${created.contingent_id}`);
    }

    return ensureRegistryAudit(
      `Registered participant "${created.full_name}" (${created.participant_code}).`,
      recordAuditLog({
        actorUserId: actor.userId,
        actorEmail: actor.profile.email,
        action: "participant.created",
        entityType: "participant",
        entityId: created.id,
        afterData: {
          participant_code: created.participant_code,
          full_name: created.full_name,
          contingent_id: created.contingent_id,
          institution_name: created.institution_name,
          is_contingent_lead: created.is_contingent_lead,
          is_active: created.is_active,
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
      message: "Unexpected error while creating participant.",
    };
  }
}

export async function updateParticipantAction(
  _prevState: CompetitionActionResult | null,
  formData: FormData,
): Promise<CompetitionActionResult> {
  try {
    const actor = await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "participant.update",
    });

    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        message:
          "Audit logging is required before updating participants. Configure SUPABASE_SERVICE_ROLE_KEY on the server.",
      };
    }

    const idCheck = validateUuid(
      String(formData.get("participantId") ?? ""),
      "Participant",
    );
    if (!idCheck.ok) return { ok: false, message: idCheck.error };

    const checked = validateParticipantInput({
      contingentId: String(formData.get("contingentId") ?? ""),
      participantCode: String(formData.get("participantCode") ?? ""),
      fullName: String(formData.get("fullName") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      institutionName: String(formData.get("institutionName") ?? ""),
      externalRegistrationRef: String(
        formData.get("externalRegistrationRef") ?? "",
      ),
      isContingentLead:
        formData.get("isContingentLead") === "true" ||
        formData.get("isContingentLead") === "on",
      isActive:
        formData.get("isActive") === "true" ||
        formData.get("isActive") === "on",
    });

    if (!checked.ok) return { ok: false, message: checked.error };

    const supabase = await createSupabaseServerClient();
    const { data: before, error: loadError } = await supabase
      .from("participants")
      .select("*")
      .eq("id", idCheck.value)
      .maybeSingle<ParticipantRecord>();

    if (loadError || !before) {
      return { ok: false, message: "Participant not found." };
    }

    if (checked.value.contingent_id) {
      const { data: contRow, error: contErr } = await supabase
        .from("contingents")
        .select("id")
        .eq("id", checked.value.contingent_id)
        .maybeSingle<{ id: string }>();

      if (contErr || !contRow) {
        return { ok: false, message: "Selected contingent does not exist." };
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from("participants")
      .update(checked.value)
      .eq("id", idCheck.value)
      .select("*")
      .single<ParticipantRecord>();

    if (updateError || !updated) {
      return {
        ok: false,
        message: mapRegistryDbError(
          updateError ?? {},
          "Unable to update participant.",
        ),
      };
    }

    revalidatePath("/participants");
    revalidatePath(`/participants/${idCheck.value}`);
    if (before.contingent_id) {
      revalidatePath(`/contingents/${before.contingent_id}`);
    }
    if (updated.contingent_id) {
      revalidatePath(`/contingents/${updated.contingent_id}`);
    }

    return ensureRegistryAudit(
      `Updated participant "${updated.full_name}".`,
      recordAuditLog({
        actorUserId: actor.userId,
        actorEmail: actor.profile.email,
        action: "participant.updated",
        entityType: "participant",
        entityId: updated.id,
        beforeData: {
          participant_code: before.participant_code,
          full_name: before.full_name,
          contingent_id: before.contingent_id,
          is_contingent_lead: before.is_contingent_lead,
          is_active: before.is_active,
        },
        afterData: {
          participant_code: updated.participant_code,
          full_name: updated.full_name,
          contingent_id: updated.contingent_id,
          is_contingent_lead: updated.is_contingent_lead,
          is_active: updated.is_active,
        },
      }),
    );
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    return {
      ok: false,
      message: "Unexpected error while updating participant.",
    };
  }
}

export async function createEventEntryAction(
  _prevState: CompetitionActionResult | null,
  formData: FormData,
): Promise<CompetitionActionResult> {
  try {
    const actor = await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "event_entry.create",
    });

    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        message:
          "Audit logging is required before registering event entries. Configure SUPABASE_SERVICE_ROLE_KEY on the server.",
      };
    }

    const eventCheck = validateUuid(String(formData.get("eventId") ?? ""), "Event");
    if (!eventCheck.ok) return { ok: false, message: eventCheck.error };

    const supabase = await createSupabaseServerClient();
    const { data: eventRow, error: eventErr } = await supabase
      .from("events")
      .select("id, entry_mode, status")
      .eq("id", eventCheck.value)
      .maybeSingle<Pick<EventRecord, "id" | "entry_mode" | "status">>();

    if (eventErr || !eventRow) {
      return { ok: false, message: "Target event was not found." };
    }

    const checked = validateEventEntryInput({
      eventId: eventRow.id,
      eventEntryMode: eventRow.entry_mode,
      eventStatus: eventRow.status,
      entryType: String(formData.get("entryType") ?? ""),
      contingentId: String(formData.get("contingentId") ?? ""),
      participantId: String(formData.get("participantId") ?? ""),
      status: String(formData.get("status") ?? "registered"),
      notes: String(formData.get("notes") ?? ""),
    });

    if (!checked.ok) return { ok: false, message: checked.error };

    const { data: created, error } = await supabase
      .from("event_entries")
      .insert(checked.value)
      .select("*")
      .single<EventEntryRecord>();

    if (error || !created) {
      return {
        ok: false,
        message: mapRegistryDbError(
          error ?? {},
          "Unable to add entry to event.",
        ),
      };
    }

    revalidatePath(`/events/${eventRow.id}`);
    revalidatePath("/events");

    return ensureRegistryAudit(
      "Added entry to event.",
      recordAuditLog({
        actorUserId: actor.userId,
        actorEmail: actor.profile.email,
        action: "event_entry.created",
        entityType: "event_entry",
        entityId: created.id,
        afterData: {
          event_id: created.event_id,
          entry_type: created.entry_type,
          contingent_id: created.contingent_id,
          participant_id: created.participant_id,
          status: created.status,
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
      message: "Unexpected error while registering event entry.",
    };
  }
}

export async function updateEventEntryStatusAction(
  eventId: string,
  entryId: string,
  nextStatus: EventEntryStatus,
): Promise<CompetitionActionResult> {
  try {
    const actor = await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "event_entry.status_changed",
    });

    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        message:
          "Audit logging is required before updating entry status. Configure SUPABASE_SERVICE_ROLE_KEY on the server.",
      };
    }

    const eventCheck = validateUuid(eventId, "Event");
    if (!eventCheck.ok) return { ok: false, message: eventCheck.error };

    const entryCheck = validateUuid(entryId, "Event Entry");
    if (!entryCheck.ok) return { ok: false, message: entryCheck.error };

    const statusCheck = validateEventEntryStatus(nextStatus);
    if (!statusCheck.ok) return { ok: false, message: statusCheck.error };

    const supabase = await createSupabaseServerClient();
    const { data: before, error: loadError } = await supabase
      .from("event_entries")
      .select("*")
      .eq("id", entryCheck.value)
      .eq("event_id", eventCheck.value)
      .maybeSingle<EventEntryRecord>();

    if (loadError || !before) {
      return { ok: false, message: "Event entry not found for this event." };
    }

    const { data: updated, error: updateError } = await supabase
      .from("event_entries")
      .update({ status: statusCheck.value })
      .eq("id", entryCheck.value)
      .eq("event_id", eventCheck.value)
      .select("*")
      .single<EventEntryRecord>();

    if (updateError || !updated) {
      return { ok: false, message: "Unable to update entry status." };
    }

    revalidatePath(`/events/${eventCheck.value}`);

    return ensureRegistryAudit(
      `Entry status updated to ${statusCheck.value}.`,
      recordAuditLog({
        actorUserId: actor.userId,
        actorEmail: actor.profile.email,
        action: "event_entry.status_changed",
        entityType: "event_entry",
        entityId: updated.id,
        beforeData: { status: before.status },
        afterData: { status: updated.status },
      }),
    );
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    return {
      ok: false,
      message: "Unexpected error while updating entry status.",
    };
  }
}

export async function removeEventEntryAction(
  eventId: string,
  entryId: string,
): Promise<CompetitionActionResult> {
  try {
    const actor = await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "event_entry.removed",
    });

    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        message:
          "Audit logging is required before removing event entries. Configure SUPABASE_SERVICE_ROLE_KEY on the server.",
      };
    }

    const eventCheck = validateUuid(eventId, "Event");
    if (!eventCheck.ok) return { ok: false, message: eventCheck.error };

    const entryCheck = validateUuid(entryId, "Event Entry");
    if (!entryCheck.ok) return { ok: false, message: entryCheck.error };

    const supabase = await createSupabaseServerClient();
    const { data: before, error: loadError } = await supabase
      .from("event_entries")
      .select("*")
      .eq("id", entryCheck.value)
      .eq("event_id", eventCheck.value)
      .maybeSingle<EventEntryRecord>();

    if (loadError || !before) {
      return { ok: false, message: "Event entry not found for this event." };
    }

    const { error: deleteError } = await supabase
      .from("event_entries")
      .delete()
      .eq("id", entryCheck.value)
      .eq("event_id", eventCheck.value);

    if (deleteError) {
      return {
        ok: false,
        message: mapRegistryDbError(
          deleteError,
          "Unable to remove event entry.",
        ),
      };
    }

    revalidatePath(`/events/${eventCheck.value}`);
    revalidatePath("/events");

    return ensureRegistryAudit(
      "Removed entry from event.",
      recordAuditLog({
        actorUserId: actor.userId,
        actorEmail: actor.profile.email,
        action: "event_entry.removed",
        entityType: "event_entry",
        entityId: before.id,
        beforeData: {
          event_id: before.event_id,
          entry_type: before.entry_type,
          contingent_id: before.contingent_id,
          participant_id: before.participant_id,
          status: before.status,
        },
      }),
    );
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    return {
      ok: false,
      message: "Unexpected error while removing event entry.",
    };
  }
}
