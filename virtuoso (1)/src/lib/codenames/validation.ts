import { validateUuid, type ValidationResult } from "@/lib/competition/validation";
import { generateUniqueCodename } from "@/lib/codenames/generator";
import type {
  CodenameMode,
  EntryCodenameRecord,
  EventEntryRecord,
  EventEntryStatus,
  EventRecord,
  RoundRecord,
  RoundStatus,
} from "@/types/competition";

const CODENAME_FORMAT_REGEX = /^[A-Z0-9][A-Z0-9-]{2,38}[A-Z0-9]$/;

export function normalizeCodename(raw: string): string {
  return raw.trim().toUpperCase();
}

export type CodenameLoadErrorKind = "none" | "migration_missing" | "load_error";

export function classifyCodenameLoadError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): CodenameLoadErrorKind {
  if (!error) return "none";
  const code = (error.code ?? "").trim().toUpperCase();
  if (code === "42P01" || code === "PGRST205") {
    return "migration_missing";
  }
  return "load_error";
}

export function validateManualCodename(raw: string): ValidationResult<string> {
  const normalized = normalizeCodename(raw);
  if (normalized.length < 4 || normalized.length > 40) {
    return {
      ok: false,
      error: "Codename must be between 4 and 40 characters.",
    };
  }
  if (!CODENAME_FORMAT_REGEX.test(normalized) || normalized.includes("--")) {
    return {
      ok: false,
      error:
        "Codename may only contain letters, numbers, and single hyphens (e.g. AMBER-FALCON-24).",
    };
  }
  return { ok: true, value: normalized };
}

export function isEntryEligibleForCodenameGeneration(
  status: EventEntryStatus,
): boolean {
  return status === "registered" || status === "checked_in";
}

export interface ValidatedCodenameScope {
  codenameMode: CodenameMode;
  roundId: string | null;
}

export function validateCodenameScope(params: {
  eventId: string;
  codenameMode: string;
  eventStatus: string;
  roundId: string | null | undefined;
  round?: {
    id: string;
    event_id: string;
    status: RoundStatus;
  } | null;
}): ValidationResult<ValidatedCodenameScope> {
  const eventCheck = validateUuid(params.eventId, "Event");
  if (!eventCheck.ok) return eventCheck;

  if (params.eventStatus === "archived") {
    return {
      ok: false,
      error: "Cannot assign or modify codenames for an archived event.",
    };
  }

  if (
    params.codenameMode !== "event_wide" &&
    params.codenameMode !== "per_round"
  ) {
    return {
      ok: false,
      error: `Invalid event codename mode "${params.codenameMode}".`,
    };
  }

  const trimmedRoundId = params.roundId?.trim() || null;

  if (params.codenameMode === "event_wide") {
    if (trimmedRoundId !== null) {
      return {
        ok: false,
        error:
          "This event uses Event-Wide codenames; round-specific assignments are not allowed.",
      };
    }
    return {
      ok: true,
      value: { codenameMode: "event_wide", roundId: null },
    };
  }

  // per_round mode
  if (!trimmedRoundId) {
    return {
      ok: false,
      error:
        "This event uses Per-Round codenames; select a round before assigning codenames.",
    };
  }

  const roundCheck = validateUuid(trimmedRoundId, "Round");
  if (!roundCheck.ok) return roundCheck;

  if (!params.round || params.round.id !== roundCheck.value) {
    return {
      ok: false,
      error: "Selected round was not found for this event.",
    };
  }

  if (params.round.event_id !== eventCheck.value) {
    return {
      ok: false,
      error: "Selected round does not belong to this event.",
    };
  }

  if (params.round.status === "archived") {
    return {
      ok: false,
      error: "Cannot assign or modify codenames for an archived round.",
    };
  }

  return {
    ok: true,
    value: { codenameMode: "per_round", roundId: roundCheck.value },
  };
}

export interface PlannedCodenameAssignment {
  event_entry_id: string;
  codename: string;
}

export type PlanMissingCodenamesResult =
  | {
      ok: true;
      scope: ValidatedCodenameScope;
      assignmentsToInsert: PlannedCodenameAssignment[];
      skippedAlreadyAssignedCount: number;
      skippedIneligibleCount: number;
    }
  | {
      ok: false;
      error: string;
    };

export function planMissingCodenameAssignments(params: {
  event: Pick<EventRecord, "id" | "codename_mode" | "status">;
  round?: Pick<RoundRecord, "id" | "event_id" | "status"> | null;
  entries: readonly Pick<EventEntryRecord, "id" | "event_id" | "status">[];
  existingAssignments: readonly Pick<
    EntryCodenameRecord,
    "event_id" | "event_entry_id" | "round_id" | "codename"
  >[];
  generateCandidate?: (existingUpperSet: ReadonlySet<string>) => string;
}): PlanMissingCodenamesResult {
  const scopeCheck = validateCodenameScope({
    eventId: params.event.id,
    codenameMode: params.event.codename_mode,
    eventStatus: params.event.status,
    roundId: params.round?.id ?? null,
    round: params.round ?? null,
  });

  if (!scopeCheck.ok) {
    return { ok: false, error: scopeCheck.error };
  }

  const targetRoundId = scopeCheck.value.roundId;
  const assignedEntryIds = new Set<string>();
  const usedCodenamesUpper = new Set<string>();

  for (const row of params.existingAssignments) {
    if (row.event_id !== params.event.id) continue;
    if ((row.round_id ?? null) !== targetRoundId) continue;
    assignedEntryIds.add(row.event_entry_id);
    usedCodenamesUpper.add(normalizeCodename(row.codename));
  }

  const candidateFn =
    params.generateCandidate ??
    ((used: ReadonlySet<string>) => generateUniqueCodename(used));

  const assignmentsToInsert: PlannedCodenameAssignment[] = [];
  let skippedAlreadyAssignedCount = 0;
  let skippedIneligibleCount = 0;

  for (const entry of params.entries) {
    if (entry.event_id !== params.event.id) {
      return {
        ok: false,
        error: "Cross-event entry detected during codename assignment planning.",
      };
    }

    if (assignedEntryIds.has(entry.id)) {
      skippedAlreadyAssignedCount += 1;
      continue;
    }

    if (!isEntryEligibleForCodenameGeneration(entry.status)) {
      skippedIneligibleCount += 1;
      continue;
    }

    let chosen: string | null = null;
    try {
      for (let attempt = 0; attempt < 25; attempt += 1) {
        const candidate = normalizeCodename(candidateFn(usedCodenamesUpper));
        const valid = validateManualCodename(candidate);
        if (valid.ok && !usedCodenamesUpper.has(valid.value)) {
          chosen = valid.value;
          break;
        }
      }
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error && err.message.trim()
            ? err.message
            : "Unable to generate a unique codename without collision. Please retry.",
      };
    }

    if (!chosen) {
      return {
        ok: false,
        error:
          "Unable to allocate a unique codename without collision. Please retry.",
      };
    }

    usedCodenamesUpper.add(chosen);
    assignmentsToInsert.push({
      event_entry_id: entry.id,
      codename: chosen,
    });
  }

  return {
    ok: true,
    scope: scopeCheck.value,
    assignmentsToInsert,
    skippedAlreadyAssignedCount,
    skippedIneligibleCount,
  };
}
