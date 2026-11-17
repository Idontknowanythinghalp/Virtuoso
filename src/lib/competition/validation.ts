import type {
  CodenameMode,
  EventEntryMode,
  EventEntryStatus,
  EventEntryType,
  EventStatus,
  RoundAttributionMode,
  RoundScoringMethod,
  RoundStatus,
} from "@/types/competition";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ENTRY_MODES: readonly EventEntryMode[] = [
  "contingent",
  "individual",
  "hybrid",
];
const CODENAME_MODES: readonly CodenameMode[] = ["event_wide", "per_round"];
const EVENT_STATUSES: readonly EventStatus[] = [
  "draft",
  "active",
  "inactive",
  "archived",
];
const SCORING_METHODS: readonly RoundScoringMethod[] = [
  "criteria_sum",
  "criteria_weighted",
  "direct_points",
];
const ATTRIBUTION_MODES: readonly RoundAttributionMode[] = [
  "individual_judge",
  "panel_consolidated",
  "round_direct",
];
const ROUND_STATUSES: readonly RoundStatus[] = [
  "draft",
  "ready",
  "deployed",
  "completed",
  "archived",
];
const ENTRY_TYPES: readonly EventEntryType[] = ["contingent", "individual"];
const ENTRY_STATUSES: readonly EventEntryStatus[] = [
  "registered",
  "checked_in",
  "withdrawn",
  "disqualified",
];

function cleanOptionalText(value: string | null | undefined, maxLen = 1000): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function parseOptionalPositiveInt(
  raw: string | number | null | undefined,
  label: string,
): ValidationResult<number | null> {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return { ok: true, value: null };
  }
  const num = Number(raw);
  if (!Number.isInteger(num) || num < 1) {
    return { ok: false, error: `${label} must be a whole number of 1 or more.` };
  }
  if (num > 100) {
    return { ok: false, error: `${label} must be 100 or fewer.` };
  }
  return { ok: true, value: num };
}

export function validateUuid(
  value: string | null | undefined,
  label = "Identifier",
): ValidationResult<string> {
  const trimmed = value?.trim() ?? "";
  if (!UUID_REGEX.test(trimmed)) {
    return { ok: false, error: `${label} is invalid.` };
  }
  return { ok: true, value: trimmed };
}

export interface ValidatedEventInput {
  code: string;
  name: string;
  description: string | null;
  entry_mode: EventEntryMode;
  codename_mode: CodenameMode;
  status: EventStatus;
  min_team_size: number | null;
  max_team_size: number | null;
}

export function validateEventInput(raw: {
  code: string;
  name: string;
  description?: string | null;
  entryMode: string;
  codenameMode: string;
  status: string;
  minTeamSize?: string | number | null;
  maxTeamSize?: string | number | null;
}): ValidationResult<ValidatedEventInput> {
  const code = raw.code.trim().toUpperCase();
  if (code.length < 2 || code.length > 40) {
    return {
      ok: false,
      error: "Event code must be between 2 and 40 characters.",
    };
  }

  const name = raw.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 160) {
    return {
      ok: false,
      error: "Event name must be between 2 and 160 characters.",
    };
  }

  if (!ENTRY_MODES.includes(raw.entryMode as EventEntryMode)) {
    return { ok: false, error: "Invalid entry mode selected." };
  }

  if (!CODENAME_MODES.includes(raw.codenameMode as CodenameMode)) {
    return { ok: false, error: "Invalid codename mode selected." };
  }

  if (!EVENT_STATUSES.includes(raw.status as EventStatus)) {
    return { ok: false, error: "Invalid event status selected." };
  }

  const minCheck = parseOptionalPositiveInt(raw.minTeamSize, "Minimum team size");
  if (!minCheck.ok) return minCheck;

  const maxCheck = parseOptionalPositiveInt(raw.maxTeamSize, "Maximum team size");
  if (!maxCheck.ok) return maxCheck;

  if (
    minCheck.value !== null &&
    maxCheck.value !== null &&
    maxCheck.value < minCheck.value
  ) {
    return {
      ok: false,
      error: "Maximum team size cannot be smaller than minimum team size.",
    };
  }

  return {
    ok: true,
    value: {
      code,
      name,
      description: cleanOptionalText(raw.description, 2000),
      entry_mode: raw.entryMode as EventEntryMode,
      codename_mode: raw.codenameMode as CodenameMode,
      status: raw.status as EventStatus,
      min_team_size: minCheck.value,
      max_team_size: maxCheck.value,
    },
  };
}

export interface ValidatedRoundInput {
  round_number: number;
  name: string;
  description: string | null;
  scoring_method: RoundScoringMethod;
  attribution_mode: RoundAttributionMode;
  status: RoundStatus;
  is_locked: boolean;
}

export function validateRoundInput(raw: {
  roundNumber: string | number;
  name: string;
  description?: string | null;
  scoringMethod: string;
  attributionMode: string;
  status: string;
  isLocked: boolean;
}): ValidationResult<ValidatedRoundInput> {
  const roundNumber = Number(raw.roundNumber);
  if (!Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > 99) {
    return {
      ok: false,
      error: "Round number must be a whole number between 1 and 99.",
    };
  }

  const name = raw.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 160) {
    return {
      ok: false,
      error: "Round name must be between 2 and 160 characters.",
    };
  }

  if (!SCORING_METHODS.includes(raw.scoringMethod as RoundScoringMethod)) {
    return { ok: false, error: "Invalid scoring method selected." };
  }

  if (!ATTRIBUTION_MODES.includes(raw.attributionMode as RoundAttributionMode)) {
    return { ok: false, error: "Invalid attribution mode selected." };
  }

  if (!ROUND_STATUSES.includes(raw.status as RoundStatus)) {
    return { ok: false, error: "Invalid round status selected." };
  }

  return {
    ok: true,
    value: {
      round_number: roundNumber,
      name,
      description: cleanOptionalText(raw.description, 2000),
      scoring_method: raw.scoringMethod as RoundScoringMethod,
      attribution_mode: raw.attributionMode as RoundAttributionMode,
      status: raw.status as RoundStatus,
      is_locked: Boolean(raw.isLocked),
    },
  };
}

export interface ValidatedCriterionInput {
  display_order: number;
  name: string;
  max_points: number;
  weight: number;
  rubric_guidance: string | null;
}

export function validateJudgingCriterionInput(raw: {
  displayOrder: string | number;
  name: string;
  maxPoints: string | number;
  weight: string | number;
  rubricGuidance?: string | null;
}): ValidationResult<ValidatedCriterionInput> {
  const displayOrder = Number(raw.displayOrder);
  if (
    !Number.isInteger(displayOrder) ||
    displayOrder < 1 ||
    displayOrder > 100
  ) {
    return {
      ok: false,
      error: "Display order must be a whole number between 1 and 100.",
    };
  }

  const name = raw.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 160) {
    return {
      ok: false,
      error: "Criterion name must be between 2 and 160 characters.",
    };
  }

  const maxPoints = Number(raw.maxPoints);
  if (!Number.isFinite(maxPoints) || maxPoints <= 0 || maxPoints > 10000) {
    return {
      ok: false,
      error: "Maximum points must be a number greater than 0 and up to 10,000.",
    };
  }

  const weight = Number(raw.weight);
  if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
    return {
      ok: false,
      error: "Weight must be a number greater than 0 and up to 100.",
    };
  }

  return {
    ok: true,
    value: {
      display_order: displayOrder,
      name,
      max_points: Math.round(maxPoints * 100) / 100,
      weight: Math.round(weight * 100) / 100,
      rubric_guidance: cleanOptionalText(raw.rubricGuidance, 2000),
    },
  };
}

export function validateRoundAllowsCriteriaMutation(round: {
  is_locked: boolean;
}): ValidationResult<null> {
  if (round.is_locked) {
    return {
      ok: false,
      error:
        "Judging criteria cannot be changed while the round is locked. Unlock the round first if no scores exist.",
    };
  }
  return { ok: true, value: null };
}

export interface ValidatedContingentInput {
  contingent_code: string;
  name: string;
  institution_name: string;
  institution_city: string | null;
  external_registration_ref: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  is_active: boolean;
  notes: string | null;
}

export function validateContingentInput(raw: {
  contingentCode: string;
  name: string;
  institutionName: string;
  institutionCity?: string | null;
  externalRegistrationRef?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  isActive: boolean;
  notes?: string | null;
}): ValidationResult<ValidatedContingentInput> {
  const contingentCode = raw.contingentCode.trim().toUpperCase();
  if (contingentCode.length < 2 || contingentCode.length > 40) {
    return {
      ok: false,
      error: "Contingent code must be between 2 and 40 characters.",
    };
  }

  const name = raw.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 160) {
    return {
      ok: false,
      error: "Contingent name must be between 2 and 160 characters.",
    };
  }

  const institutionName = raw.institutionName.trim().replace(/\s+/g, " ");
  if (institutionName.length < 2 || institutionName.length > 200) {
    return {
      ok: false,
      error: "Institution name must be between 2 and 200 characters.",
    };
  }

  const contactEmail = cleanOptionalText(raw.contactEmail, 254);
  if (contactEmail && !EMAIL_REGEX.test(contactEmail.toLowerCase())) {
    return { ok: false, error: "Enter a valid contact email address." };
  }

  return {
    ok: true,
    value: {
      contingent_code: contingentCode,
      name,
      institution_name: institutionName,
      institution_city: cleanOptionalText(raw.institutionCity, 120),
      external_registration_ref: cleanOptionalText(
        raw.externalRegistrationRef,
        120,
      ),
      contact_email: contactEmail ? contactEmail.toLowerCase() : null,
      contact_phone: cleanOptionalText(raw.contactPhone, 32),
      is_active: Boolean(raw.isActive),
      notes: cleanOptionalText(raw.notes, 2000),
    },
  };
}

export interface ValidatedParticipantInput {
  contingent_id: string | null;
  participant_code: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  institution_name: string;
  external_registration_ref: string | null;
  is_contingent_lead: boolean;
  is_active: boolean;
}

export function validateParticipantInput(raw: {
  contingentId?: string | null;
  participantCode: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  institutionName: string;
  externalRegistrationRef?: string | null;
  isContingentLead: boolean;
  isActive: boolean;
}): ValidationResult<ValidatedParticipantInput> {
  const contingentIdRaw = raw.contingentId?.trim() || null;
  if (contingentIdRaw && !UUID_REGEX.test(contingentIdRaw)) {
    return { ok: false, error: "Selected contingent identifier is invalid." };
  }

  if (!contingentIdRaw && raw.isContingentLead) {
    return {
      ok: false,
      error: "An individual participant without a contingent cannot be marked as contingent lead.",
    };
  }

  const participantCode = raw.participantCode.trim().toUpperCase();
  if (participantCode.length < 2 || participantCode.length > 40) {
    return {
      ok: false,
      error: "Participant code must be between 2 and 40 characters.",
    };
  }

  const fullName = raw.fullName.trim().replace(/\s+/g, " ");
  if (fullName.length < 2 || fullName.length > 160) {
    return {
      ok: false,
      error: "Participant full name must be between 2 and 160 characters.",
    };
  }

  const institutionName = raw.institutionName.trim().replace(/\s+/g, " ");
  if (institutionName.length < 2 || institutionName.length > 200) {
    return {
      ok: false,
      error: "Institution name must be between 2 and 200 characters.",
    };
  }

  const email = cleanOptionalText(raw.email, 254);
  if (email && !EMAIL_REGEX.test(email.toLowerCase())) {
    return { ok: false, error: "Enter a valid participant email address." };
  }

  return {
    ok: true,
    value: {
      contingent_id: contingentIdRaw,
      participant_code: participantCode,
      full_name: fullName,
      email: email ? email.toLowerCase() : null,
      phone: cleanOptionalText(raw.phone, 32),
      institution_name: institutionName,
      external_registration_ref: cleanOptionalText(
        raw.externalRegistrationRef,
        120,
      ),
      is_contingent_lead: Boolean(contingentIdRaw && raw.isContingentLead),
      is_active: Boolean(raw.isActive),
    },
  };
}

export interface ValidatedEventEntryInput {
  event_id: string;
  entry_type: EventEntryType;
  contingent_id: string | null;
  participant_id: string | null;
  status: EventEntryStatus;
  notes: string | null;
}

export function validateEventEntryInput(raw: {
  eventId: string;
  eventEntryMode: EventEntryMode;
  eventStatus: EventStatus;
  entryType: string;
  contingentId?: string | null;
  participantId?: string | null;
  status?: string;
  notes?: string | null;
}): ValidationResult<ValidatedEventEntryInput> {
  const eventCheck = validateUuid(raw.eventId, "Event");
  if (!eventCheck.ok) return eventCheck;

  if (raw.eventStatus === "archived") {
    return {
      ok: false,
      error: "Cannot register entries into an archived event.",
    };
  }

  if (!ENTRY_TYPES.includes(raw.entryType as EventEntryType)) {
    return { ok: false, error: "Entry type must be contingent or individual." };
  }

  const entryType = raw.entryType as EventEntryType;
  if (raw.eventEntryMode === "contingent" && entryType !== "contingent") {
    return {
      ok: false,
      error: "This event only accepts contingent (team) entries.",
    };
  }
  if (raw.eventEntryMode === "individual" && entryType !== "individual") {
    return {
      ok: false,
      error: "This event only accepts individual participant entries.",
    };
  }

  const contingentId = raw.contingentId?.trim() || null;
  const participantId = raw.participantId?.trim() || null;

  if (contingentId && participantId) {
    return {
      ok: false,
      error:
        "An event entry cannot reference both a contingent and an individual participant.",
    };
  }

  if (entryType === "contingent") {
    if (!contingentId || !UUID_REGEX.test(contingentId)) {
      return {
        ok: false,
        error: "A contingent entry requires a valid contingent selection.",
      };
    }
  } else {
    if (!participantId || !UUID_REGEX.test(participantId)) {
      return {
        ok: false,
        error: "An individual entry requires a valid participant selection.",
      };
    }
  }

  const status = (raw.status ?? "registered").trim();
  if (!ENTRY_STATUSES.includes(status as EventEntryStatus)) {
    return { ok: false, error: "Invalid entry status selected." };
  }

  return {
    ok: true,
    value: {
      event_id: eventCheck.value,
      entry_type: entryType,
      contingent_id: entryType === "contingent" ? contingentId : null,
      participant_id: entryType === "individual" ? participantId : null,
      status: status as EventEntryStatus,
      notes: cleanOptionalText(raw.notes, 1000),
    },
  };
}

export function validateEventEntryStatus(
  status: string,
): ValidationResult<EventEntryStatus> {
  if (!ENTRY_STATUSES.includes(status as EventEntryStatus)) {
    return { ok: false, error: "Invalid entry status selected." };
  }
  return { ok: true, value: status as EventEntryStatus };
}
