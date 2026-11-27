import {
  validateUuid,
  type ValidationResult,
} from "@/lib/competition/validation";
import type {
  EventEntryMode,
  EventStatus,
  LeaderboardPublicationRecord,
  LeaderboardPublicationState,
} from "@/types/competition";

export const MIN_LEADERBOARD_SCORE = -1_000_000_000;
export const MAX_LEADERBOARD_SCORE = 1_000_000_000;
export const MAX_LEADERBOARD_SCORE_DECIMALS = 4;
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

const STRICT_NUMERIC_SCORE_REGEX = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;

/**
 * Validates numeric-only leaderboard scores (decimals up to 4 places allowed;
 * blank/empty input maps cleanly to `null` for unranked teams).
 */
export function validateLeaderboardScore(
  raw: string | number | null | undefined,
): ValidationResult<number | null> {
  if (raw === null || raw === undefined) {
    return { ok: true, value: null };
  }

  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) {
      return {
        ok: false,
        error: "Score must be a valid finite number.",
      };
    }
    if (raw < MIN_LEADERBOARD_SCORE || raw > MAX_LEADERBOARD_SCORE) {
      return {
        ok: false,
        error: `Score must be between ${MIN_LEADERBOARD_SCORE.toLocaleString("en-US")} and ${MAX_LEADERBOARD_SCORE.toLocaleString("en-US")}.`,
      };
    }
    const normalized = raw === 0 ? 0 : raw;
    const str = String(normalized);
    if (!STRICT_NUMERIC_SCORE_REGEX.test(str)) {
      return {
        ok: false,
        error: "Score must be a standard decimal number (up to 4 decimal places).",
      };
    }
    const decimalPart = str.split(".")[1] ?? "";
    if (decimalPart.length > MAX_LEADERBOARD_SCORE_DECIMALS) {
      return {
        ok: false,
        error: `Score cannot have more than ${MAX_LEADERBOARD_SCORE_DECIMALS} decimal places.`,
      };
    }
    return { ok: true, value: normalized };
  }

  const trimmed = String(raw).trim();
  if (!trimmed) {
    return { ok: true, value: null };
  }

  if (!STRICT_NUMERIC_SCORE_REGEX.test(trimmed)) {
    return {
      ok: false,
      error:
        "Score must contain numbers only (decimals allowed, e.g. 95 or 95.5). Do not include units or text.",
    };
  }

  const decimalPart = trimmed.split(".")[1] ?? "";
  if (decimalPart.length > MAX_LEADERBOARD_SCORE_DECIMALS) {
    return {
      ok: false,
      error: `Score cannot have more than ${MAX_LEADERBOARD_SCORE_DECIMALS} decimal places.`,
    };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return {
      ok: false,
      error: "Score must be a valid finite number.",
    };
  }

  if (parsed < MIN_LEADERBOARD_SCORE || parsed > MAX_LEADERBOARD_SCORE) {
    return {
      ok: false,
      error: `Score must be between ${MIN_LEADERBOARD_SCORE.toLocaleString("en-US")} and ${MAX_LEADERBOARD_SCORE.toLocaleString("en-US")}.`,
    };
  }

  return { ok: true, value: parsed === 0 ? 0 : parsed };
}

export function normalizeNumericScore(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) {
    return null;
  }
  return num === 0 ? 0 : num;
}

export function formatLeaderboardScore(
  score: number | null | undefined,
): string {
  if (score === null || score === undefined || !Number.isFinite(score)) {
    return "No score";
  }
  return (score === 0 ? 0 : score).toLocaleString("en-US", {
    maximumFractionDigits: MAX_LEADERBOARD_SCORE_DECIMALS,
  });
}

export function formatLeaderboardScoreInput(
  score: number | null | undefined,
): string {
  if (score === null || score === undefined || !Number.isFinite(score)) {
    return "";
  }
  return String(score === 0 ? 0 : score);
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

export interface ValidatedNumericLeaderboardCreateInput {
  eventId: string;
  contingentId: string;
  score: number | null;
  notes: string | null;
}

export function validateLeaderboardCreateInput(input: {
  eventId: string;
  contingentId: string;
  score: string | number | null | undefined;
  notes?: string | null;
}): ValidationResult<ValidatedNumericLeaderboardCreateInput> {
  const eventCheck = validateUuid(input.eventId, "Event");
  if (!eventCheck.ok) return eventCheck;

  const contingentCheck = validateUuid(input.contingentId, "Contingent");
  if (!contingentCheck.ok) return contingentCheck;

  const scoreCheck = validateLeaderboardScore(input.score);
  if (!scoreCheck.ok) return scoreCheck;

  const notesCheck = validateOptionalNotes(input.notes);
  if (!notesCheck.ok) return notesCheck;

  return {
    ok: true,
    value: {
      eventId: eventCheck.value,
      contingentId: contingentCheck.value,
      score: scoreCheck.value,
      notes: notesCheck.value,
    },
  };
}

export interface ValidatedNumericLeaderboardUpdateInput {
  eventId: string;
  entryId: string;
  score: number | null;
  notes: string | null;
}

export function validateLeaderboardUpdateInput(input: {
  eventId: string;
  entryId: string;
  score: string | number | null | undefined;
  notes?: string | null;
}): ValidationResult<ValidatedNumericLeaderboardUpdateInput> {
  const eventCheck = validateUuid(input.eventId, "Event");
  if (!eventCheck.ok) return eventCheck;

  const entryCheck = validateUuid(input.entryId, "Leaderboard entry");
  if (!entryCheck.ok) return entryCheck;

  const scoreCheck = validateLeaderboardScore(input.score);
  if (!scoreCheck.ok) return scoreCheck;

  const notesCheck = validateOptionalNotes(input.notes);
  if (!notesCheck.ok) return notesCheck;

  return {
    ok: true,
    value: {
      eventId: eventCheck.value,
      entryId: entryCheck.value,
      score: scoreCheck.value,
      notes: notesCheck.value,
    },
  };
}

export interface RankableLeaderboardEntry {
  id?: string;
  score: number | null;
  contingentCode?: string | null;
  contingent?: { contingent_code?: string | null } | null;
  created_at?: string;
}

function getSortableContingentCode(entry: RankableLeaderboardEntry): string {
  return (
    entry.contingentCode ??
    entry.contingent?.contingent_code ??
    ""
  ).trim();
}

/**
 * Sorts numeric leaderboard entries (highest score first, unscored teams last)
 * and calculates automatic standard competition rankings (1, 1, 3).
 *
 * Unscored teams (`score === null`) remain unranked (`calculatedRank = null`).
 */
export function calculateCompetitionRankings<
  T extends RankableLeaderboardEntry,
>(entries: readonly T[]): Array<T & { calculatedRank: number | null }> {
  const sorted = [...entries].sort((a, b) => {
    const aHasScore = a.score !== null && Number.isFinite(a.score);
    const bHasScore = b.score !== null && Number.isFinite(b.score);

    if (aHasScore !== bHasScore) {
      return aHasScore ? -1 : 1;
    }

    if (aHasScore && bHasScore && a.score !== b.score) {
      return (b.score as number) - (a.score as number);
    }

    const codeCmp = getSortableContingentCode(a).localeCompare(
      getSortableContingentCode(b),
    );
    if (codeCmp !== 0) {
      return codeCmp;
    }

    const createdCmp = (a.created_at ?? "").localeCompare(b.created_at ?? "");
    if (createdCmp !== 0) {
      return createdCmp;
    }

    return (a.id ?? "").localeCompare(b.id ?? "");
  });

  let scoredIndex = 0;
  let lastScore: number | null = null;
  let lastRank = 0;

  return sorted.map((entry) => {
    const normalizedScore = normalizeNumericScore(entry.score);
    if (normalizedScore === null) {
      return {
        ...entry,
        score: null,
        calculatedRank: null,
      };
    }

    scoredIndex += 1;
    const rank =
      lastScore !== null && normalizedScore === lastScore
        ? lastRank
        : scoredIndex;

    lastScore = normalizedScore;
    lastRank = rank;

    return {
      ...entry,
      score: normalizedScore,
      calculatedRank: rank,
    };
  });
}

export function sortPublishedLeaderboardRows<
  T extends {
    id?: string;
    rank: number | null;
    score: number | null;
    contingentCode?: string | null;
    created_at?: string;
  },
>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => {
    const aRanked = a.rank !== null && Number.isFinite(a.rank);
    const bRanked = b.rank !== null && Number.isFinite(b.rank);

    if (aRanked !== bRanked) {
      return aRanked ? -1 : 1;
    }

    if (aRanked && bRanked && a.rank !== b.rank) {
      return (a.rank as number) - (b.rank as number);
    }

    const aHasScore = a.score !== null && Number.isFinite(a.score);
    const bHasScore = b.score !== null && Number.isFinite(b.score);
    if (aHasScore !== bHasScore) {
      return aHasScore ? -1 : 1;
    }
    if (aHasScore && bHasScore && a.score !== b.score) {
      return (b.score as number) - (a.score as number);
    }

    const codeCmp = (a.contingentCode ?? "").localeCompare(
      b.contingentCode ?? "",
    );
    if (codeCmp !== 0) {
      return codeCmp;
    }

    const createdCmp = (a.created_at ?? "").localeCompare(b.created_at ?? "");
    if (createdCmp !== 0) {
      return createdCmp;
    }

    return (a.id ?? "").localeCompare(b.id ?? "");
  });
}

export function countRankOccurrences(
  entries: readonly { rank?: number | null; calculatedRank?: number | null }[],
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const entry of entries) {
    const rank =
      entry.calculatedRank !== undefined ? entry.calculatedRank : entry.rank;
    if (rank === null || rank === undefined || !Number.isFinite(rank)) {
      continue;
    }
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }
  return counts;
}

export function haveDraftAndPublishedDiverged(params: {
  isPublished: boolean;
  draftEntries: readonly {
    contingent_id: string;
    score: number | null;
    calculatedRank: number | null;
    display_value?: string | null;
  }[];
  publishedEntries: readonly {
    contingent_id: string;
    score: number | null;
    rank: number | null;
    display_label?: string | null;
  }[];
}): boolean {
  if (!params.isPublished) {
    return params.draftEntries.length > 0;
  }

  if (
    params.draftEntries.some(
      (d) => d.score === null && Boolean(d.display_value?.trim()),
    )
  ) {
    return true;
  }

  if (params.draftEntries.length !== params.publishedEntries.length) {
    return true;
  }

  const draftByContingent = new Map(
    params.draftEntries.map((d) => [
      d.contingent_id.toLowerCase(),
      {
        score: normalizeNumericScore(d.score),
        rank: d.calculatedRank,
      },
    ]),
  );

  for (const pub of params.publishedEntries) {
    const draft = draftByContingent.get(pub.contingent_id.toLowerCase());
    if (!draft) {
      return true;
    }
    if (Boolean(pub.display_label?.trim())) {
      return true;
    }
    if (draft.score !== normalizeNumericScore(pub.score)) {
      return true;
    }
    if (draft.rank !== (pub.rank ?? null)) {
      return true;
    }
  }

  return false;
}

export function isLeaderboardEventReadOnly(status: EventStatus): boolean {
  return status === "archived";
}

export function toLeaderboardPublicationState(
  record: Pick<
    LeaderboardPublicationRecord,
    | "is_published"
    | "published_at"
    | "published_by"
    | "unpublished_at"
    | "unpublished_by"
  > | null | undefined,
): LeaderboardPublicationState {
  if (!record) {
    return {
      isPublished: false,
      publishedAt: null,
      publishedBy: null,
      unpublishedAt: null,
      unpublishedBy: null,
    };
  }

  return {
    isPublished: record.is_published === true,
    publishedAt: record.published_at ?? null,
    publishedBy: record.published_by ?? null,
    unpublishedAt: record.unpublished_at ?? null,
    unpublishedBy: record.unpublished_by ?? null,
  };
}

export function canPublishEventLeaderboard(params: {
  eventStatus: EventStatus;
  entryMode: EventEntryMode;
  entryCount: number;
  isPublished?: boolean;
  hasLegacyNonNumericEntries?: boolean;
}): ValidationResult<true> {
  if (params.eventStatus === "archived") {
    return {
      ok: false,
      error: "Cannot publish leaderboard for an archived event.",
    };
  }

  if (params.eventStatus !== "active") {
    return {
      ok: false,
      error: "Only active events can have their leaderboard published.",
    };
  }

  if (params.entryMode !== "contingent" && params.entryMode !== "hybrid") {
    return {
      ok: false,
      error:
        "Overall leaderboard requires contingent entries; this event is configured for individual entries only.",
    };
  }

  if (params.entryCount < 1) {
    return {
      ok: false,
      error: "Add at least one contingent to the leaderboard before publishing.",
    };
  }

  if (params.hasLegacyNonNumericEntries) {
    return {
      ok: false,
      error:
        "Some draft entries still contain legacy non-numeric text values. Edit them to set a numeric score or clear the score before publishing.",
    };
  }

  return { ok: true, value: true };
}

export function canUnpublishEventLeaderboard(params: {
  eventStatus: EventStatus;
  isPublished: boolean;
}): ValidationResult<true> {
  if (params.eventStatus === "archived") {
    return {
      ok: false,
      error: "Cannot unpublish leaderboard for an archived event.",
    };
  }

  if (!params.isPublished) {
    return {
      ok: false,
      error: "This event leaderboard is not currently published.",
    };
  }

  return { ok: true, value: true };
}
