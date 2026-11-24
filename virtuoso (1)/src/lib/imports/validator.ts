import {
  validateContingentInput,
  validateEventEntryStatus,
  validateParticipantInput,
} from "@/lib/competition/validation";
import {
  ALL_TARGET_FIELD_KEYS,
  IMPORT_FIELD_BY_KEY,
  getSchemaBaselineRequiredFields,
} from "@/lib/imports/fields";
import type { EventEntryStatus, EventEntryType } from "@/types/competition";
import type {
  ColumnMappingState,
  DetectedColumn,
  ExistingCmsMatchNotice,
  ImportEventOption,
  ImportPreviewRow,
  ImportRowIssue,
  ImportTargetFieldKey,
  ImportValidationReport,
  InFileDuplicateNotice,
  ParsedDataRow,
} from "@/types/imports";

const SYNTHETIC_CONTINGENT_UUID = "00000000-0000-4000-8000-000000000001";

export interface ExistingContingentLookupItem {
  id: string;
  contingent_code: string;
  name: string;
  institution_name: string;
  external_registration_ref: string | null;
}

export interface ExistingParticipantLookupItem {
  id: string;
  participant_code: string;
  full_name: string;
  email: string | null;
  external_registration_ref: string | null;
  contingent_id: string | null;
}

export interface ExistingCmsLookupContext {
  contingents: readonly ExistingContingentLookupItem[];
  participants: readonly ExistingParticipantLookupItem[];
  enteredContingentIdsForEvent: ReadonlySet<string>;
  enteredParticipantIdsForEvent: ReadonlySet<string>;
}

export const EMPTY_EXISTING_CMS_CONTEXT: ExistingCmsLookupContext = {
  contingents: [],
  participants: [],
  enteredContingentIdsForEvent: new Set<string>(),
  enteredParticipantIdsForEvent: new Set<string>(),
};

function parseBooleanCell(
  raw: string,
): { ok: true; value: boolean } | { ok: false; error: string } {
  const norm = raw.trim().toLowerCase();
  if (norm === "") return { ok: true, value: false };
  if (["true", "yes", "y", "1"].includes(norm)) {
    return { ok: true, value: true };
  }
  if (["false", "no", "n", "0"].includes(norm)) {
    return { ok: true, value: false };
  }
  return {
    ok: false,
    error: `Invalid boolean flag "${raw.trim()}". Use Yes/No, True/False, or 1/0.`,
  };
}

function parseOptionalEntryTypeCell(
  raw: string,
): { ok: true; value: EventEntryType | null } | { ok: false; error: string } {
  const norm = raw.trim().toLowerCase();
  if (norm === "") return { ok: true, value: null };
  if (norm === "contingent" || norm === "team") {
    return { ok: true, value: "contingent" };
  }
  if (norm === "individual" || norm === "solo") {
    return { ok: true, value: "individual" };
  }
  return {
    ok: false,
    error: `Invalid entry type "${raw.trim()}". Expected "contingent" or "individual".`,
  };
}

function cleanCell(value: string | undefined): string {
  return (value ?? "").trim();
}

export function validateImportBatch(params: {
  event: ImportEventOption;
  columns: readonly DetectedColumn[];
  rows: readonly ParsedDataRow[];
  mapping: ColumnMappingState;
  requiredOverrides?: readonly ImportTargetFieldKey[];
  existingContext?: ExistingCmsLookupContext;
}): ImportValidationReport {
  const { event, columns, rows, mapping } = params;
  const existing = params.existingContext ?? EMPTY_EXISTING_CMS_CONTEXT;

  const columnIndexByKey = new Map<string, number>();
  for (const col of columns) {
    columnIndexByKey.set(col.key, col.index);
  }

  // Resolve target -> column index safely
  const targetToColIndex = new Map<ImportTargetFieldKey, number>();
  const mappedColumnKeys = new Set<string>();

  for (const targetKey of ALL_TARGET_FIELD_KEYS) {
    const colKey = mapping[targetKey];
    if (colKey && columnIndexByKey.has(colKey)) {
      targetToColIndex.set(targetKey, columnIndexByKey.get(colKey)!);
      mappedColumnKeys.add(colKey);
    }
  }

  const unmappedSourceColumns = columns.filter(
    (col) => !mappedColumnKeys.has(col.key),
  );
  const unmappedTargetFields = ALL_TARGET_FIELD_KEYS.filter(
    (key) => !targetToColIndex.has(key),
  );

  // Merge baseline schema-required fields with organiser-marked required fields
  const baselineRequired = getSchemaBaselineRequiredFields(event.entry_mode);
  const requiredSet = new Set<ImportTargetFieldKey>(baselineRequired);
  for (const overrideKey of params.requiredOverrides ?? []) {
    if (ALL_TARGET_FIELD_KEYS.includes(overrideKey)) {
      requiredSet.add(overrideKey);
    }
  }
  const requiredTargetFields = ALL_TARGET_FIELD_KEYS.filter((k) =>
    requiredSet.has(k),
  );
  const missingRequiredTargetFields = requiredTargetFields.filter(
    (k) => !targetToColIndex.has(k),
  );

  const batchNotices: string[] = [];
  if (event.status === "archived") {
    batchNotices.push(
      `Event "${event.name}" (${event.code}) is archived. Stage 2A rules prohibit registering entries into archived events.`,
    );
  }
  if (missingRequiredTargetFields.length > 0) {
    const labels = missingRequiredTargetFields.map(
      (k) => IMPORT_FIELD_BY_KEY[k].label,
    );
    batchNotices.push(
      `Missing required column mappings: ${labels.join(", ")}. Map these fields or return to Step 4 to adjust required fields.`,
    );
  }

  // Build read-only existing CMS lookup maps
  const existingContingentByCode = new Map<string, ExistingContingentLookupItem>();
  const existingContingentByExtRef = new Map<
    string,
    ExistingContingentLookupItem
  >();
  for (const cont of existing.contingents) {
    existingContingentByCode.set(cont.contingent_code.trim().toUpperCase(), cont);
    if (cont.external_registration_ref) {
      existingContingentByExtRef.set(
        cont.external_registration_ref.trim().toLowerCase(),
        cont,
      );
    }
  }

  const existingParticipantByCode = new Map<
    string,
    ExistingParticipantLookupItem
  >();
  const existingParticipantByEmail = new Map<
    string,
    ExistingParticipantLookupItem
  >();
  const existingParticipantByExtRef = new Map<
    string,
    ExistingParticipantLookupItem
  >();
  for (const part of existing.participants) {
    existingParticipantByCode.set(
      part.participant_code.trim().toUpperCase(),
      part,
    );
    if (part.email) {
      existingParticipantByEmail.set(part.email.trim().toLowerCase(), part);
    }
    if (part.external_registration_ref) {
      existingParticipantByExtRef.set(
        part.external_registration_ref.trim().toLowerCase(),
        part,
      );
    }
  }

  const getCell = (row: ParsedDataRow, key: ImportTargetFieldKey): string => {
    const idx = targetToColIndex.get(key);
    if (idx === undefined) return "";
    return cleanCell(row.cells[idx]);
  };

  // First pass: extract raw values + track in-file occurrences for duplicate/conflict checks
  const participantCodeRows = new Map<string, number[]>();
  const participantEmailRows = new Map<string, number[]>();
  const participantExtRefRows = new Map<string, number[]>();
  const contingentMetadataRows = new Map<
    string,
    Array<{ rowNumber: number; name: string; institution: string }>
  >();
  const contingentMemberNameRows = new Map<string, number[]>();
  const uncodedNameInstRows = new Map<string, number[]>();

  interface ExtractedRowDraft {
    row: ParsedDataRow;
    contingentCode: string;
    contingentName: string;
    institutionName: string;
    institutionCity: string;
    contingentExternalRef: string;
    contactEmail: string;
    contactPhone: string;
    contingentNotes: string;
    participantCode: string;
    fullName: string;
    email: string;
    phone: string;
    participantExternalRef: string;
    isContingentLeadRaw: string;
    entryTypeRaw: string;
    entryStatusRaw: string;
    entryNotes: string;
    sourceEventCode: string;
    resolvedEntryType: EventEntryType;
    hasAnyContingentData: boolean;
  }

  const drafts: ExtractedRowDraft[] = rows.map((row) => {
    const contingentCode = getCell(row, "contingent_code");
    const contingentName = getCell(row, "contingent_name");
    const institutionName = getCell(row, "institution_name");
    const institutionCity = getCell(row, "institution_city");
    const contingentExternalRef = getCell(row, "contingent_external_ref");
    const contactEmail = getCell(row, "contact_email");
    const contactPhone = getCell(row, "contact_phone");
    const contingentNotes = getCell(row, "contingent_notes");

    const participantCode = getCell(row, "participant_code");
    const fullName = getCell(row, "full_name");
    const email = getCell(row, "email");
    const phone = getCell(row, "phone");
    const participantExternalRef = getCell(row, "participant_external_ref");
    const isContingentLeadRaw = getCell(row, "is_contingent_lead");

    const entryTypeRaw = getCell(row, "entry_type");
    const entryStatusRaw = getCell(row, "entry_status");
    const entryNotes = getCell(row, "entry_notes");
    const sourceEventCode = getCell(row, "source_event_code");

    const hasAnyContingentData =
      contingentCode.length > 0 ||
      contingentName.length > 0 ||
      contingentExternalRef.length > 0;

    const parsedEntryType = parseOptionalEntryTypeCell(entryTypeRaw);
    let resolvedEntryType: EventEntryType;
    if (parsedEntryType.ok && parsedEntryType.value) {
      resolvedEntryType = parsedEntryType.value;
    } else if (event.entry_mode === "contingent") {
      resolvedEntryType = "contingent";
    } else if (event.entry_mode === "individual") {
      resolvedEntryType = "individual";
    } else {
      resolvedEntryType = hasAnyContingentData ? "contingent" : "individual";
    }

    const normParticipantCode = participantCode.toUpperCase();
    if (normParticipantCode) {
      const list = participantCodeRows.get(normParticipantCode) ?? [];
      list.push(row.rowNumber);
      participantCodeRows.set(normParticipantCode, list);
    }

    const normEmail = email.toLowerCase();
    if (normEmail) {
      const list = participantEmailRows.get(normEmail) ?? [];
      list.push(row.rowNumber);
      participantEmailRows.set(normEmail, list);
    }

    const normPartExtRef = participantExternalRef.toLowerCase();
    if (normPartExtRef) {
      const list = participantExtRefRows.get(normPartExtRef) ?? [];
      list.push(row.rowNumber);
      participantExtRefRows.set(normPartExtRef, list);
    }

    const normContingentCode = contingentCode.toUpperCase();
    if (normContingentCode) {
      const entries = contingentMetadataRows.get(normContingentCode) ?? [];
      entries.push({
        rowNumber: row.rowNumber,
        name: contingentName.toLowerCase(),
        institution: institutionName.toLowerCase(),
      });
      contingentMetadataRows.set(normContingentCode, entries);

      if (fullName) {
        const key = `${normContingentCode}::${fullName.toLowerCase()}`;
        const list = contingentMemberNameRows.get(key) ?? [];
        list.push(row.rowNumber);
        contingentMemberNameRows.set(key, list);
      }
    } else if (!normParticipantCode && fullName && institutionName) {
      const key = `${fullName.toLowerCase()}::${institutionName.toLowerCase()}`;
      const list = uncodedNameInstRows.get(key) ?? [];
      list.push(row.rowNumber);
      uncodedNameInstRows.set(key, list);
    }

    return {
      row,
      contingentCode,
      contingentName,
      institutionName,
      institutionCity,
      contingentExternalRef,
      contactEmail,
      contactPhone,
      contingentNotes,
      participantCode,
      fullName,
      email,
      phone,
      participantExternalRef,
      isContingentLeadRaw,
      entryTypeRaw,
      entryStatusRaw,
      entryNotes,
      sourceEventCode,
      resolvedEntryType,
      hasAnyContingentData,
    };
  });

  // Second pass: per-row validation, duplicate detection, and existing CMS checks
  const previewRows: ImportPreviewRow[] = drafts.map((draft) => {
    const issues: ImportRowIssue[] = [];
    const inFileDuplicates: InFileDuplicateNotice[] = [];
    const existingMatches: ExistingCmsMatchNotice[] = [];

    if (event.status === "archived") {
      issues.push({
        field: "row",
        severity: "error",
        category: "event_compatibility",
        message: `Event ${event.code} is archived and cannot accept imported registrations.`,
      });
    }

    // Source event cross-check (only if mapped & non-empty)
    if (draft.sourceEventCode) {
      const srcNorm = draft.sourceEventCode.trim().toUpperCase();
      if (
        srcNorm !== event.code.trim().toUpperCase() &&
        srcNorm !== event.name.trim().toUpperCase()
      ) {
        issues.push({
          field: "source_event_code",
          severity: "error",
          category: "event_compatibility",
          message: `Source event "${draft.sourceEventCode}" does not match selected event ${event.code} (${event.name}).`,
        });
      }
    }

    // Entry type validation
    const entryTypeParsed = parseOptionalEntryTypeCell(draft.entryTypeRaw);
    if (!entryTypeParsed.ok) {
      issues.push({
        field: "entry_type",
        severity: "error",
        category: "invalid_value",
        message: entryTypeParsed.error,
      });
    } else if (
      event.entry_mode === "contingent" &&
      draft.resolvedEntryType !== "contingent"
    ) {
      issues.push({
        field: "entry_type",
        severity: "error",
        category: "event_compatibility",
        message: `Event ${event.code} only accepts contingent (team) entries.`,
      });
    } else if (
      event.entry_mode === "individual" &&
      draft.resolvedEntryType !== "individual"
    ) {
      issues.push({
        field: "entry_type",
        severity: "error",
        category: "event_compatibility",
        message: `Event ${event.code} only accepts individual participant entries.`,
      });
    }

    // Entry status validation (defaults to "registered")
    let resolvedEntryStatus: EventEntryStatus = "registered";
    if (draft.entryStatusRaw) {
      const statusCheck = validateEventEntryStatus(
        draft.entryStatusRaw.trim().toLowerCase().replace(/\s+/g, "_"),
      );
      if (!statusCheck.ok) {
        issues.push({
          field: "entry_status",
          severity: "error",
          category: "invalid_value",
          message: `${statusCheck.error} Received "${draft.entryStatusRaw}".`,
        });
      } else {
        resolvedEntryStatus = statusCheck.value;
      }
    }

    // Determine effective required fields for this row
    const rowRequiredFields = new Set<ImportTargetFieldKey>(requiredSet);
    if (draft.resolvedEntryType === "contingent") {
      rowRequiredFields.add("contingent_code");
      rowRequiredFields.add("contingent_name");
      rowRequiredFields.add("institution_name");
    }

    const rowValueByKey: Record<ImportTargetFieldKey, string> = {
      contingent_code: draft.contingentCode,
      contingent_name: draft.contingentName,
      institution_name: draft.institutionName,
      institution_city: draft.institutionCity,
      contingent_external_ref: draft.contingentExternalRef,
      contact_email: draft.contactEmail,
      contact_phone: draft.contactPhone,
      contingent_notes: draft.contingentNotes,
      participant_code: draft.participantCode,
      full_name: draft.fullName,
      email: draft.email,
      phone: draft.phone,
      participant_external_ref: draft.participantExternalRef,
      is_contingent_lead: draft.isContingentLeadRaw,
      entry_type: draft.entryTypeRaw,
      entry_status: draft.entryStatusRaw,
      entry_notes: draft.entryNotes,
      source_event_code: draft.sourceEventCode,
    };

    for (const reqField of rowRequiredFields) {
      if (!targetToColIndex.has(reqField)) {
        issues.push({
          field: reqField,
          severity: "error",
          category: "missing_required",
          message: `Required field "${IMPORT_FIELD_BY_KEY[reqField].label}" is not mapped to any uploaded column.`,
        });
      } else if (rowValueByKey[reqField].trim().length === 0) {
        issues.push({
          field: reqField,
          severity: "error",
          category: "missing_required",
          message: `Missing required value for ${IMPORT_FIELD_BY_KEY[reqField].label}.`,
        });
      }
    }

    // Validate contingent values if row has contingent entry or contingent fields provided
    const shouldValidateContingent =
      draft.resolvedEntryType === "contingent" || draft.hasAnyContingentData;

    let normalizedContingentCode: string | null = null;
    let normalizedContingentName: string | null = null;
    let normalizedContactEmail: string | null = draft.contactEmail || null;

    if (shouldValidateContingent) {
      if (
        draft.contingentCode &&
        draft.contingentName &&
        draft.institutionName
      ) {
        const contCheck = validateContingentInput({
          contingentCode: draft.contingentCode,
          name: draft.contingentName,
          institutionName: draft.institutionName,
          institutionCity: draft.institutionCity,
          externalRegistrationRef: draft.contingentExternalRef,
          contactEmail: draft.contactEmail,
          contactPhone: draft.contactPhone,
          isActive: true,
          notes: draft.contingentNotes,
        });
        if (!contCheck.ok) {
          issues.push({
            field: contCheck.error.toLowerCase().includes("email")
              ? "contact_email"
              : contCheck.error.toLowerCase().includes("code")
                ? "contingent_code"
                : "contingent_name",
            severity: "error",
            category: "invalid_value",
            message: contCheck.error,
          });
        } else {
          normalizedContingentCode = contCheck.value.contingent_code;
          normalizedContingentName = contCheck.value.name;
          normalizedContactEmail = contCheck.value.contact_email;
        }
      } else if (draft.hasAnyContingentData) {
        // Partial contingent data supplied in individual/hybrid row
        if (draft.contingentCode && !draft.contingentName) {
          issues.push({
            field: "contingent_name",
            severity: "error",
            category: "missing_required",
            message:
              "Contingent Name is required whenever Contingent Code is provided.",
          });
        }
        if (draft.contingentName && !draft.contingentCode) {
          issues.push({
            field: "contingent_code",
            severity: "error",
            category: "missing_required",
            message:
              "Contingent Code is required whenever Contingent Name is provided.",
          });
        }
      }
    }

    // Validate boolean flag & participant values via Stage 2A validateParticipantInput
    const leadBool = parseBooleanCell(draft.isContingentLeadRaw);
    if (!leadBool.ok) {
      issues.push({
        field: "is_contingent_lead",
        severity: "error",
        category: "invalid_value",
        message: leadBool.error,
      });
    }

    const isLeadValue = leadBool.ok ? leadBool.value : false;
    const hasContingentIdentity = Boolean(
      draft.contingentCode || draft.contingentName,
    );

    let normalizedParticipantCode: string | null =
      draft.participantCode ? draft.participantCode.toUpperCase() : null;
    let normalizedFullName: string | null = draft.fullName || null;
    let normalizedEmail: string | null = draft.email
      ? draft.email.toLowerCase()
      : null;

    if (isLeadValue && !hasContingentIdentity) {
      issues.push({
        field: "is_contingent_lead",
        severity: "error",
        category: "schema_rule",
        message:
          "An individual participant without a contingent cannot be marked as contingent lead.",
      });
    }

    if (
      draft.participantCode &&
      draft.fullName &&
      draft.institutionName
    ) {
      const partCheck = validateParticipantInput({
        contingentId: hasContingentIdentity ? SYNTHETIC_CONTINGENT_UUID : null,
        participantCode: draft.participantCode,
        fullName: draft.fullName,
        email: draft.email,
        phone: draft.phone,
        institutionName: draft.institutionName,
        externalRegistrationRef: draft.participantExternalRef,
        isContingentLead: hasContingentIdentity && isLeadValue,
        isActive: true,
      });

      if (!partCheck.ok) {
        issues.push({
          field: partCheck.error.toLowerCase().includes("email")
            ? "email"
            : partCheck.error.toLowerCase().includes("code")
              ? "participant_code"
              : partCheck.error.toLowerCase().includes("lead")
                ? "is_contingent_lead"
                : "full_name",
          severity: "error",
          category: "invalid_value",
          message: partCheck.error,
        });
      } else {
        normalizedParticipantCode = partCheck.value.participant_code;
        normalizedFullName = partCheck.value.full_name;
        normalizedEmail = partCheck.value.email;
      }
    } else if (draft.email) {
      // Even when required participant columns are missing, validate email format cleanly
      const emailCheck = validateParticipantInput({
        contingentId: null,
        participantCode: "TEMP01",
        fullName: "Placeholder Name",
        email: draft.email,
        institutionName: "Placeholder Institution",
        isContingentLead: false,
        isActive: true,
      });
      if (!emailCheck.ok) {
        issues.push({
          field: "email",
          severity: "error",
          category: "invalid_value",
          message: emailCheck.error,
        });
      }
    }

    // In-file duplicate detection
    const normPartCode = draft.participantCode.toUpperCase();
    if (normPartCode) {
      const matches = (participantCodeRows.get(normPartCode) ?? []).filter(
        (r) => r !== draft.row.rowNumber,
      );
      if (matches.length > 0) {
        const msg = `Duplicate participant code "${normPartCode}" also appears in spreadsheet row(s) ${matches.join(", ")}.`;
        inFileDuplicates.push({
          field: "participant_code",
          value: normPartCode,
          matchingRowNumbers: matches,
          message: msg,
        });
        issues.push({
          field: "participant_code",
          severity: "error",
          category: "duplicate_in_file",
          message: msg,
        });
      }
    }

    const normEmail = draft.email.toLowerCase();
    if (normEmail) {
      const matches = (participantEmailRows.get(normEmail) ?? []).filter(
        (r) => r !== draft.row.rowNumber,
      );
      if (matches.length > 0) {
        const msg = `Duplicate participant email "${normEmail}" also appears in spreadsheet row(s) ${matches.join(", ")}.`;
        inFileDuplicates.push({
          field: "email",
          value: normEmail,
          matchingRowNumbers: matches,
          message: msg,
        });
        issues.push({
          field: "email",
          severity: "error",
          category: "duplicate_in_file",
          message: msg,
        });
      }
    }

    const normPartExtRef = draft.participantExternalRef.toLowerCase();
    if (normPartExtRef) {
      const matches = (participantExtRefRows.get(normPartExtRef) ?? []).filter(
        (r) => r !== draft.row.rowNumber,
      );
      if (matches.length > 0) {
        const msg = `Duplicate external registration ref "${draft.participantExternalRef}" also appears in spreadsheet row(s) ${matches.join(", ")}.`;
        inFileDuplicates.push({
          field: "participant_external_ref",
          value: draft.participantExternalRef,
          matchingRowNumbers: matches,
          message: msg,
        });
        issues.push({
          field: "participant_external_ref",
          severity: "error",
          category: "duplicate_in_file",
          message: msg,
        });
      }
    }

    const normContCode = draft.contingentCode.toUpperCase();
    if (normContCode) {
      const siblings = contingentMetadataRows.get(normContCode) ?? [];
      const conflictingRows = siblings
        .filter(
          (s) =>
            s.rowNumber !== draft.row.rowNumber &&
            ((draft.contingentName &&
              s.name &&
              s.name !== draft.contingentName.toLowerCase()) ||
              (draft.institutionName &&
                s.institution &&
                s.institution !== draft.institutionName.toLowerCase())),
        )
        .map((s) => s.rowNumber);

      if (conflictingRows.length > 0) {
        const msg = `Contingent code "${normContCode}" has conflicting contingent name or institution in row(s) ${conflictingRows.join(", ")}.`;
        inFileDuplicates.push({
          field: "contingent_conflict",
          value: normContCode,
          matchingRowNumbers: conflictingRows,
          message: msg,
        });
        issues.push({
          field: "contingent_code",
          severity: "error",
          category: "duplicate_in_file",
          message: msg,
        });
      }

      if (draft.fullName) {
        const nameKey = `${normContCode}::${draft.fullName.toLowerCase()}`;
        const sameNameRows = (
          contingentMemberNameRows.get(nameKey) ?? []
        ).filter((r) => r !== draft.row.rowNumber);
        if (sameNameRows.length > 0) {
          const msg = `Participant name "${draft.fullName}" appears multiple times inside contingent ${normContCode} (row(s) ${sameNameRows.join(", ")}).`;
          inFileDuplicates.push({
            field: "contingent_member_name",
            value: draft.fullName,
            matchingRowNumbers: sameNameRows,
            message: msg,
          });
          issues.push({
            field: "full_name",
            severity: "warning",
            category: "duplicate_in_file",
            message: msg,
          });
        }
      }
    } else if (!normPartCode && draft.fullName && draft.institutionName) {
      const key = `${draft.fullName.toLowerCase()}::${draft.institutionName.toLowerCase()}`;
      const sameIndRows = (uncodedNameInstRows.get(key) ?? []).filter(
        (r) => r !== draft.row.rowNumber,
      );
      if (sameIndRows.length > 0) {
        const msg = `Participant "${draft.fullName}" from "${draft.institutionName}" appears again in row(s) ${sameIndRows.join(", ")}.`;
        inFileDuplicates.push({
          field: "individual_identity",
          value: draft.fullName,
          matchingRowNumbers: sameIndRows,
          message: msg,
        });
        issues.push({
          field: "full_name",
          severity: "error",
          category: "duplicate_in_file",
          message: msg,
        });
      }
    }

    // Existing CMS read-only match checks
    const seenMatchKeys = new Set<string>();
    const addExistingMatch = (notice: ExistingCmsMatchNotice) => {
      const dedupeKey = `${notice.entity}:${notice.existingId}:${notice.matchedBy}`;
      if (!seenMatchKeys.has(dedupeKey)) {
        seenMatchKeys.add(dedupeKey);
        existingMatches.push(notice);
      }
    };

    if (normContCode) {
      const existingCont = existingContingentByCode.get(normContCode);
      if (existingCont) {
        const alreadyInEvent = existing.enteredContingentIdsForEvent.has(
          existingCont.id,
        );
        addExistingMatch({
          entity: "contingent",
          matchedBy: "contingent_code",
          existingId: existingCont.id,
          existingLabel: `${existingCont.contingent_code} · ${existingCont.name}`,
          alreadyEnteredInSelectedEvent: alreadyInEvent,
          message: alreadyInEvent
            ? `Contingent ${existingCont.contingent_code} already exists in CMS and is already entered in ${event.code}.`
            : `Contingent ${existingCont.contingent_code} (${existingCont.name}) already exists in the CMS registry.`,
        });
      }
    }

    if (draft.contingentExternalRef) {
      const existingContExt = existingContingentByExtRef.get(
        draft.contingentExternalRef.toLowerCase(),
      );
      if (existingContExt) {
        const alreadyInEvent = existing.enteredContingentIdsForEvent.has(
          existingContExt.id,
        );
        addExistingMatch({
          entity: "contingent",
          matchedBy: "external_registration_ref",
          existingId: existingContExt.id,
          existingLabel: `${existingContExt.contingent_code} · ${existingContExt.name}`,
          alreadyEnteredInSelectedEvent: alreadyInEvent,
          message: alreadyInEvent
            ? `Contingent ref "${draft.contingentExternalRef}" matches ${existingContExt.contingent_code}, already entered in ${event.code}.`
            : `Contingent ref "${draft.contingentExternalRef}" matches existing contingent ${existingContExt.contingent_code}.`,
        });
      }
    }

    if (normPartCode) {
      const existingPart = existingParticipantByCode.get(normPartCode);
      if (existingPart) {
        const alreadyInEvent = existing.enteredParticipantIdsForEvent.has(
          existingPart.id,
        );
        addExistingMatch({
          entity: "participant",
          matchedBy: "participant_code",
          existingId: existingPart.id,
          existingLabel: `${existingPart.participant_code} · ${existingPart.full_name}`,
          alreadyEnteredInSelectedEvent: alreadyInEvent,
          message: alreadyInEvent
            ? `Participant ${existingPart.participant_code} (${existingPart.full_name}) already exists and is entered in ${event.code}.`
            : `Participant ${existingPart.participant_code} (${existingPart.full_name}) already exists in the CMS registry.`,
        });
      }
    }

    if (normEmail) {
      const existingPartByEmail = existingParticipantByEmail.get(normEmail);
      if (existingPartByEmail) {
        const alreadyInEvent = existing.enteredParticipantIdsForEvent.has(
          existingPartByEmail.id,
        );
        addExistingMatch({
          entity: "participant",
          matchedBy: "email",
          existingId: existingPartByEmail.id,
          existingLabel: `${existingPartByEmail.participant_code} · ${existingPartByEmail.full_name}`,
          alreadyEnteredInSelectedEvent: alreadyInEvent,
          message: alreadyInEvent
            ? `Email "${normEmail}" matches existing participant ${existingPartByEmail.participant_code} who is already entered in ${event.code}.`
            : `Email "${normEmail}" matches existing participant ${existingPartByEmail.participant_code} (${existingPartByEmail.full_name}).`,
        });
      }
    }

    if (normPartExtRef) {
      const existingPartByExt = existingParticipantByExtRef.get(normPartExtRef);
      if (existingPartByExt) {
        const alreadyInEvent = existing.enteredParticipantIdsForEvent.has(
          existingPartByExt.id,
        );
        addExistingMatch({
          entity: "participant",
          matchedBy: "external_registration_ref",
          existingId: existingPartByExt.id,
          existingLabel: `${existingPartByExt.participant_code} · ${existingPartByExt.full_name}`,
          alreadyEnteredInSelectedEvent: alreadyInEvent,
          message: alreadyInEvent
            ? `External ref "${draft.participantExternalRef}" matches ${existingPartByExt.participant_code}, already entered in ${event.code}.`
            : `External ref "${draft.participantExternalRef}" matches existing participant ${existingPartByExt.participant_code}.`,
        });
      }
    }

    const hasError = issues.some((issue) => issue.severity === "error");

    return {
      rowNumber: draft.row.rowNumber,
      status: hasError ? "invalid" : "valid",
      resolvedEntryType: draft.resolvedEntryType,
      normalized: {
        entryType: draft.resolvedEntryType,
        entryStatus: resolvedEntryStatus,
        entryNotes: draft.entryNotes || null,
        sourceEventCode: draft.sourceEventCode || null,
        contingent: shouldValidateContingent
          ? {
              contingentCode:
                normalizedContingentCode ??
                (draft.contingentCode ? draft.contingentCode.toUpperCase() : null),
              name: normalizedContingentName ?? (draft.contingentName || null),
              institutionName: draft.institutionName || null,
              institutionCity: draft.institutionCity || null,
              externalRegistrationRef: draft.contingentExternalRef || null,
              contactEmail: normalizedContactEmail,
              contactPhone: draft.contactPhone || null,
              notes: draft.contingentNotes || null,
            }
          : null,
        participant: {
          participantCode: normalizedParticipantCode,
          fullName: normalizedFullName,
          email: normalizedEmail,
          phone: draft.phone || null,
          institutionName: draft.institutionName || null,
          externalRegistrationRef: draft.participantExternalRef || null,
          isContingentLead: Boolean(hasContingentIdentity && isLeadValue),
        },
      },
      issues,
      inFileDuplicates,
      existingMatches,
    };
  });

  const validRows = previewRows.filter((r) => r.status === "valid").length;
  const invalidRows = previewRows.length - validRows;
  const inFileDuplicateRows = previewRows.filter(
    (r) => r.inFileDuplicates.length > 0,
  ).length;
  const existingMatchRows = previewRows.filter(
    (r) => r.existingMatches.length > 0,
  ).length;

  return {
    event,
    requiredTargetFields,
    missingRequiredTargetFields,
    unmappedSourceColumns,
    unmappedTargetFields,
    summary: {
      totalRows: previewRows.length,
      validRows,
      invalidRows,
      inFileDuplicateRows,
      existingMatchRows,
      missingRequiredFieldCount: missingRequiredTargetFields.length,
      unmappedSourceColumnsCount: unmappedSourceColumns.length,
      unmappedTargetFieldsCount: unmappedTargetFields.length,
    },
    previewRows,
    batchNotices,
  };
}
