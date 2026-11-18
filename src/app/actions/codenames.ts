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
import { validateUuid } from "@/lib/competition/validation";
import type {
  CodenameRecord,
  CodenameView,
  GenerateCodenamesResult,
} from "@/types/data-operations";
import type {
  ContingentRecord,
  EventEntryRecord,
  EventRecord,
  ParticipantRecord,
  RoundRecord,
} from "@/types/competition";

export const CODENAME_THEME_WORDS = [
  "SOLSTICE",
  "AURORA",
  "HELIOS",
  "APOLLO",
  "VALKYRIE",
  "ZEPHYR",
  "ORION",
  "PHOENIX",
  "TITAN",
  "BOREAS",
  "CHRONOS",
  "HYPERION",
  "ZENITH",
  "ECLIPSE",
  "SOLAR",
  "STELLAR",
  "NOVA",
  "VORTEX",
  "COSMOS",
  "LUNAR",
  "BLAZE",
  "COMET",
  "DRACO",
  "EMBER",
  "IGNIS",
  "LYRA",
  "METEOR",
  "NEBULA",
  "OMEGA",
  "PULSAR",
  "QUASAR",
  "RADIANT",
  "SIRIUS",
  "UMBRA",
  "VEGA",
  "ZODIAC",
] as const;

export function generateHumanReadableCodename(
  existingCodenamesLower: Set<string>,
  index: number,
  customPrefix?: string,
): string {
  const cleanPrefix = customPrefix?.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");

  if (cleanPrefix && cleanPrefix.length >= 2) {
    const candidate = `${cleanPrefix}-${String(index + 1).padStart(2, "0")}`;
    if (!existingCodenamesLower.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  // Iterate through themes and sequence numbers until an unused one is found
  for (let cycle = 0; cycle < 10; cycle++) {
    for (let w = 0; w < CODENAME_THEME_WORDS.length; w++) {
      const word = CODENAME_THEME_WORDS[(w + index) % CODENAME_THEME_WORDS.length];
      const num = index + 1 + cycle * CODENAME_THEME_WORDS.length;
      const candidate = `${word}-${String(num).padStart(2, "0")}`;
      if (!existingCodenamesLower.has(candidate.toLowerCase())) {
        return candidate;
      }
    }
  }

  // Fallback unique timestamp-based codename
  const fallback = `CODENAME-${Date.now().toString(36).toUpperCase()}`;
  return fallback;
}

export async function generateCodenamesAction(input: {
  eventId: string;
  roundId?: string | null;
  customPrefix?: string;
}): Promise<GenerateCodenamesResult> {
  try {
    const actor = await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "codename.generate",
    });

    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        message:
          "Codename generation requires SUPABASE_SERVICE_ROLE_KEY to be configured on the server for audit logging.",
        generatedCount: 0,
        skippedExistingCount: 0,
        codenames: [],
      };
    }

    const eventCheck = validateUuid(input.eventId, "Event");
    if (!eventCheck.ok) {
      return {
        ok: false,
        message: eventCheck.error,
        generatedCount: 0,
        skippedExistingCount: 0,
        codenames: [],
      };
    }

    const supabase = await createSupabaseServerClient();

    // Verify Event & Codename Mode
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventCheck.value)
      .maybeSingle<EventRecord>();

    if (eventError || !event) {
      return {
        ok: false,
        message: "Event not found.",
        generatedCount: 0,
        skippedExistingCount: 0,
        codenames: [],
      };
    }

    const isPerRound = event.codename_mode === "per_round";
    let targetRoundId: string | null = null;

    if (isPerRound) {
      if (!input.roundId) {
        return {
          ok: false,
          message:
            "This event is configured with per-round codename mode. Please select a specific round to generate codenames.",
          generatedCount: 0,
          skippedExistingCount: 0,
          codenames: [],
        };
      }
      const roundCheck = validateUuid(input.roundId, "Round");
      if (!roundCheck.ok) {
        return {
          ok: false,
          message: roundCheck.error,
          generatedCount: 0,
          skippedExistingCount: 0,
          codenames: [],
        };
      }
      targetRoundId = roundCheck.value;
    } else {
      targetRoundId = null; // event-wide
    }

    // Fetch active event entries
    const { data: entries, error: entriesError } = await supabase
      .from("event_entries")
      .select("*")
      .eq("event_id", event.id)
      .not("status", "in", '("withdrawn","disqualified")')
      .order("created_at", { ascending: true })
      .returns<EventEntryRecord[]>();

    if (entriesError || !entries || entries.length === 0) {
      return {
        ok: false,
        message: "No active event entries found to assign codenames to.",
        generatedCount: 0,
        skippedExistingCount: 0,
        codenames: [],
      };
    }

    // Fetch existing codenames in this scope
    let existingQuery = supabase
      .from("codenames")
      .select("*")
      .eq("event_id", event.id);

    if (isPerRound && targetRoundId) {
      existingQuery = existingQuery.eq("round_id", targetRoundId);
    } else {
      existingQuery = existingQuery.is("round_id", null);
    }

    const { data: existingCodenames } = await existingQuery.returns<
      CodenameRecord[]
    >();

    const existingByEntryId = new Map<string, string>();
    const existingCodenamesLower = new Set<string>();

    for (const cn of existingCodenames ?? []) {
      existingByEntryId.set(cn.event_entry_id, cn.codename);
      existingCodenamesLower.add(cn.codename.toLowerCase().trim());
    }

    let generatedCount = 0;
    let skippedExistingCount = 0;
    const generatedList: { entryId: string; codename: string }[] = [];

    // Assign codenames for entries that do not have one yet (CRITICAL: preserve existing codenames!)
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (existingByEntryId.has(entry.id)) {
        skippedExistingCount++;
        generatedList.push({
          entryId: entry.id,
          codename: existingByEntryId.get(entry.id)!,
        });
        continue;
      }

      // Generate a new human-readable codename
      const newCodename = generateHumanReadableCodename(
        existingCodenamesLower,
        i,
        input.customPrefix,
      );
      existingCodenamesLower.add(newCodename.toLowerCase());

      // Safe concurrency insert with retry on conflict
      let inserted = false;
      let attempt = 0;
      let candidate = newCodename;

      while (!inserted && attempt < 5) {
        attempt++;
        const { error: insertError } = await supabase.from("codenames").insert({
          event_id: event.id,
          round_id: targetRoundId,
          event_entry_id: entry.id,
          codename: candidate,
          assigned_by: actor.userId,
        });

        if (!insertError) {
          inserted = true;
          generatedCount++;
          generatedList.push({ entryId: entry.id, codename: candidate });
        } else if (insertError.code === "23505") {
          // Unique violation (e.g. concurrent generation) -> generate another candidate and retry
          candidate = `${candidate}-${attempt}`;
          existingCodenamesLower.add(candidate.toLowerCase());
        } else {
          break;
        }
      }
    }

    await recordAuditLog({
      actorUserId: actor.userId,
      actorEmail: actor.profile.email,
      action: "codename.generated",
      entityType: "event",
      entityId: event.id,
      metadata: {
        eventName: event.name,
        codenameMode: event.codename_mode,
        roundId: targetRoundId,
        generatedCount,
        skippedExistingCount,
      },
    });

    revalidatePath(`/events/${event.id}`);
    if (targetRoundId) {
      revalidatePath(`/events/${event.id}/rounds/${targetRoundId}`);
    }

    return {
      ok: true,
      message: `Codename generation complete. Generated ${generatedCount} new codename(s); preserved ${skippedExistingCount} existing assignment(s).`,
      generatedCount,
      skippedExistingCount,
      codenames: generatedList,
    };
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return {
        ok: false,
        message: err.message,
        generatedCount: 0,
        skippedExistingCount: 0,
        codenames: [],
      };
    }
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : "Unexpected error generating codenames.",
      generatedCount: 0,
      skippedExistingCount: 0,
      codenames: [],
    };
  }
}

export async function assignCodenameAction(input: {
  eventId: string;
  roundId?: string | null;
  eventEntryId: string;
  codename: string;
}): Promise<{ ok: boolean; message: string }> {
  try {
    const actor = await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "codename.assign",
    });

    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        message:
          "Codename assignment requires SUPABASE_SERVICE_ROLE_KEY to be configured on the server.",
      };
    }

    const eventCheck = validateUuid(input.eventId, "Event");
    if (!eventCheck.ok) return { ok: false, message: eventCheck.error };

    const entryCheck = validateUuid(input.eventEntryId, "Event Entry");
    if (!entryCheck.ok) return { ok: false, message: entryCheck.error };

    const trimmedCodename = input.codename.trim().toUpperCase();
    if (trimmedCodename.length < 2 || trimmedCodename.length > 60) {
      return {
        ok: false,
        message: "Codename must be between 2 and 60 characters.",
      };
    }

    const supabase = await createSupabaseServerClient();

    // Verify Event & Scope
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, codename_mode")
      .eq("id", eventCheck.value)
      .maybeSingle<EventRecord>();

    if (eventError || !event) {
      return { ok: false, message: "Event not found." };
    }

    const isPerRound = event.codename_mode === "per_round";
    let targetRoundId: string | null = null;
    if (isPerRound) {
      if (!input.roundId) {
        return {
          ok: false,
          message: "Per-round codename mode requires a valid roundId.",
        };
      }
      const roundCheck = validateUuid(input.roundId, "Round");
      if (!roundCheck.ok) return { ok: false, message: roundCheck.error };
      targetRoundId = roundCheck.value;
    }

    // Check if codename is already taken by another entry in this scope
    let collisionQuery = supabase
      .from("codenames")
      .select("id, event_entry_id")
      .eq("event_id", event.id)
      .ilike("codename", trimmedCodename);

    if (isPerRound && targetRoundId) {
      collisionQuery = collisionQuery.eq("round_id", targetRoundId);
    } else {
      collisionQuery = collisionQuery.is("round_id", null);
    }

    const { data: existingCollisions } = await collisionQuery;
    const collision = existingCollisions?.find(
      (c) => c.event_entry_id !== entryCheck.value,
    );
    if (collision) {
      return {
        ok: false,
        message: `The codename "${trimmedCodename}" is already assigned to another entry in this ${isPerRound ? "round" : "event"}.`,
      };
    }

    // Check if entry already has a codename row in this scope
    let existingEntryQuery = supabase
      .from("codenames")
      .select("*")
      .eq("event_id", event.id)
      .eq("event_entry_id", entryCheck.value);

    if (isPerRound && targetRoundId) {
      existingEntryQuery = existingEntryQuery.eq("round_id", targetRoundId);
    } else {
      existingEntryQuery = existingEntryQuery.is("round_id", null);
    }

    const { data: existingRow } = await existingEntryQuery.maybeSingle<CodenameRecord>();

    if (existingRow) {
      // Update existing
      const { error: updateError } = await supabase
        .from("codenames")
        .update({
          codename: trimmedCodename,
          assigned_by: actor.userId,
        })
        .eq("id", existingRow.id);

      if (updateError) {
        return {
          ok: false,
          message: "Unable to update codename. Please check for duplicates.",
        };
      }

      await recordAuditLog({
        actorUserId: actor.userId,
        actorEmail: actor.profile.email,
        action: "codename.reassigned",
        entityType: "codename",
        entityId: existingRow.id,
        beforeData: { codename: existingRow.codename },
        afterData: { codename: trimmedCodename },
      });
    } else {
      // Insert new
      const { data: inserted, error: insertError } = await supabase
        .from("codenames")
        .insert({
          event_id: event.id,
          round_id: targetRoundId,
          event_entry_id: entryCheck.value,
          codename: trimmedCodename,
          assigned_by: actor.userId,
        })
        .select("id")
        .single<{ id: string }>();

      if (insertError) {
        return {
          ok: false,
          message: "Unable to assign codename. Please check for duplicates.",
        };
      }

      await recordAuditLog({
        actorUserId: actor.userId,
        actorEmail: actor.profile.email,
        action: "codename.assigned",
        entityType: "codename",
        entityId: inserted.id,
        afterData: { codename: trimmedCodename },
      });
    }

    revalidatePath(`/events/${event.id}`);
    if (targetRoundId) {
      revalidatePath(`/events/${event.id}/rounds/${targetRoundId}`);
    }

    return {
      ok: true,
      message: `Codename "${trimmedCodename}" successfully assigned.`,
    };
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Failed to assign codename.",
    };
  }
}

export async function getCodenamesForEventAction(
  eventId: string,
  roundId?: string | null,
): Promise<CodenameView[]> {
  try {
    await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "codename.list",
    });

    const eventCheck = validateUuid(eventId, "Event");
    if (!eventCheck.ok) return [];

    const supabase = await createSupabaseServerClient();

    let query = supabase
      .from("codenames")
      .select(
        `
        id,
        event_id,
        round_id,
        event_entry_id,
        codename,
        assigned_by,
        created_at,
        updated_at
      `,
      )
      .eq("event_id", eventCheck.value)
      .order("created_at", { ascending: true });

    if (roundId) {
      query = query.eq("round_id", roundId);
    }

    const { data: codenames, error } = await query.returns<CodenameRecord[]>();
    if (error || !codenames) return [];

    // Fetch related entries, contingents, participants for human-readable organizer view
    const entryIds = codenames.map((c) => c.event_entry_id);
    const { data: entries } = await supabase
      .from("event_entries")
      .select("id, entry_type, status, contingent_id, participant_id")
      .in("id", entryIds)
      .returns<EventEntryRecord[]>();

    const contingentIds = (entries ?? [])
      .map((e) => e.contingent_id)
      .filter(Boolean) as string[];
    const participantIds = (entries ?? [])
      .map((e) => e.participant_id)
      .filter(Boolean) as string[];

    const [{ data: contingents }, { data: participants }] = await Promise.all([
      contingentIds.length > 0
        ? supabase
            .from("contingents")
            .select("id, contingent_code, name, institution_name")
            .in("id", contingentIds)
            .returns<
              Pick<
                ContingentRecord,
                "id" | "contingent_code" | "name" | "institution_name"
              >[]
            >()
        : Promise.resolve({ data: [] }),
      participantIds.length > 0
        ? supabase
            .from("participants")
            .select("id, participant_code, full_name, institution_name")
            .in("id", participantIds)
            .returns<
              Pick<
                ParticipantRecord,
                "id" | "participant_code" | "full_name" | "institution_name"
              >[]
            >()
        : Promise.resolve({ data: [] }),
    ]);

    const contingentMap = new Map((contingents ?? []).map((c) => [c.id, c]));
    const participantMap = new Map((participants ?? []).map((p) => [p.id, p]));
    const entryMap = new Map(
      (entries ?? []).map((e) => [
        e.id,
        {
          id: e.id,
          entry_type: e.entry_type,
          status: e.status,
          contingent: e.contingent_id ? contingentMap.get(e.contingent_id) ?? null : null,
          participant: e.participant_id ? participantMap.get(e.participant_id) ?? null : null,
        },
      ]),
    );

    return codenames.map((cn) => ({
      ...cn,
      entry: entryMap.get(cn.event_entry_id) ?? null,
    }));
  } catch {
    return [];
  }
}
