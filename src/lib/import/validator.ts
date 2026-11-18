import type {
  ColumnMappingItem,
  ExistingRecordDiff,
  ImportCandidateContingent,
  ImportCandidateEntry,
  ImportCandidateParticipant,
  ImportErrorDetail,
  ImportPreviewResult,
  MissingRecordNotice,
} from "@/types/data-operations";
import type {
  ContingentRecord,
  EventEntryRecord,
  EventRecord,
  ParticipantRecord,
} from "@/types/competition";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(val: string | undefined | null): string {
  return val ? val.trim() : "";
}

function parseBoolean(val: string | undefined | null): boolean {
  if (!val) return false;
  const s = val.trim().toLowerCase();
  return s === "true" || s === "yes" || s === "1" || s === "y" || s === "lead";
}

export interface ValidateImportOptions {
  fileName: string;
  fileSizeBytes: number;
  rows: Record<string, string>[];
  mappings: ColumnMappingItem[];
  existingEvents: EventRecord[];
  existingContingents: ContingentRecord[];
  existingParticipants: ParticipantRecord[];
  existingEntries: EventEntryRecord[];
}

export function validateAndPreviewImport({
  fileName,
  fileSizeBytes,
  rows,
  mappings,
  existingEvents,
  existingContingents,
  existingParticipants,
  existingEntries,
}: ValidateImportOptions): ImportPreviewResult {
  const errors: ImportErrorDetail[] = [];
  const fieldToCol = new Map<string, string>();
  for (const m of mappings) {
    if (m.targetField !== "ignore") {
      fieldToCol.set(m.targetField, m.sourceColumn);
    }
  }

  // Maps for existing DB lookups
  const dbContingentByCode = new Map<string, ContingentRecord>();
  const dbContingentByRef = new Map<string, ContingentRecord>();
  for (const c of existingContingents) {
    dbContingentByCode.set(c.contingent_code.toLowerCase().trim(), c);
    if (c.external_registration_ref) {
      dbContingentByRef.set(c.external_registration_ref.trim(), c);
    }
  }

  const dbParticipantByCode = new Map<string, ParticipantRecord>();
  const dbParticipantByRef = new Map<string, ParticipantRecord>();
  for (const p of existingParticipants) {
    dbParticipantByCode.set(p.participant_code.toLowerCase().trim(), p);
    if (p.external_registration_ref) {
      dbParticipantByRef.set(p.external_registration_ref.trim(), p);
    }
  }

  const dbEventByCode = new Map<string, EventRecord>();
  for (const ev of existingEvents) {
    dbEventByCode.set(ev.code.toUpperCase().trim(), ev);
  }

  // Tracking processed items in this file to detect within-file duplicates
  const fileContingents = new Map<string, ImportCandidateContingent>();
  const fileParticipants = new Map<string, ImportCandidateParticipant>();
  const fileEntries: ImportCandidateEntry[] = [];
  const differences: ExistingRecordDiff[] = [];

  const contingentCodeRows = new Map<string, number[]>();
  const participantCodeRows = new Map<string, number[]>();
  const extRefRows = new Map<string, number[]>();

  const seenContingentCodes = new Set<string>();
  const seenParticipantCodes = new Set<string>();

  // Process row by row
  rows.forEach((row, idx) => {
    const rowNum = idx + 2; // +1 for 0-index, +1 for header row
    const getVal = (field: string) => {
      const col = fieldToCol.get(field);
      return col ? clean(row[col]) : "";
    };

    // Extract Contingent info
    const contingentCode = getVal("contingent_code");
    const contingentName = getVal("contingent_name");
    const institutionName = getVal("institution_name");
    const institutionCity = getVal("institution_city") || null;
    const contactEmail = getVal("contact_email") || null;
    const contactPhone = getVal("contact_phone") || null;
    const contingentExtRef = getVal("contingent_ext_ref") || null;
    const contingentNotes = getVal("contingent_notes") || null;

    // Extract Participant info
    const participantCode = getVal("participant_code");
    const participantName = getVal("participant_name");
    const participantEmail = getVal("participant_email") || null;
    const participantPhone = getVal("participant_phone") || null;
    const participantInst = getVal("participant_institution") || institutionName;
    const isLead = parseBoolean(getVal("is_contingent_lead"));
    const participantExtRef = getVal("participant_ext_ref") || null;
    const memberContingentCode =
      getVal("member_contingent_code") || contingentCode || null;

    // Extract Event Entry info
    const entryEventCode = getVal("entry_event_code");
    const rawEntryType = getVal("entry_type").toLowerCase();

    // 1. Validate Contingent if present
    if (contingentCode || contingentName || institutionName) {
      if (!contingentCode) {
        errors.push({
          rowNumber: rowNum,
          field: "contingent_code",
          message: "Row contains contingent details but contingent code is missing.",
        });
      } else if (contingentCode.length < 2 || contingentCode.length > 40) {
        errors.push({
          rowNumber: rowNum,
          field: "contingent_code",
          message: `Contingent code "${contingentCode}" must be between 2 and 40 characters.`,
        });
      }

      if (!contingentName) {
        errors.push({
          rowNumber: rowNum,
          field: "contingent_name",
          message: "Contingent name is required.",
        });
      } else if (contingentName.length < 2 || contingentName.length > 160) {
        errors.push({
          rowNumber: rowNum,
          field: "contingent_name",
          message: `Contingent name must be between 2 and 160 characters.`,
        });
      }

      if (!institutionName) {
        errors.push({
          rowNumber: rowNum,
          field: "institution_name",
          message: "Institution name is required for contingent.",
        });
      } else if (institutionName.length < 2 || institutionName.length > 200) {
        errors.push({
          rowNumber: rowNum,
          field: "institution_name",
          message: `Institution name must be between 2 and 200 characters.`,
        });
      }

      if (contactEmail && !EMAIL_REGEX.test(contactEmail)) {
        errors.push({
          rowNumber: rowNum,
          field: "contact_email",
          message: `Invalid email format "${contactEmail}".`,
        });
      }

      if (contingentCode) {
        const normCode = contingentCode.toLowerCase();
        seenContingentCodes.add(normCode);
        const rowsForCode = contingentCodeRows.get(normCode) ?? [];
        rowsForCode.push(rowNum);
        contingentCodeRows.set(normCode, rowsForCode);

        if (contingentExtRef) {
          const rowsForRef = extRefRows.get(contingentExtRef) ?? [];
          rowsForRef.push(rowNum);
          extRefRows.set(contingentExtRef, rowsForRef);
        }

        // Check if existing in DB
        const existing =
          dbContingentByCode.get(normCode) ||
          (contingentExtRef ? dbContingentByRef.get(contingentExtRef) : undefined);

        if (!fileContingents.has(normCode)) {
          fileContingents.set(normCode, {
            code: contingentCode.toUpperCase(),
            name: contingentName || contingentCode,
            institutionName: institutionName || "SJCC",
            institutionCity,
            contactEmail,
            contactPhone,
            externalRef: contingentExtRef,
            notes: contingentNotes,
            isExisting: Boolean(existing),
            existingId: existing?.id,
          });

          if (existing) {
            // Check differences
            if (contingentName && contingentName !== existing.name) {
              differences.push({
                entityType: "contingent",
                identifier: existing.contingent_code,
                name: existing.name,
                field: "Name",
                oldValue: existing.name,
                newValue: contingentName,
              });
            }
            if (
              institutionCity &&
              institutionCity !== (existing.institution_city ?? "")
            ) {
              differences.push({
                entityType: "contingent",
                identifier: existing.contingent_code,
                name: existing.name,
                field: "City",
                oldValue: existing.institution_city,
                newValue: institutionCity,
              });
            }
            if (
              contactEmail &&
              contactEmail !== (existing.contact_email ?? "")
            ) {
              differences.push({
                entityType: "contingent",
                identifier: existing.contingent_code,
                name: existing.name,
                field: "Email",
                oldValue: existing.contact_email,
                newValue: contactEmail,
              });
            }
            if (
              contactPhone &&
              contactPhone !== (existing.contact_phone ?? "")
            ) {
              differences.push({
                entityType: "contingent",
                identifier: existing.contingent_code,
                name: existing.name,
                field: "Phone",
                oldValue: existing.contact_phone,
                newValue: contactPhone,
              });
            }
          }
        }
      }
    }

    // 2. Validate Participant if present
    if (participantCode || participantName) {
      if (!participantCode) {
        errors.push({
          rowNumber: rowNum,
          field: "participant_code",
          message: "Participant code is missing.",
        });
      } else if (participantCode.length < 2 || participantCode.length > 40) {
        errors.push({
          rowNumber: rowNum,
          field: "participant_code",
          message: `Participant code "${participantCode}" must be between 2 and 40 characters.`,
        });
      }

      if (!participantName) {
        errors.push({
          rowNumber: rowNum,
          field: "participant_name",
          message: "Participant full name is required.",
        });
      } else if (participantName.length < 2 || participantName.length > 160) {
        errors.push({
          rowNumber: rowNum,
          field: "participant_name",
          message: `Participant name must be between 2 and 160 characters.`,
        });
      }

      if (!participantInst) {
        errors.push({
          rowNumber: rowNum,
          field: "participant_institution",
          message: "Participant institution name is required.",
        });
      }

      if (participantEmail && !EMAIL_REGEX.test(participantEmail)) {
        errors.push({
          rowNumber: rowNum,
          field: "participant_email",
          message: `Invalid email format "${participantEmail}".`,
        });
      }

      if (isLead && !memberContingentCode) {
        errors.push({
          rowNumber: rowNum,
          field: "is_contingent_lead",
          message: "Contingent lead must be linked to a contingent code.",
        });
      }

      if (participantCode) {
        const normCode = participantCode.toLowerCase();
        seenParticipantCodes.add(normCode);
        const rowsForPart = participantCodeRows.get(normCode) ?? [];
        rowsForPart.push(rowNum);
        participantCodeRows.set(normCode, rowsForPart);

        const existing =
          dbParticipantByCode.get(normCode) ||
          (participantExtRef ? dbParticipantByRef.get(participantExtRef) : undefined);

        if (!fileParticipants.has(normCode)) {
          fileParticipants.set(normCode, {
            code: participantCode.toUpperCase(),
            fullName: participantName || participantCode,
            email: participantEmail,
            phone: participantPhone,
            institutionName: participantInst || "SJCC",
            contingentCode: memberContingentCode
              ? memberContingentCode.toUpperCase()
              : null,
            isContingentLead: isLead,
            externalRef: participantExtRef,
            isExisting: Boolean(existing),
            existingId: existing?.id,
          });

          if (existing) {
            if (participantName && participantName !== existing.full_name) {
              differences.push({
                entityType: "participant",
                identifier: existing.participant_code,
                name: existing.full_name,
                field: "Name",
                oldValue: existing.full_name,
                newValue: participantName,
              });
            }
            if (
              participantEmail &&
              participantEmail !== (existing.email ?? "")
            ) {
              differences.push({
                entityType: "participant",
                identifier: existing.participant_code,
                name: existing.full_name,
                field: "Email",
                oldValue: existing.email,
                newValue: participantEmail,
              });
            }
            if (
              participantPhone &&
              participantPhone !== (existing.phone ?? "")
            ) {
              differences.push({
                entityType: "participant",
                identifier: existing.participant_code,
                name: existing.full_name,
                field: "Phone",
                oldValue: existing.phone,
                newValue: participantPhone,
              });
            }
          }
        }
      }
    }

    // 3. Validate Event Entry if present
    if (entryEventCode) {
      const normEvCode = entryEventCode.toUpperCase();
      const eventRecord = dbEventByCode.get(normEvCode);
      if (!eventRecord) {
        errors.push({
          rowNumber: rowNum,
          field: "entry_event_code",
          message: `Event code "${entryEventCode}" does not match any configured event in the CMS.`,
        });
      } else {
        const determinedType: "contingent" | "individual" =
          rawEntryType === "individual" || (!contingentCode && participantCode)
            ? "individual"
            : "contingent";

        if (determinedType === "contingent" && !contingentCode) {
          errors.push({
            rowNumber: rowNum,
            field: "entry_type",
            message: "Contingent event entry requires a valid contingent code.",
          });
        } else if (determinedType === "individual" && !participantCode) {
          errors.push({
            rowNumber: rowNum,
            field: "entry_type",
            message: "Individual event entry requires a valid participant code.",
          });
        } else {
          // Check if already entered in DB
          let alreadyEntered = false;
          const matchingEventId = eventRecord.id;

          if (determinedType === "contingent") {
            const dbC = dbContingentByCode.get(contingentCode.toLowerCase());
            if (dbC) {
              alreadyEntered = existingEntries.some(
                (e) =>
                  e.event_id === matchingEventId &&
                  e.contingent_id === dbC.id,
              );
            }
          } else {
            const dbP = dbParticipantByCode.get(participantCode.toLowerCase());
            if (dbP) {
              alreadyEntered = existingEntries.some(
                (e) =>
                  e.event_id === matchingEventId &&
                  e.participant_id === dbP.id,
              );
            }
          }

          fileEntries.push({
            eventCode: normEvCode,
            entryType: determinedType,
            contingentCode: contingentCode ? contingentCode.toUpperCase() : undefined,
            participantCode: participantCode ? participantCode.toUpperCase() : undefined,
            isExisting: alreadyEntered,
          });
        }
      }
    }
  });

  // Potential duplicates in file
  const potentialDuplicates: ImportPreviewResult["potentialDuplicates"] = [];
  for (const [code, rowsWithCode] of contingentCodeRows.entries()) {
    if (rowsWithCode.length > 1) {
      // If same code appears in multiple rows with different names, note it
      potentialDuplicates.push({
        type: "contingent_code",
        value: code.toUpperCase(),
        rowNumbers: rowsWithCode,
      });
    }
  }

  for (const [code, rowsWithCode] of participantCodeRows.entries()) {
    if (rowsWithCode.length > 1) {
      potentialDuplicates.push({
        type: "participant_code",
        value: code.toUpperCase(),
        rowNumbers: rowsWithCode,
      });
    }
  }

  for (const [ref, rowsWithRef] of extRefRows.entries()) {
    if (rowsWithRef.length > 1) {
      potentialDuplicates.push({
        type: "external_ref",
        value: ref,
        rowNumbers: rowsWithRef,
      });
    }
  }

  // Missing records: existing active contingents / participants in DB not in file
  const missingFromImport: MissingRecordNotice[] = [];
  for (const c of existingContingents) {
    if (c.is_active && !seenContingentCodes.has(c.contingent_code.toLowerCase())) {
      missingFromImport.push({
        entityType: "contingent",
        code: c.contingent_code,
        name: c.name,
        institutionName: c.institution_name,
      });
    }
  }

  for (const p of existingParticipants) {
    if (p.is_active && !seenParticipantCodes.has(p.participant_code.toLowerCase())) {
      missingFromImport.push({
        entityType: "participant",
        code: p.participant_code,
        name: p.full_name,
        institutionName: p.institution_name,
      });
    }
  }

  const newContingents = Array.from(fileContingents.values()).filter(
    (c) => !c.isExisting,
  );
  const existingContingentsList = Array.from(fileContingents.values()).filter(
    (c) => c.isExisting,
  );

  const newParticipants = Array.from(fileParticipants.values()).filter(
    (p) => !p.isExisting,
  );
  const existingParticipantsList = Array.from(fileParticipants.values()).filter(
    (p) => p.isExisting,
  );

  const newEntries = fileEntries.filter((e) => !e.isExisting);
  const existingEntriesList = fileEntries.filter((e) => e.isExisting);

  const invalidRowSet = new Set(errors.map((e) => e.rowNumber));
  const validRowsCount = Math.max(0, rows.length - invalidRowSet.size);

  return {
    fileName,
    fileSizeBytes,
    totalRows: rows.length,
    validRowsCount,
    invalidRowsCount: invalidRowSet.size,
    errors,
    potentialDuplicates,
    newContingents,
    existingContingents: existingContingentsList,
    newParticipants,
    existingParticipants: existingParticipantsList,
    newEntries,
    existingEntries: existingEntriesList,
    differences,
    missingFromImport,
    detectedMappings: mappings,
  };
}
