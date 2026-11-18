import type { EventEntryMode } from "@/types/competition";
import type {
  ColumnMappingState,
  DetectedColumn,
  ImportTargetFieldDefinition,
  ImportTargetFieldKey,
} from "@/types/imports";

export const IMPORT_FIELD_DEFINITIONS: readonly ImportTargetFieldDefinition[] = [
  {
    key: "contingent_code",
    entity: "contingent",
    label: "Contingent Code",
    schemaColumn: "contingents.contingent_code",
    description:
      "Unique team/contingent code (2–40 chars). Required when preparing contingent entries.",
    aliases: [
      "contingent_code",
      "contingent code",
      "team_code",
      "team code",
      "contingent_id",
      "team_id",
    ],
  },
  {
    key: "contingent_name",
    entity: "contingent",
    label: "Contingent / Team Name",
    schemaColumn: "contingents.name",
    description:
      "Contingent or team display name (2–160 chars). Required for contingent entries.",
    aliases: [
      "contingent_name",
      "contingent name",
      "contingent",
      "team_name",
      "team name",
      "team",
    ],
  },
  {
    key: "institution_name",
    entity: "contingent",
    label: "Institution / College Name",
    schemaColumn: "contingents.institution_name & participants.institution_name",
    description:
      "College or institution name (2–200 chars). Required by both contingent and participant records.",
    aliases: [
      "institution_name",
      "institution name",
      "institution",
      "college_name",
      "college name",
      "college",
      "university",
      "school",
    ],
  },
  {
    key: "institution_city",
    entity: "contingent",
    label: "Institution City",
    schemaColumn: "contingents.institution_city",
    description: "Optional city of the representing institution.",
    aliases: ["institution_city", "institution city", "city", "college city"],
  },
  {
    key: "contingent_external_ref",
    entity: "contingent",
    label: "Contingent External Ref",
    schemaColumn: "contingents.external_registration_ref",
    description:
      "Optional registration reference ID from the college registration export for matching existing contingents.",
    aliases: [
      "contingent_external_ref",
      "contingent_ref",
      "team_registration_id",
      "team_ref",
      "contingent_registration_id",
    ],
  },
  {
    key: "contact_email",
    entity: "contingent",
    label: "Contingent Contact Email",
    schemaColumn: "contingents.contact_email",
    description: "Optional primary contact email for the contingent.",
    aliases: [
      "contact_email",
      "contact email",
      "contingent_email",
      "team_email",
      "team_contact_email",
    ],
  },
  {
    key: "contact_phone",
    entity: "contingent",
    label: "Contingent Contact Phone",
    schemaColumn: "contingents.contact_phone",
    description: "Optional primary phone number for the contingent.",
    aliases: [
      "contact_phone",
      "contact phone",
      "contingent_phone",
      "team_phone",
      "team_contact_phone",
    ],
  },
  {
    key: "contingent_notes",
    entity: "contingent",
    label: "Contingent Notes",
    schemaColumn: "contingents.notes",
    description: "Optional organiser notes for the contingent.",
    aliases: ["contingent_notes", "team_notes"],
  },
  {
    key: "participant_code",
    entity: "participant",
    label: "Participant Code",
    schemaColumn: "participants.participant_code",
    description:
      "Unique participant identifier (2–40 chars). Required by the Stage 2A participant schema.",
    aliases: [
      "participant_code",
      "participant code",
      "participant_id",
      "delegate_code",
      "member_code",
      "reg_code",
    ],
  },
  {
    key: "full_name",
    entity: "participant",
    label: "Participant Full Name",
    schemaColumn: "participants.full_name",
    description: "Full name of the participant (2–160 chars). Required.",
    aliases: [
      "full_name",
      "full name",
      "participant_name",
      "participant name",
      "student_name",
      "student name",
      "delegate_name",
      "member_name",
      "name",
    ],
  },
  {
    key: "email",
    entity: "participant",
    label: "Participant Email",
    schemaColumn: "participants.email",
    description: "Optional participant email address used for contact and duplicate checks.",
    aliases: [
      "email",
      "participant_email",
      "participant email",
      "student_email",
      "email_address",
      "email address",
    ],
  },
  {
    key: "phone",
    entity: "participant",
    label: "Participant Phone",
    schemaColumn: "participants.phone",
    description: "Optional participant phone or mobile number.",
    aliases: [
      "phone",
      "phone_number",
      "phone number",
      "mobile",
      "mobile_number",
      "participant_phone",
      "student_phone",
    ],
  },
  {
    key: "participant_external_ref",
    entity: "participant",
    label: "Participant External Ref",
    schemaColumn: "participants.external_registration_ref",
    description:
      "Optional registration reference ID from the external registration export.",
    aliases: [
      "participant_external_ref",
      "external_registration_ref",
      "external_ref",
      "registration_id",
      "registration_ref",
      "reg_id",
      "receipt_no",
    ],
  },
  {
    key: "is_contingent_lead",
    entity: "participant",
    label: "Is Contingent Lead",
    schemaColumn: "participants.is_contingent_lead",
    description:
      "Optional Yes/No or true/false flag indicating team captain/contingent lead (invalid without a contingent).",
    aliases: [
      "is_contingent_lead",
      "contingent_lead",
      "team_lead",
      "is_lead",
      "leader",
      "captain",
    ],
  },
  {
    key: "entry_type",
    entity: "event_entry",
    label: "Entry Type",
    schemaColumn: "event_entries.entry_type",
    description:
      "Optional 'contingent' or 'individual'. When unmapped, derived from the selected event's entry mode.",
    aliases: ["entry_type", "entry type", "registration_type", "participation_type"],
  },
  {
    key: "entry_status",
    entity: "event_entry",
    label: "Entry Status",
    schemaColumn: "event_entries.status",
    description:
      "Optional initial status (registered, checked_in, withdrawn, disqualified). Defaults to registered.",
    aliases: ["entry_status", "entry status", "registration_status", "status"],
  },
  {
    key: "entry_notes",
    entity: "event_entry",
    label: "Entry Notes",
    schemaColumn: "event_entries.notes",
    description: "Optional notes recorded against the event entry.",
    aliases: ["entry_notes", "notes", "remarks", "comments"],
  },
  {
    key: "source_event_code",
    entity: "event_entry",
    label: "Source Event Code (Check Only)",
    schemaColumn: "Validation cross-check against selected event",
    description:
      "Optional source column containing an event code/name to catch mismatched rows from multi-event exports.",
    aliases: [
      "source_event_code",
      "source event code",
      "source_event",
      "event_code",
      "event code",
      "event_name",
      "event",
      "competition",
    ],
  },
] as const;

export const IMPORT_FIELD_BY_KEY: Readonly<
  Record<ImportTargetFieldKey, ImportTargetFieldDefinition>
> = Object.fromEntries(
  IMPORT_FIELD_DEFINITIONS.map((def) => [def.key, def]),
) as Record<ImportTargetFieldKey, ImportTargetFieldDefinition>;

export const ALL_TARGET_FIELD_KEYS: readonly ImportTargetFieldKey[] =
  IMPORT_FIELD_DEFINITIONS.map((def) => def.key);

export function createEmptyMapping(): ColumnMappingState {
  return {
    contingent_code: null,
    contingent_name: null,
    institution_name: null,
    institution_city: null,
    contingent_external_ref: null,
    contact_email: null,
    contact_phone: null,
    contingent_notes: null,
    participant_code: null,
    full_name: null,
    email: null,
    phone: null,
    participant_external_ref: null,
    is_contingent_lead: null,
    entry_type: null,
    entry_status: null,
    entry_notes: null,
    source_event_code: null,
  };
}

export function getSchemaBaselineRequiredFields(
  entryMode: EventEntryMode,
): ImportTargetFieldKey[] {
  if (entryMode === "contingent") {
    return [
      "contingent_code",
      "contingent_name",
      "institution_name",
      "participant_code",
      "full_name",
    ];
  }
  return ["institution_name", "participant_code", "full_name"];
}

export function normalizeHeaderForMatching(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Generates non-binding suggested column mappings based on header similarity.
 * Never assumes fixed column positions and leaves duplicate-header columns unmapped
 * after the first match so the organiser explicitly verifies them.
 */
export function suggestColumnMappings(
  columns: readonly DetectedColumn[],
): ColumnMappingState {
  const mapping = createEmptyMapping();
  const usedColumnKeys = new Set<string>();

  for (const field of IMPORT_FIELD_DEFINITIONS) {
    const normalizedAliases = new Set(
      field.aliases.map((alias) => normalizeHeaderForMatching(alias)),
    );

    const exactMatch = columns.find((col) => {
      if (usedColumnKeys.has(col.key)) return false;
      const normHeader = normalizeHeaderForMatching(col.headerName);
      return normHeader.length > 0 && normalizedAliases.has(normHeader);
    });

    if (exactMatch) {
      mapping[field.key] = exactMatch.key;
      usedColumnKeys.add(exactMatch.key);
    }
  }

  return mapping;
}
