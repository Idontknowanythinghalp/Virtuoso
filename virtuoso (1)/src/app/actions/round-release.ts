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
  deriveRoundReleaseState,
  evaluateFirstReleaseEligibility,
  evaluateReopenEligibility,
  validateRoundDuration,
} from "@/lib/competition/round-release";
import type { CompetitionActionResult } from "@/app/actions/competition";
import type {
  EventRecord,
  RoundRecord,
  RoundReleaseSessionRecord,
} from "@/types/competition";

function mapRoundReleaseDbError(
  err: { code?: string; message?: string },
  fallback: string,
): string {
  if (err.code === "23505") {
    if (err.message?.includes("round_release_sessions_one_open")) {
      return "This round already has an open release session.";
    }
    return "A conflicting release session already exists for this round.";
  }

  if (err.code === "23514" && err.message?.includes("duration")) {
    return "Round duration must be a whole number between 1 and 1,440 minutes.";
  }

  if (err.code === "42P01" || err.code === "PGRST205") {
    return "Stage 2C database migration 0007 has not been applied yet.";
  }

  if (err.code === "P0001" && err.message) {
    return err.message;
  }

  return fallback;
}

interface ReleaseRpcResult {
  operation: "released" | "reopened";
  session_id: string;
  session_number: number;
  duration_minutes: number;
  started_at: string;
  expires_at: string;
  round_status: string;
  is_locked: boolean;
}

interface CloseRpcResult {
  operation: "closed_manually" | "already_expired";
  session_id: string;
  session_number: number;
  closed_at: string;
  close_reason: "manual" | "expired";
  round_status: string;
  is_locked: boolean;
}

interface ReconcileRpcResult {
  reconciled: boolean;
  session_id?: string;
  session_number?: number;
  closed_at?: string;
  round_status: string;
}

export async function getDbServerTimestampAction(): Promise<
  { ok: true; timestampIso: string } | { ok: false; error: string }
> {
  try {
    await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "round.server_time_sync",
    });

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_db_server_timestamp");

    if (error || typeof data !== "string" || !Number.isFinite(Date.parse(data))) {
      return {
        ok: false,
        error: mapRoundReleaseDbError(
          error ?? {},
          "Unable to read authoritative database timestamp.",
        ),
      };
    }

    return { ok: true, timestampIso: data };
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, error: err.message };
    }
    return {
      ok: false,
      error: "Unexpected error while synchronising database clock.",
    };
  }
}

export async function configureRoundDurationAction(
  _prevState: CompetitionActionResult | null,
  formData: FormData,
): Promise<CompetitionActionResult> {
  try {
    await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "round.duration_configured",
    });

    const eventCheck = validateUuid(
      String(formData.get("eventId") ?? ""),
      "Event",
    );
    if (!eventCheck.ok) return { ok: false, message: eventCheck.error };

    const roundCheck = validateUuid(
      String(formData.get("roundId") ?? ""),
      "Round",
    );
    if (!roundCheck.ok) return { ok: false, message: roundCheck.error };

    const durationCheck = validateRoundDuration(
      String(formData.get("durationMinutes") ?? ""),
      { required: true },
    );
    if (!durationCheck.ok) return { ok: false, message: durationCheck.error };

    const supabase = await createSupabaseServerClient();

    const [
      { data: roundRow, error: roundErr },
      { data: existingSessions, error: sessionsErr },
    ] = await Promise.all([
      supabase
        .from("rounds")
        .select("id, event_id, round_number, status, duration_minutes")
        .eq("id", roundCheck.value)
        .eq("event_id", eventCheck.value)
        .maybeSingle<
          Pick<
            RoundRecord,
            "id" | "event_id" | "round_number" | "status" | "duration_minutes"
          >
        >(),
      supabase
        .from("round_release_sessions")
        .select("id")
        .eq("round_id", roundCheck.value)
        .eq("event_id", eventCheck.value)
        .limit(1),
    ]);

    if (roundErr) {
      return {
        ok: false,
        message: mapRoundReleaseDbError(
          roundErr,
          "Unable to load round for duration configuration.",
        ),
      };
    }

    if (!roundRow) {
      return { ok: false, message: "Round not found for the specified event." };
    }

    if (sessionsErr) {
      return {
        ok: false,
        message: mapRoundReleaseDbError(
          sessionsErr,
          "Unable to verify round release history before updating duration.",
        ),
      };
    }

    if ((existingSessions?.length ?? 0) > 0) {
      return {
        ok: false,
        message:
          "Round duration cannot be modified after release history exists. Override duration only when reopening the round.",
      };
    }

    if (roundRow.status === "archived" || roundRow.status === "completed") {
      return {
        ok: false,
        message: `Cannot configure release duration for a "${roundRow.status}" round.`,
      };
    }

    // Atomic duration update + audit log inside PostgreSQL RPC
    const { error: rpcErr } = await supabase.rpc("configure_round_duration", {
      p_event_id: eventCheck.value,
      p_round_id: roundCheck.value,
      p_duration_minutes: durationCheck.value,
    });

    if (rpcErr) {
      return {
        ok: false,
        message: mapRoundReleaseDbError(
          rpcErr,
          "Unable to update round duration.",
        ),
      };
    }

    revalidatePath(`/events/${eventCheck.value}`);
    revalidatePath(`/events/${eventCheck.value}/rounds/${roundCheck.value}`);

    return {
      ok: true,
      message: `Saved round duration: ${durationCheck.value} ${durationCheck.value === 1 ? "minute" : "minutes"}.`,
    };
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    return {
      ok: false,
      message: "Unexpected error while configuring round duration.",
    };
  }
}

export async function releaseRoundAction(
  _prevState: CompetitionActionResult | null,
  formData: FormData,
): Promise<CompetitionActionResult> {
  try {
    await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "round.released",
    });

    const eventCheck = validateUuid(
      String(formData.get("eventId") ?? ""),
      "Event",
    );
    if (!eventCheck.ok) return { ok: false, message: eventCheck.error };

    const roundCheck = validateUuid(
      String(formData.get("roundId") ?? ""),
      "Round",
    );
    if (!roundCheck.ok) return { ok: false, message: roundCheck.error };

    const rawDuration = String(formData.get("durationMinutes") ?? "").trim();
    let overrideDuration: number | null = null;
    if (rawDuration !== "") {
      const durationCheck = validateRoundDuration(rawDuration, {
        required: true,
      });
      if (!durationCheck.ok) return { ok: false, message: durationCheck.error };
      overrideDuration = durationCheck.value;
    }

    const notesRaw = String(formData.get("notes") ?? "").trim();
    const notes = notesRaw ? notesRaw.slice(0, 500) : null;

    const supabase = await createSupabaseServerClient();

    const [
      { data: eventRow, error: eventErr },
      { data: roundRow, error: roundErr },
      { data: existingSessions, error: sessionsErr },
    ] = await Promise.all([
      supabase
        .from("events")
        .select("id, status")
        .eq("id", eventCheck.value)
        .maybeSingle<Pick<EventRecord, "id" | "status">>(),
      supabase
        .from("rounds")
        .select("id, status, duration_minutes")
        .eq("id", roundCheck.value)
        .eq("event_id", eventCheck.value)
        .maybeSingle<Pick<RoundRecord, "id" | "status" | "duration_minutes">>(),
      supabase
        .from("round_release_sessions")
        .select("id")
        .eq("round_id", roundCheck.value)
        .eq("event_id", eventCheck.value)
        .limit(1),
    ]);

    if (eventErr) {
      return {
        ok: false,
        message: mapRoundReleaseDbError(
          eventErr,
          "Unable to verify parent event before releasing round.",
        ),
      };
    }

    if (roundErr) {
      return {
        ok: false,
        message: mapRoundReleaseDbError(
          roundErr,
          "Unable to load round details before release.",
        ),
      };
    }

    if (sessionsErr) {
      return {
        ok: false,
        message: mapRoundReleaseDbError(
          sessionsErr,
          "Unable to verify release history before releasing round.",
        ),
      };
    }

    if (!eventRow || !roundRow) {
      return {
        ok: false,
        message: "Event or round could not be found.",
      };
    }

    const eligibility = evaluateFirstReleaseEligibility({
      eventStatus: eventRow.status,
      round: roundRow,
      hasReleaseHistory: (existingSessions?.length ?? 0) > 0,
      overrideDurationMinutes: overrideDuration,
    });
    if (!eligibility.ok) {
      return { ok: false, message: eligibility.error };
    }

    const { data: rpcRaw, error: rpcErr } = await supabase.rpc(
      "release_round",
      {
        p_event_id: eventCheck.value,
        p_round_id: roundCheck.value,
        p_duration_minutes: overrideDuration,
        p_notes: notes,
      },
    );

    if (rpcErr || !rpcRaw) {
      return {
        ok: false,
        message: mapRoundReleaseDbError(
          rpcErr ?? {},
          "Unable to release round.",
        ),
      };
    }

    const result = rpcRaw as ReleaseRpcResult;
    revalidatePath(`/events/${eventCheck.value}`);
    revalidatePath(`/events/${eventCheck.value}/rounds/${roundCheck.value}`);

    return {
      ok: true,
      message: `Round released (Session #${result.session_number}, ${result.duration_minutes} min). Judging criteria are now locked.`,
    };
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    return { ok: false, message: "Unexpected error while releasing round." };
  }
}

export async function closeRoundReleaseAction(
  _prevState: CompetitionActionResult | null,
  formData: FormData,
): Promise<CompetitionActionResult> {
  try {
    await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "round.closed_manually",
    });

    const eventCheck = validateUuid(
      String(formData.get("eventId") ?? ""),
      "Event",
    );
    if (!eventCheck.ok) return { ok: false, message: eventCheck.error };

    const roundCheck = validateUuid(
      String(formData.get("roundId") ?? ""),
      "Round",
    );
    if (!roundCheck.ok) return { ok: false, message: roundCheck.error };

    const confirmed =
      formData.get("confirmClose") === "true" ||
      formData.get("confirmClose") === "on";
    if (!confirmed) {
      return {
        ok: false,
        message: "Please confirm before closing an active round early.",
      };
    }

    const notesRaw = String(formData.get("notes") ?? "").trim();
    const notes = notesRaw ? notesRaw.slice(0, 500) : null;

    const supabase = await createSupabaseServerClient();
    const { data: rpcRaw, error: rpcErr } = await supabase.rpc(
      "close_round_release",
      {
        p_event_id: eventCheck.value,
        p_round_id: roundCheck.value,
        p_notes: notes,
      },
    );

    if (rpcErr || !rpcRaw) {
      return {
        ok: false,
        message: mapRoundReleaseDbError(rpcErr ?? {}, "Unable to close round."),
      };
    }

    const result = rpcRaw as CloseRpcResult;
    revalidatePath(`/events/${eventCheck.value}`);
    revalidatePath(`/events/${eventCheck.value}/rounds/${roundCheck.value}`);

    if (result.operation === "already_expired") {
      return {
        ok: true,
        message: `Session #${result.session_number} had already expired automatically at ${new Date(result.closed_at).toLocaleString()}. Recorded expiry closure.`,
      };
    }

    return {
      ok: true,
      message: `Closed Session #${result.session_number} manually. Teams no longer have access to this round.`,
    };
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    return { ok: false, message: "Unexpected error while closing round." };
  }
}

export async function reopenRoundReleaseAction(
  _prevState: CompetitionActionResult | null,
  formData: FormData,
): Promise<CompetitionActionResult> {
  try {
    await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "round.reopened",
    });

    const eventCheck = validateUuid(
      String(formData.get("eventId") ?? ""),
      "Event",
    );
    if (!eventCheck.ok) return { ok: false, message: eventCheck.error };

    const roundCheck = validateUuid(
      String(formData.get("roundId") ?? ""),
      "Round",
    );
    if (!roundCheck.ok) return { ok: false, message: roundCheck.error };

    const confirmed =
      formData.get("confirmReopen") === "true" ||
      formData.get("confirmReopen") === "on";
    if (!confirmed) {
      return {
        ok: false,
        message:
          "Explicit confirmation is required before reopening a closed round.",
      };
    }

    const rawDuration = String(formData.get("durationMinutes") ?? "").trim();
    let overrideDuration: number | null = null;
    if (rawDuration !== "") {
      const durationCheck = validateRoundDuration(rawDuration, {
        required: true,
      });
      if (!durationCheck.ok) return { ok: false, message: durationCheck.error };
      overrideDuration = durationCheck.value;
    }

    const notesRaw = String(formData.get("notes") ?? "").trim();
    const notes = notesRaw ? notesRaw.slice(0, 500) : null;

    const supabase = await createSupabaseServerClient();

    const [
      { data: eventRow, error: eventErr },
      { data: roundRow, error: roundErr },
      { data: sessions, error: sessionsErr },
      { data: dbNowRaw, error: dbNowErr },
    ] = await Promise.all([
      supabase
        .from("events")
        .select("id, status")
        .eq("id", eventCheck.value)
        .maybeSingle<Pick<EventRecord, "id" | "status">>(),
      supabase
        .from("rounds")
        .select("id, status, duration_minutes, is_locked")
        .eq("id", roundCheck.value)
        .eq("event_id", eventCheck.value)
        .maybeSingle<
          Pick<RoundRecord, "id" | "status" | "duration_minutes" | "is_locked">
        >(),
      supabase
        .from("round_release_sessions")
        .select("*")
        .eq("round_id", roundCheck.value)
        .eq("event_id", eventCheck.value)
        .order("session_number", { ascending: false })
        .returns<RoundReleaseSessionRecord[]>(),
      supabase.rpc("get_db_server_timestamp"),
    ]);

    if (eventErr) {
      return {
        ok: false,
        message: mapRoundReleaseDbError(
          eventErr,
          "Unable to verify parent event before reopening round.",
        ),
      };
    }

    if (roundErr) {
      return {
        ok: false,
        message: mapRoundReleaseDbError(
          roundErr,
          "Unable to load round details before reopening.",
        ),
      };
    }

    if (sessionsErr) {
      return {
        ok: false,
        message: mapRoundReleaseDbError(
          sessionsErr,
          "Unable to load round release history before reopening.",
        ),
      };
    }

    if (dbNowErr || typeof dbNowRaw !== "string") {
      return {
        ok: false,
        message: mapRoundReleaseDbError(
          dbNowErr ?? {},
          "Unable to verify authoritative database timestamp before reopening round.",
        ),
      };
    }

    const dbNowMs = Date.parse(dbNowRaw);
    if (!Number.isFinite(dbNowMs)) {
      return {
        ok: false,
        message: "Received invalid database timestamp while verifying reopen eligibility.",
      };
    }

    if (!eventRow || !roundRow) {
      return { ok: false, message: "Event or round could not be found." };
    }

    const derived = deriveRoundReleaseState({
      round: roundRow,
      eventStatus: eventRow.status,
      sessions: sessions ?? [],
      dbNowMs,
    });

    const eligibility = evaluateReopenEligibility({
      eventStatus: eventRow.status,
      round: roundRow,
      effectiveState: derived.effectiveState,
      hasReleaseHistory: derived.sessionCount > 0,
      confirmReopen: confirmed,
      overrideDurationMinutes: overrideDuration,
    });
    if (!eligibility.ok) {
      return { ok: false, message: eligibility.error };
    }

    const { data: rpcRaw, error: rpcErr } = await supabase.rpc(
      "reopen_round_release",
      {
        p_event_id: eventCheck.value,
        p_round_id: roundCheck.value,
        p_confirm_reopen: true,
        p_duration_minutes: overrideDuration,
        p_notes: notes,
      },
    );

    if (rpcErr || !rpcRaw) {
      return {
        ok: false,
        message: mapRoundReleaseDbError(
          rpcErr ?? {},
          "Unable to reopen round.",
        ),
      };
    }

    const result = rpcRaw as ReleaseRpcResult;
    revalidatePath(`/events/${eventCheck.value}`);
    revalidatePath(`/events/${eventCheck.value}/rounds/${roundCheck.value}`);

    return {
      ok: true,
      message: `Reopened round as Session #${result.session_number} (${result.duration_minutes} min). All previous release history has been preserved.`,
    };
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    return { ok: false, message: "Unexpected error while reopening round." };
  }
}

export async function reconcileRoundExpiryAction(
  eventId: string,
  roundId: string,
): Promise<CompetitionActionResult> {
  try {
    await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "round.release_expired",
    });

    const eventCheck = validateUuid(eventId, "Event");
    if (!eventCheck.ok) return { ok: false, message: eventCheck.error };

    const roundCheck = validateUuid(roundId, "Round");
    if (!roundCheck.ok) return { ok: false, message: roundCheck.error };

    const supabase = await createSupabaseServerClient();
    const { data: rpcRaw, error: rpcErr } = await supabase.rpc(
      "reconcile_expired_round_release",
      {
        p_event_id: eventCheck.value,
        p_round_id: roundCheck.value,
      },
    );

    if (rpcErr || !rpcRaw) {
      return {
        ok: false,
        message: mapRoundReleaseDbError(
          rpcErr ?? {},
          "Unable to finalize expired round status.",
        ),
      };
    }

    const result = rpcRaw as ReconcileRpcResult;
    revalidatePath(`/events/${eventCheck.value}`);
    revalidatePath(`/events/${eventCheck.value}/rounds/${roundCheck.value}`);

    return {
      ok: true,
      message: result.reconciled
        ? `Recorded automatic expiry for Session #${result.session_number} at ${new Date(result.closed_at ?? "").toLocaleString()}.`
        : "No pending expired session required reconciliation.",
    };
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    return {
      ok: false,
      message: "Unexpected error while reconciling expired round.",
    };
  }
}
