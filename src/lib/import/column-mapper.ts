import type {
  CmsTargetField,
  ColumnMappingItem,
} from "@/types/data-operations";

export const TARGET_FIELD_DEFINITIONS: {
  field: CmsTargetField;
  label: string;
  category: "Contingent" | "Participant" | "Event Entry" | "Other";
  required?: boolean;
  description: string;
}[] = [
  // Contingent
  {
    field: "contingent_code",
    label: "Contingent Code (e.g. CONT-01)",
    category: "Contingent",
    description: "Unique institutional contingent code (2–40 chars).",
  },
  {
    field: "contingent_name",
    label: "Contingent Name",
    category: "Contingent",
    description: "Contingent team / delegation name (2–160 chars).",
  },
  {
    field: "institution_name",
    label: "Institution / College Name",
    category: "Contingent",
    description: "College or university name (2–200 chars).",
  },
  {
    field: "institution_city",
    label: "Institution City",
    category: "Contingent",
    description: "City or region where the institution is based.",
  },
  {
    field: "contact_email",
    label: "Contingent Contact Email",
    category: "Contingent",
    description: "Primary email address for the contingent.",
  },
  {
    field: "contact_phone",
    label: "Contingent Contact Phone",
    category: "Contingent",
    description: "Phone number for the contingent representative.",
  },
  {
    field: "contingent_ext_ref",
    label: "Contingent External Ref",
    category: "Contingent",
    description: "Reference ID from college registration portal.",
  },
  {
    field: "contingent_notes",
    label: "Contingent Notes",
    category: "Contingent",
    description: "Special remarks or notes for the contingent.",
  },

  // Participant
  {
    field: "participant_code",
    label: "Participant Code (e.g. PART-01)",
    category: "Participant",
    description: "Unique participant identifier (2–40 chars).",
  },
  {
    field: "participant_name",
    label: "Participant Full Name",
    category: "Participant",
    description: "Full legal/registered name (2–160 chars).",
  },
  {
    field: "participant_email",
    label: "Participant Email",
    category: "Participant",
    description: "Participant's personal or student email.",
  },
  {
    field: "participant_phone",
    label: "Participant Phone",
    category: "Participant",
    description: "Participant's phone/mobile number.",
  },
  {
    field: "participant_institution",
    label: "Participant Institution",
    category: "Participant",
    description: "College/institution (defaults to contingent institution if linked).",
  },
  {
    field: "is_contingent_lead",
    label: "Is Contingent Lead (Yes/No)",
    category: "Participant",
    description: "Whether this participant is the delegation leader.",
  },
  {
    field: "participant_ext_ref",
    label: "Participant External Ref",
    category: "Participant",
    description: "Student registration reference from portal.",
  },
  {
    field: "member_contingent_code",
    label: "Member of Contingent Code",
    category: "Participant",
    description: "Code of the contingent this participant belongs to.",
  },

  // Event Entry
  {
    field: "entry_event_code",
    label: "Event Code (e.g. EVT-01)",
    category: "Event Entry",
    description: "Code of the event this entry is registered for.",
  },
  {
    field: "entry_type",
    label: "Entry Type (contingent / individual)",
    category: "Event Entry",
    description: "Whether this entry is for the whole team or individual.",
  },

  // Ignore
  {
    field: "ignore",
    label: "Ignore (Do not import)",
    category: "Other",
    description: "Skip this column during import processing.",
  },
];

const PATTERNS: [RegExp, CmsTargetField][] = [
  // Contingent code
  [/^(contingent|team|delegation|college)[_\s-]*(code|id|no)$/i, "contingent_code"],
  [/^contingent[_\s-]*code$/i, "contingent_code"],

  // Contingent name
  [/^(contingent|team|delegation)[_\s-]*(name|title)$/i, "contingent_name"],
  [/^contingent$/i, "contingent_name"],

  // Institution
  [/^(institution|college|university)[_\s-]*(name)?$/i, "institution_name"],
  [/^institution$/i, "institution_name"],
  [/^college$/i, "institution_name"],
  [/^university$/i, "institution_name"],

  // City
  [/^(institution|college|university)?[_\s-]*(city|location|town)$/i, "institution_city"],
  [/^city$/i, "institution_city"],

  // Contact email
  [/^(contingent|team|rep|representative)[_\s-]*(email|mail)$/i, "contact_email"],
  [/^contact[_\s-]*email$/i, "contact_email"],

  // Contact phone
  [/^(contingent|team|rep|representative)[_\s-]*(phone|mobile|contact)$/i, "contact_phone"],
  [/^contact[_\s-]*phone$/i, "contact_phone"],

  // Contingent external ref
  [/^(contingent|team)[_\s-]*(ref|reference|reg[_\s-]*id|ticket)$/i, "contingent_ext_ref"],

  // Participant code
  [/^(participant|student|member|individual|candidate)[_\s-]*(code|id|no|reg[_\s-]*no)$/i, "participant_code"],
  [/^participant[_\s-]*code$/i, "participant_code"],
  [/^reg[_\s-]*no$/i, "participant_code"],

  // Participant name
  [/^(participant|student|member|candidate)[_\s-]*(full)?[_\s-]*name$/i, "participant_name"],
  [/^full[_\s-]*name$/i, "participant_name"],
  [/^student[_\s-]*name$/i, "participant_name"],
  [/^participant$/i, "participant_name"],

  // Participant email
  [/^(participant|student|member)?[_\s-]*(email|e-mail|mail)$/i, "participant_email"],

  // Participant phone
  [/^(participant|student|member)?[_\s-]*(phone|mobile|cell|contact[_\s-]*no)$/i, "participant_phone"],

  // Lead
  [/^(is[_\s-]*)?(contingent[_\s-]*)?lead(er)?$/i, "is_contingent_lead"],

  // Member contingent code
  [/^(member[_\s-]*of|belongs[_\s-]*to|parent[_\s-]*)?(contingent|team)[_\s-]*(code)?$/i, "member_contingent_code"],

  // Event code
  [/^(event|competition|track)[_\s-]*(code|id|name)?$/i, "entry_event_code"],
  [/^event$/i, "entry_event_code"],
  [/^track$/i, "entry_event_code"],

  // Entry type
  [/^entry[_\s-]*type$/i, "entry_type"],

  // General registration ref fallback
  [/^(ref|reference|external[_\s-]*ref|reg[_\s-]*id)$/i, "contingent_ext_ref"],
];

export function autoDetectField(columnName: string): CmsTargetField {
  const normalized = columnName.trim().toLowerCase();
  for (const [pattern, field] of PATTERNS) {
    if (pattern.test(normalized)) {
      return field;
    }
  }
  return "ignore";
}

export function buildDefaultMappings(
  headers: string[],
  rows: Record<string, string>[],
): ColumnMappingItem[] {
  const usedFields = new Set<CmsTargetField>();

  return headers.map((col) => {
    let target = autoDetectField(col);
    if (target !== "ignore" && usedFields.has(target)) {
      // If already mapped to this field, avoid accidental double-mapping
      // except if it's external_ref, map to participant_ext_ref
      if (target === "contingent_ext_ref" && !usedFields.has("participant_ext_ref")) {
        target = "participant_ext_ref";
      } else {
        target = "ignore";
      }
    }
    if (target !== "ignore") {
      usedFields.add(target);
    }

    const sampleValues: string[] = [];
    for (const row of rows.slice(0, 3)) {
      const val = row[col]?.trim();
      if (val) sampleValues.push(val);
    }

    return {
      sourceColumn: col,
      targetField: target,
      sampleValues,
    };
  });
}
