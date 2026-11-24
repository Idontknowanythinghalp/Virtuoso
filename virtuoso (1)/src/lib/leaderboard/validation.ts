import {
  validateUuid,
  type ValidationResult,
} from "@/lib/competition/validation";
import type { EventStatus } from "@/types/competition";

export const MIN_LEADERBOARD_POSITION = 1;
export const MAX_LEADERBOARD_POSITION = 10000;
export const MAX_LEADERBOARD_DISPLAY_VALUE_LENGTH = 120;
export const MAX_LEADERBOARD_NOTES_LENGTH = 500;

export type LeaderboardLoadErrorKind =
  | "none"
  | "migration_missing"
  | "load_error";

export function classifyLeaderboardLoadError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): LeaderboardLoadErrorKind {
  if (!error) return "none";
  const code = (error.code ?? "").trim().toUpperCase();
  if (code === "42P01" || code === "PGRST205") {
    return "migration_missing";
  }
  return "load_error";
}

export function validateLeaderboardPosition(
  raw: string | number,
): ValidationResult<number> {
  const normalized =
    typeof raw === "number" ? String(raw) : String(raw ?? "").trim();

  if (!normalized || !/^\d+$/.test(normalized)) {
    return {
      ok: false,
      error: `Position must be a whole number between ${MIN_LEADERBOARD_POSITION} and ${MAX_LEADERBOARD_POSITION.toLocaleString("en-US")}.`,
    };
  }

  const parsed = Number.parseInt(normalized, 10);
  if (
    !Number.isInteger(parsed) ||
    parsed < MIN_LEADERBOARD_POSITION ||
    parsed > MAX_LEADERBOARD_POSITION
  ) {
    return {
      ok: false,
      error: `Position must be between ${MIN_LEADERBOARD_POSITION} and ${MAX_LEADERBOARD_POSITION.toLocaleString("en-US")}.`,
    };
  }

  return { ok: true, value: parsed };
}

export function validateLeaderboardDisplayValue(
  raw: string,
): ValidationResult<string> {
  const cleaned = String(raw ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return {
      ok: false,
      error:
        'Displayed score or result value is required (for example, "950 points" or "₹12,500").',
    };
  }

  if (cleaned.length > MAX_LEADERBOARD_DISPLAY_VALUE_LENGTH) {
    return {
      ok: false,
      error: `Displayed score or result value cannot exceed ${MAX_LEADERBOARD_DISPLAY_VALUE_LENGTH} characters.`,
    };
  }

  return { ok: true, value: cleaned };
}

export interface ValidatedLeaderboardCreateInput {
  eventId: string;
  contingentId: string;
  position: number;
  displayValue: string;
  notes: string | null;
}

export function validateOptionalNotes(
  raw: string | null | undefined,
): ValidationResult<string | null> {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    return { ok: true, value: null };
  }
  if (trimmed.length > MAX_LEADERBOARD_NOTES_LENGTH) {
    return {
      ok: false,
      error: `Notes cannot exceed ${MAX_LEADERBOARD_NOTES_LENGTH} characters.`,
    };
  }
  return { ok: true, value: trimmed };
}

export function validateLeaderboardCreateInput(input: {
  eventId: string;
  contingentId: string;
  position: string | number;
  displayValue: string;
  notes?: string | null;
}): ValidationResult<ValidatedLeaderboardCreateInput> {
  const eventCheck = validateUuid(input.eventId, "Event");
  if (!eventCheck.ok) return eventCheck;

  const contingentCheck = validateUuid(input.contingentId, "Contingent");
  if (!contingentCheck.ok) return contingentCheck;

  const positionCheck = validateLeaderboardPosition(input.position);
  if (!positionCheck.ok) return positionCheck;

  const valueCheck = validateLeaderboardDisplayValue(input.displayValue);
  if (!valueCheck.ok) return valueCheck;

  const notesCheck = validateOptionalNotes(input.notes);
  if (!notesCheck.ok) return notesCheck;

  return {
    ok: true,
    value: {
      eventId: eventCheck.value,
      contingentId: contingentCheck.value,
      position: positionCheck.value,
      displayValue: valueCheck.value,
      notes: notesCheck.value,
    },
  };
}

export interface ValidatedLeaderboardUpdateInput {
  eventId: string;
  entryId: string;
  position: number;
  displayValue: string;
  notes: string | null;
}

export function validateLeaderboardUpdateInput(input: {
  eventId: string;
  entryId: string;
  position: string | number;
  displayValue: string;
  notes?: string | null;
}): ValidationResult<ValidatedLeaderboardUpdateInput> {
  const eventCheck = validateUuid(input.eventId, "Event");
  if (!eventCheck.ok) return eventCheck;

  const entryCheck = validateUuid(input.entryId, "Leaderboard entry");
  if (!entryCheck.ok) return entryCheck;

  const positionCheck = validateLeaderboardPosition(input.position);
  if (!positionCheck.ok) return positionCheck;

  const valueCheck = validateLeaderboardDisplayValue(input.displayValue);
  if (!valueCheck.ok) return valueCheck;

  const notesCheck = validateOptionalNotes(input.notes);
  if (!notesCheck.ok) return notesCheck;

  return {
    ok: true,
    value: {
      eventId: eventCheck.value,
      entryId: entryCheck.value,
      position: positionCheck.value,
      displayValue: valueCheck.value,
      notes: notesCheck.value,
    },
  };
}

export function sortLeaderboardEntries<
  T extends { position: number; created_at?: string; id?: string },
>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => {
    if (a.position !== b.position) {
      return a.position - b.position;
    }
    const createdCmp = (a.created_at ?? "").localeCompare(b.created_at ?? "");
    if (createdCmp !== 0) {
      return createdCmp;
    }
    return (a.id ?? "").localeCompare(b.id ?? "");
  });
}

export function countPositionOccurrences(
  entries: readonly { position: number }[],
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const entry of entries) {
    counts.set(entry.position, (counts.get(entry.position) ?? 0) + 1);
  }
  return counts;
}

export function isLeaderboardEventReadOnly(status: EventStatus): boolean {
  return status === "archived";
}
