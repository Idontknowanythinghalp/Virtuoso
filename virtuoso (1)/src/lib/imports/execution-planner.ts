import crypto from "node:crypto";
import {
  validateContingentInput,
  validateEventEntryStatus,
  validateParticipantInput,
} from "@/lib/competition/validation";
import {
  CONTINGENT_UPDATABLE_FIELDS,
  PARTICIPANT_UPDATABLE_FIELDS,
  type ApprovedUpdateAuditItem,
  type ContingentExecutionOp,
  type ContingentUpdatableField,
  type EventEntryExecutionOp,
  type IdentityConflictCandidate,
  type IdentityConflictNotice,
  type ImportExecutionPlan,
  type ImportPreviewRow,
  type ImportResolutionContext,
  type ImportResolutionSelection,
  type ImportValidationReport,
  type MatchedRecordReviewItem,
  type MissingFromFileEntryNotice,
  type ParticipantExecutionOp,
  type ParticipantUpdatableField,
  type RecordFieldDiff,
} from "@/types/imports";
import type { EventEntryStatus, EventEntryType } from "@/types/competition";

const SYNTHETIC_CONTINGENT_UUID = "00000000-0000-4000-8000-000000000001";

export interface ExistingContingentFullItem {
  id: string;
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

export interface ExistingParticipantFullItem {
  id: string;
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

export interface ExistingEventEntryFullItem {
  id: string;
  event_id: string;
  entry_type: EventEntryType;
  contingent_id: string | null;
  participant_id: string | null;
  status: EventEntryStatus;
}

export interface ExecutionCmsContext {
  contingents: readonly ExistingContingentFullItem[];
  participants: readonly ExistingParticipantFullItem[];
  eventEntries: readonly ExistingEventEntryFullItem[];
}

const CONTINGENT_FIELD_LABELS: Record<ContingentUpdatableField, string> = {
  name: "Contingent / Team Name",
  institution_name: "Institution Name",
  institution_city: "Institution City",
  external_registration_ref: "External Registration Ref",
  contact_email: "Contact Email",
  contact_phone: "Contact Phone",
  notes: "Contingent Notes",
};

const PARTICIPANT_FIELD_LABELS: Record<ParticipantUpdatableField, string> = {
  full_name: "Full Name",
  email: "Email",
  phone: "Phone",
  institution_name: "Institution Name",
  external_registration_ref: "External Registration Ref",
  is_contingent_lead: "Contingent Lead",
};

function normCompare(value: string | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return value.trim();
}

type EntityLookupResult<TRecord> =
  | { kind: "none" }
  | { kind: "matched"; record: TRecord; matchedBy: string[] }
  | { kind: "conflict"; conflict: IdentityConflictNotice };

function pushMapArray<T>(map: Map<string, T[]>, key: string, value: T) {
  const existing = map.get(key);
  if (existing) {
    existing.push(value);
  } else {
    map.set(key, [value]);
  }
}

function buildCmsLookupIndexes(cmsContext: ExecutionCmsContext) {
  const contingentsById = new Map(cmsContext.contingents.map((c) => [c.id, c]));
  const contingentsByCode = new Map<string, ExistingContingentFullItem[]>();
  const contingentsByExtRef = new Map<string, ExistingContingentFullItem[]>();

  for (const c of cmsContext.contingents) {
    pushMapArray(
      contingentsByCode,
      c.contingent_code.trim().toUpperCase(),
      c,
    );
    if (c.external_registration_ref) {
      pushMapArray(
        contingentsByExtRef,
        c.external_registration_ref.trim().toLowerCase(),
        c,
      );
    }
  }

  const participantsById = new Map(
    cmsContext.participants.map((p) => [p.id, p]),
  );
  const participantsByCode = new Map<string, ExistingParticipantFullItem[]>();
  const participantsByEmail = new Map<string, ExistingParticipantFullItem[]>();
  const participantsByExtRef = new Map<string, ExistingParticipantFullItem[]>();

  for (const p of cmsContext.participants) {
    pushMapArray(
      participantsByCode,
      p.participant_code.trim().toUpperCase(),
      p,
    );
    if (p.email) {
      pushMapArray(participantsByEmail, p.email.trim().toLowerCase(), p);
    }
    if (p.external_registration_ref) {
      pushMapArray(
        participantsByExtRef,
        p.external_registration_ref.trim().toLowerCase(),
        p,
      );
    }
  }

  return {
    contingentsById,
    contingentsByCode,
    contingentsByExtRef,
    participantsById,
    participantsByCode,
    participantsByEmail,
    participantsByExtRef,
  };
}

function formatConflictExplanation(
  rowNumber: number,
  entity: "contingent" | "participant",
  candidates: readonly IdentityConflictCandidate[],
): string {
  const details = candidates
    .map(
      (c) =>
        `${c.identifier} "${c.suppliedValue}" matches ${c.matchedRecordLabel}`,
    )
    .join("; ");
  return `Row #${rowNumber} ${entity} identity conflict: ${details}. Correct the source file or mapping and revalidate, or skip this row.`;
}

function findMatchedContingent(
  row: ImportPreviewRow,
  contingentsByCode: Map<string, ExistingContingentFullItem[]>,
  contingentsByExtRef: Map<string, ExistingContingentFullItem[]>,
): EntityLookupResult<ExistingContingentFullItem> {
  const cont = row.normalized.contingent;
  if (!cont) return { kind: "none" };

  const candidates: IdentityConflictCandidate[] = [];
  const recordsById = new Map<string, ExistingContingentFullItem>();

  if (cont.contingentCode) {
    const matches =
      contingentsByCode.get(cont.contingentCode.trim().toUpperCase()) ?? [];
    for (const rec of matches) {
      recordsById.set(rec.id, rec);
      candidates.push({
        identifier: "contingent_code",
        identifierLabel: "Contingent Code",
        suppliedValue: cont.contingentCode.trim(),
        matchedRecordId: rec.id,
        matchedRecordCode: rec.contingent_code,
        matchedRecordLabel: `${rec.contingent_code} · ${rec.name}`,
      });
    }
  }

  if (cont.externalRegistrationRef) {
    const matches =
      contingentsByExtRef.get(
        cont.externalRegistrationRef.trim().toLowerCase(),
      ) ?? [];
    for (const rec of matches) {
      recordsById.set(rec.id, rec);
      candidates.push({
        identifier: "external_registration_ref",
        identifierLabel: "Contingent External Ref",
        suppliedValue: cont.externalRegistrationRef.trim(),
        matchedRecordId: rec.id,
        matchedRecordCode: rec.contingent_code,
        matchedRecordLabel: `${rec.contingent_code} · ${rec.name}`,
      });
    }
  }

  if (recordsById.size === 0) {
    return { kind: "none" };
  }

  if (recordsById.size > 1) {
    return {
      kind: "conflict",
      conflict: {
        conflictKey: `contingent:row:${row.rowNumber}`,
        entity: "contingent",
        rowNumber: row.rowNumber,
        candidates,
        message: formatConflictExplanation(
          row.rowNumber,
          "contingent",
          candidates,
        ),
      },
    };
  }

  const [matched] = Array.from(recordsById.values());
  const matchedBy = Array.from(new Set(candidates.map((c) => c.identifier)));
  return { kind: "matched", record: matched, matchedBy };
}

function findMatchedParticipant(
  row: ImportPreviewRow,
  participantsByCode: Map<string, ExistingParticipantFullItem[]>,
  participantsByEmail: Map<string, ExistingParticipantFullItem[]>,
  participantsByExtRef: Map<string, ExistingParticipantFullItem[]>,
): EntityLookupResult<ExistingParticipantFullItem> {
  const part = row.normalized.participant;
  const candidates: IdentityConflictCandidate[] = [];
  const recordsById = new Map<string, ExistingParticipantFullItem>();

  if (part.participantCode) {
    const matches =
      participantsByCode.get(part.participantCode.trim().toUpperCase()) ?? [];
    for (const rec of matches) {
      recordsById.set(rec.id, rec);
      candidates.push({
        identifier: "participant_code",
        identifierLabel: "Participant Code",
        suppliedValue: part.participantCode.trim(),
        matchedRecordId: rec.id,
        matchedRecordCode: rec.participant_code,
        matchedRecordLabel: `${rec.participant_code} · ${rec.full_name}`,
      });
    }
  }

  if (part.externalRegistrationRef) {
    const matches =
      participantsByExtRef.get(
        part.externalRegistrationRef.trim().toLowerCase(),
      ) ?? [];
    for (const rec of matches) {
      recordsById.set(rec.id, rec);
      candidates.push({
        identifier: "external_registration_ref",
        identifierLabel: "Participant External Ref",
        suppliedValue: part.externalRegistrationRef.trim(),
        matchedRecordId: rec.id,
        matchedRecordCode: rec.participant_code,
        matchedRecordLabel: `${rec.participant_code} · ${rec.full_name}`,
      });
    }
  }

  if (part.email) {
    const matches =
      participantsByEmail.get(part.email.trim().toLowerCase()) ?? [];
    for (const rec of matches) {
      recordsById.set(rec.id, rec);
      candidates.push({
        identifier: "email",
        identifierLabel: "Participant Email",
        suppliedValue: part.email.trim(),
        matchedRecordId: rec.id,
        matchedRecordCode: rec.participant_code,
        matchedRecordLabel: `${rec.participant_code} · ${rec.full_name}`,
      });
    }
  }

  if (recordsById.size === 0) {
    return { kind: "none" };
  }

  if (recordsById.size > 1) {
    return {
      kind: "conflict",
      conflict: {
        conflictKey: `participant:row:${row.rowNumber}`,
        entity: "participant",
        rowNumber: row.rowNumber,
        candidates,
        message: formatConflictExplanation(
          row.rowNumber,
          "participant",
          candidates,
        ),
      },
    };
  }

  const [matched] = Array.from(recordsById.values());
  const matchedBy = Array.from(new Set(candidates.map((c) => c.identifier)));
  return { kind: "matched", record: matched, matchedBy };
}

function buildContingentDiffs(
  existing: ExistingContingentFullItem,
  incoming: NonNullable<ImportPreviewRow["normalized"]["contingent"]>,
): RecordFieldDiff[] {
  const pairs: Array<{
    field: ContingentUpdatableField;
    current: string | null;
    next: string | null;
  }> = [
    { field: "name", current: existing.name, next: incoming.name },
    {
      field: "institution_name",
      current: existing.institution_name,
      next: incoming.institutionName,
    },
    {
      field: "institution_city",
      current: existing.institution_city,
      next: incoming.institutionCity,
    },
    {
      field: "external_registration_ref",
      current: existing.external_registration_ref,
      next: incoming.externalRegistrationRef,
    },
    {
      field: "contact_email",
      current: existing.contact_email,
      next: incoming.contactEmail,
    },
    {
      field: "contact_phone",
      current: existing.contact_phone,
      next: incoming.contactPhone,
    },
    { field: "notes", current: existing.notes, next: incoming.notes },
  ];

  const diffs: RecordFieldDiff[] = [];
  for (const item of pairs) {
    // Only flag a diff if incoming file actually supplies a non-empty value or differs meaningfully
    if (item.next === null || item.next.trim() === "") continue;
    if (normCompare(item.current) !== normCompare(item.next)) {
      diffs.push({
        field: item.field,
        label: CONTINGENT_FIELD_LABELS[item.field],
        currentValue: item.current,
        incomingValue: item.next,
        allowedToUpdate: true,
      });
    }
  }
  return diffs;
}

function buildParticipantDiffs(
  existing: ExistingParticipantFullItem,
  incoming: ImportPreviewRow["normalized"]["participant"],
): RecordFieldDiff[] {
  const pairs: Array<{
    field: ParticipantUpdatableField;
    current: string | null;
    next: string | null;
  }> = [
    { field: "full_name", current: existing.full_name, next: incoming.fullName },
    { field: "email", current: existing.email, next: incoming.email },
    { field: "phone", current: existing.phone, next: incoming.phone },
    {
      field: "institution_name",
      current: existing.institution_name,
      next: incoming.institutionName,
    },
    {
      field: "external_registration_ref",
      current: existing.external_registration_ref,
      next: incoming.externalRegistrationRef,
    },
    {
      field: "is_contingent_lead",
      current: existing.is_contingent_lead ? "true" : "false",
      next: incoming.isContingentLead ? "true" : "false",
    },
  ];

  const diffs: RecordFieldDiff[] = [];
  for (const item of pairs) {
    if (item.next === null || item.next.trim() === "") continue;
    if (item.field === "is_contingent_lead") {
      // Only suggest lead change if existing isn't already matching AND participant has a contingent
      if (
        normCompare(item.current) !== normCompare(item.next) &&
        existing.contingent_id !== null
      ) {
        diffs.push({
          field: item.field,
          label: PARTICIPANT_FIELD_LABELS[item.field],
          currentValue: item.current,
          incomingValue: item.next,
          allowedToUpdate: true,
        });
      }
      continue;
    }
    if (normCompare(item.current) !== normCompare(item.next)) {
      diffs.push({
        field: item.field,
        label: PARTICIPANT_FIELD_LABELS[item.field],
        currentValue: item.current,
        incomingValue: item.next,
        allowedToUpdate: true,
      });
    }
  }
  return diffs;
}

export function buildResolutionContext(params: {
  report: ImportValidationReport;
  cmsContext: ExecutionCmsContext;
}): ImportResolutionContext {
  const { report, cmsContext } = params;

  const {
    contingentsById,
    contingentsByCode,
    contingentsByExtRef,
    participantsById,
    participantsByCode,
    participantsByEmail,
    participantsByExtRef,
  } = buildCmsLookupIndexes(cmsContext);

  const enteredContingentIds = new Set<string>();
  const enteredParticipantIds = new Set<string>();
  for (const entry of cmsContext.eventEntries) {
    if (entry.contingent_id) enteredContingentIds.add(entry.contingent_id);
    if (entry.participant_id) enteredParticipantIds.add(entry.participant_id);
  }

  const matchedMap = new Map<string, MatchedRecordReviewItem>();
  const identityConflicts: IdentityConflictNotice[] = [];
  const seenIncomingContingentIds = new Set<string>();
  const seenIncomingParticipantIds = new Set<string>();

  for (const row of report.previewRows) {
    const contLookup = findMatchedContingent(
      row,
      contingentsByCode,
      contingentsByExtRef,
    );
    if (contLookup.kind === "conflict") {
      identityConflicts.push(contLookup.conflict);
    } else if (contLookup.kind === "matched") {
      seenIncomingContingentIds.add(contLookup.record.id);
      const matchKey = `contingent:${contLookup.record.id}`;
      const existingItem = matchedMap.get(matchKey);
      const diffs = row.normalized.contingent
        ? buildContingentDiffs(contLookup.record, row.normalized.contingent)
        : [];
      if (!existingItem) {
        matchedMap.set(matchKey, {
          matchKey,
          entity: "contingent",
          existingId: contLookup.record.id,
          existingCode: contLookup.record.contingent_code,
          existingLabel: `${contLookup.record.contingent_code} · ${contLookup.record.name}`,
          existingIsActive: contLookup.record.is_active,
          alreadyEnteredInSelectedEvent: enteredContingentIds.has(
            contLookup.record.id,
          ),
          matchedBy: contLookup.matchedBy,
          rowNumbers: [row.rowNumber],
          fieldDiffs: diffs,
          hasAllowedChanges: diffs.length > 0,
        });
      } else {
        existingItem.rowNumbers.push(row.rowNumber);
        for (const m of contLookup.matchedBy) {
          if (!existingItem.matchedBy.includes(m)) {
            existingItem.matchedBy.push(m);
          }
        }
      }
    }

    const partLookup = findMatchedParticipant(
      row,
      participantsByCode,
      participantsByEmail,
      participantsByExtRef,
    );
    if (partLookup.kind === "conflict") {
      identityConflicts.push(partLookup.conflict);
    } else if (partLookup.kind === "matched") {
      seenIncomingParticipantIds.add(partLookup.record.id);
      const matchKey = `participant:${partLookup.record.id}`;
      const existingItem = matchedMap.get(matchKey);
      const diffs = buildParticipantDiffs(
        partLookup.record,
        row.normalized.participant,
      );
      if (!existingItem) {
        matchedMap.set(matchKey, {
          matchKey,
          entity: "participant",
          existingId: partLookup.record.id,
          existingCode: partLookup.record.participant_code,
          existingLabel: `${partLookup.record.participant_code} · ${partLookup.record.full_name}`,
          existingIsActive: partLookup.record.is_active,
          alreadyEnteredInSelectedEvent: enteredParticipantIds.has(
            partLookup.record.id,
          ),
          matchedBy: partLookup.matchedBy,
          rowNumbers: [row.rowNumber],
          fieldDiffs: diffs,
          hasAllowedChanges: diffs.length > 0,
        });
      } else {
        existingItem.rowNumbers.push(row.rowNumber);
        for (const m of partLookup.matchedBy) {
          if (!existingItem.matchedBy.includes(m)) {
            existingItem.matchedBy.push(m);
          }
        }
      }
    }
  }

  // Flag CMS entries for this event that are missing from the incoming file (non-destructive)
  const missingFromFileEntries: MissingFromFileEntryNotice[] = [];
  for (const entry of cmsContext.eventEntries) {
    if (entry.entry_type === "contingent" && entry.contingent_id) {
      if (!seenIncomingContingentIds.has(entry.contingent_id)) {
        const cont = contingentsById.get(entry.contingent_id);
        missingFromFileEntries.push({
          entryId: entry.id,
          entryType: "contingent",
          entryStatus: entry.status,
          subjectCode: cont?.contingent_code ?? entry.contingent_id.slice(0, 8),
          subjectName: cont?.name ?? "Existing Contingent",
        });
      }
    } else if (entry.entry_type === "individual" && entry.participant_id) {
      if (!seenIncomingParticipantIds.has(entry.participant_id)) {
        const part = participantsById.get(entry.participant_id);
        missingFromFileEntries.push({
          entryId: entry.id,
          entryType: "individual",
          entryStatus: entry.status,
          subjectCode: part?.participant_code ?? entry.participant_id.slice(0, 8),
          subjectName: part?.full_name ?? "Existing Participant",
        });
      }
    }
  }

  return {
    matchedRecords: Array.from(matchedMap.values()),
    identityConflicts,
    missingFromFileEntries,
  };
}

export type BuildExecutionPlanResult =
  | { ok: true; plan: ImportExecutionPlan; resolutionContext: ImportResolutionContext }
  | { ok: false; error: string };

export function buildImportExecutionPlan(params: {
  report: ImportValidationReport;
  cmsContext: ExecutionCmsContext;
  selection: ImportResolutionSelection;
}): BuildExecutionPlanResult {
  const { report, cmsContext, selection } = params;

  if (report.event.status === "archived") {
    return {
      ok: false,
      error: `Event ${report.event.code} is archived and cannot accept registration imports.`,
    };
  }

  const resolutionContext = buildResolutionContext({ report, cmsContext });
  const skippedSet = new Set<number>(selection.skippedRowNumbers ?? []);

  // Validate every matched record has an explicit valid resolution decision
  const contingentAllowedSet = new Set<string>(CONTINGENT_UPDATABLE_FIELDS);
  const participantAllowedSet = new Set<string>(PARTICIPANT_UPDATABLE_FIELDS);

  const matchedByKey = new Map(
    resolutionContext.matchedRecords.map((m) => [m.matchKey, m]),
  );

  for (const matched of resolutionContext.matchedRecords) {
    const choice = selection.entityResolutions?.[matched.matchKey];
    if (!choice) {
      return {
        ok: false,
        error: `Existing ${matched.entity} match "${matched.existingLabel}" requires an explicit decision (Reuse, Update, or Skip).`,
      };
    }

    if (!["reuse", "update", "skip"].includes(choice.action)) {
      return {
        ok: false,
        error: `Invalid resolution action "${choice.action}" for ${matched.existingLabel}.`,
      };
    }

    if (choice.action === "update") {
      if (!Array.isArray(choice.approvedFields) || choice.approvedFields.length === 0) {
        return {
          ok: false,
          error: `Select at least one field to update for "${matched.existingLabel}", or choose Reuse / Skip.`,
        };
      }
      const allowedSet =
        matched.entity === "contingent"
          ? contingentAllowedSet
          : participantAllowedSet;
      for (const f of choice.approvedFields) {
        if (!allowedSet.has(f)) {
          return {
            ok: false,
            error: `Field "${f}" is not on the server allowlist for ${matched.entity} import updates.`,
          };
        }
      }
    }
  }

  for (const key of Object.keys(selection.entityResolutions ?? {})) {
    if (!matchedByKey.has(key)) {
      const choice = selection.entityResolutions[key];
      if (choice && !["reuse", "update", "skip"].includes(choice.action)) {
        return {
          ok: false,
          error: `Invalid resolution action "${choice.action}" supplied for "${key}".`,
        };
      }
    }
  }

  const {
    contingentsByCode,
    contingentsByExtRef,
    participantsByCode,
    participantsByEmail,
    participantsByExtRef,
  } = buildCmsLookupIndexes(cmsContext);

  const enteredContingentIds = new Set<string>();
  const enteredParticipantIds = new Set<string>();
  for (const entry of cmsContext.eventEntries) {
    if (entry.contingent_id) enteredContingentIds.add(entry.contingent_id);
    if (entry.participant_id) enteredParticipantIds.add(entry.participant_id);
  }

  // Determine which rows are active vs skipped (by explicit row skip OR entity skip resolution)
  const activeRows: ImportPreviewRow[] = [];
  let explicitOrEntitySkippedCount = 0;
  let rejectedRowsCount = 0;

  for (const row of report.previewRows) {
    const contLookup = findMatchedContingent(
      row,
      contingentsByCode,
      contingentsByExtRef,
    );
    const partLookup = findMatchedParticipant(
      row,
      participantsByCode,
      participantsByEmail,
      participantsByExtRef,
    );

    const contChoice =
      contLookup.kind === "matched"
        ? selection.entityResolutions[`contingent:${contLookup.record.id}`]
        : undefined;
    const partChoice =
      partLookup.kind === "matched"
        ? selection.entityResolutions[`participant:${partLookup.record.id}`]
        : undefined;

    const isRowSkipped =
      skippedSet.has(row.rowNumber) ||
      contChoice?.action === "skip" ||
      partChoice?.action === "skip";

    if (row.status === "invalid") {
      rejectedRowsCount += 1;
    }

    if (isRowSkipped) {
      explicitOrEntitySkippedCount += 1;
      continue;
    }

    if (contLookup.kind === "conflict") {
      return {
        ok: false,
        error: contLookup.conflict.message,
      };
    }

    if (partLookup.kind === "conflict") {
      return {
        ok: false,
        error: partLookup.conflict.message,
      };
    }

    if (row.status === "invalid") {
      return {
        ok: false,
        error: `Row #${row.rowNumber} has validation errors (${row.issues[0]?.message ?? "invalid record"}). Fix the mapping/file or mark the row as skipped before executing.`,
      };
    }

    activeRows.push(row);
  }

  if (activeRows.length === 0) {
    return {
      ok: false,
      error:
        "No active rows remain to import after skipping rows/matches. Nothing was written to the database.",
    };
  }

  const contingentOpMap = new Map<string, ContingentExecutionOp>();
  const participantOpMap = new Map<string, ParticipantExecutionOp>();
  const entryOpMap = new Map<string, EventEntryExecutionOp>();
  const approvedUpdates: ApprovedUpdateAuditItem[] = [];

  for (const row of activeRows) {
    const contLookup = findMatchedContingent(
      row,
      contingentsByCode,
      contingentsByExtRef,
    );
    const partLookup = findMatchedParticipant(
      row,
      participantsByCode,
      participantsByEmail,
      participantsByExtRef,
    );

    if (contLookup.kind === "conflict") {
      return { ok: false, error: contLookup.conflict.message };
    }
    if (partLookup.kind === "conflict") {
      return { ok: false, error: partLookup.conflict.message };
    }

    const contMatch = contLookup.kind === "matched" ? contLookup : null;
    const partMatch = partLookup.kind === "matched" ? partLookup : null;

    // 1. Contingent operation (deduplicated per canonical contingent_code)
    let resolvedContingentCode: string | null = null;
    if (
      row.normalized.contingent &&
      (row.normalized.contingent.contingentCode || contMatch)
    ) {
      const incomingCont = row.normalized.contingent;
      const codeUpper = (
        contMatch?.record.contingent_code ??
        incomingCont.contingentCode ??
        ""
      )
        .trim()
        .toUpperCase();
      resolvedContingentCode = codeUpper;

      if (!contingentOpMap.has(codeUpper)) {
        if (contMatch) {
          const matchKey = `contingent:${contMatch.record.id}`;
          const choice = selection.entityResolutions[matchKey]!;
          if (!contMatch.record.is_active && row.resolvedEntryType === "contingent") {
            return {
              ok: false,
              error: `Existing contingent "${contMatch.record.contingent_code}" is inactive and cannot enter ${report.event.code}. Skip it or reactivate it first.`,
            };
          }

          if (choice.action === "update") {
            const approvedSet = new Set(choice.approvedFields);
            const merged = validateContingentInput({
              contingentCode: contMatch.record.contingent_code,
              name: approvedSet.has("name")
                ? incomingCont.name ?? contMatch.record.name
                : contMatch.record.name,
              institutionName: approvedSet.has("institution_name")
                ? incomingCont.institutionName ?? contMatch.record.institution_name
                : contMatch.record.institution_name,
              institutionCity: approvedSet.has("institution_city")
                ? incomingCont.institutionCity
                : contMatch.record.institution_city,
              externalRegistrationRef: approvedSet.has("external_registration_ref")
                ? incomingCont.externalRegistrationRef
                : contMatch.record.external_registration_ref,
              contactEmail: approvedSet.has("contact_email")
                ? incomingCont.contactEmail
                : contMatch.record.contact_email,
              contactPhone: approvedSet.has("contact_phone")
                ? incomingCont.contactPhone
                : contMatch.record.contact_phone,
              isActive: contMatch.record.is_active,
              notes: approvedSet.has("notes")
                ? incomingCont.notes
                : contMatch.record.notes,
            });
            if (!merged.ok) {
              return {
                ok: false,
                error: `Approved update for contingent ${contMatch.record.contingent_code} failed validation: ${merged.error}`,
              };
            }

            contingentOpMap.set(codeUpper, {
              op: "update",
              existing_id: contMatch.record.id,
              contingent_code: contMatch.record.contingent_code,
              name: merged.value.name,
              institution_name: merged.value.institution_name,
              institution_city: merged.value.institution_city,
              external_registration_ref: merged.value.external_registration_ref,
              contact_email: merged.value.contact_email,
              contact_phone: merged.value.contact_phone,
              notes: merged.value.notes,
              approved_fields: [...choice.approvedFields],
            });
            approvedUpdates.push({
              entity: "contingent",
              existingId: contMatch.record.id,
              entityCode: contMatch.record.contingent_code,
              updatedFields: [...choice.approvedFields],
            });
          } else {
            contingentOpMap.set(codeUpper, {
              op: "reuse",
              existing_id: contMatch.record.id,
              contingent_code: contMatch.record.contingent_code,
              name: contMatch.record.name,
              institution_name: contMatch.record.institution_name,
              institution_city: contMatch.record.institution_city,
              external_registration_ref:
                contMatch.record.external_registration_ref,
              contact_email: contMatch.record.contact_email,
              contact_phone: contMatch.record.contact_phone,
              notes: contMatch.record.notes,
              approved_fields: [],
            });
          }
          // Ensure lookup uses the canonical DB contingent code
          resolvedContingentCode = contMatch.record.contingent_code
            .trim()
            .toUpperCase();
        } else {
          const contCheck = validateContingentInput({
            contingentCode: codeUpper,
            name: incomingCont.name ?? "",
            institutionName: incomingCont.institutionName ?? "",
            institutionCity: incomingCont.institutionCity,
            externalRegistrationRef: incomingCont.externalRegistrationRef,
            contactEmail: incomingCont.contactEmail,
            contactPhone: incomingCont.contactPhone,
            isActive: true,
            notes: incomingCont.notes,
          });
          if (!contCheck.ok) {
            return {
              ok: false,
              error: `Row #${row.rowNumber} contingent validation failed: ${contCheck.error}`,
            };
          }
          contingentOpMap.set(codeUpper, {
            op: "create",
            existing_id: null,
            contingent_code: contCheck.value.contingent_code,
            name: contCheck.value.name,
            institution_name: contCheck.value.institution_name,
            institution_city: contCheck.value.institution_city,
            external_registration_ref:
              contCheck.value.external_registration_ref,
            contact_email: contCheck.value.contact_email,
            contact_phone: contCheck.value.contact_phone,
            notes: contCheck.value.notes,
            approved_fields: [],
          });
        }
      } else if (contMatch) {
        resolvedContingentCode = contMatch.record.contingent_code
          .trim()
          .toUpperCase();
      }
    }

    // 2. Participant operation
    const incomingPart = row.normalized.participant;
    const partCodeUpper = (
      partMatch?.record.participant_code ??
      incomingPart.participantCode ??
      ""
    )
      .trim()
      .toUpperCase();

    if (!partCodeUpper) {
      return {
        ok: false,
        error: `Row #${row.rowNumber} is missing a participant code.`,
      };
    }

    if (participantOpMap.has(partCodeUpper)) {
      return {
        ok: false,
        error: `Duplicate participant code "${partCodeUpper}" cannot appear in multiple active rows.`,
      };
    }

    const resolvedParticipantCode = partCodeUpper;

    if (partMatch) {
      const matchKey = `participant:${partMatch.record.id}`;
      const choice = selection.entityResolutions[matchKey]!;
      if (!partMatch.record.is_active && row.resolvedEntryType === "individual") {
        return {
          ok: false,
          error: `Existing participant "${partMatch.record.participant_code}" is inactive and cannot enter ${report.event.code}. Skip it or reactivate it first.`,
        };
      }

      if (choice.action === "update") {
        const approvedSet = new Set(choice.approvedFields);
        const merged = validateParticipantInput({
          contingentId: partMatch.record.contingent_id,
          participantCode: partMatch.record.participant_code,
          fullName: approvedSet.has("full_name")
            ? incomingPart.fullName ?? partMatch.record.full_name
            : partMatch.record.full_name,
          email: approvedSet.has("email")
            ? incomingPart.email
            : partMatch.record.email,
          phone: approvedSet.has("phone")
            ? incomingPart.phone
            : partMatch.record.phone,
          institutionName: approvedSet.has("institution_name")
            ? incomingPart.institutionName ?? partMatch.record.institution_name
            : partMatch.record.institution_name,
          externalRegistrationRef: approvedSet.has("external_registration_ref")
            ? incomingPart.externalRegistrationRef
            : partMatch.record.external_registration_ref,
          isContingentLead: approvedSet.has("is_contingent_lead")
            ? incomingPart.isContingentLead
            : partMatch.record.is_contingent_lead,
          isActive: partMatch.record.is_active,
        });

        if (!merged.ok) {
          return {
            ok: false,
            error: `Approved update for participant ${partMatch.record.participant_code} failed validation: ${merged.error}`,
          };
        }

        participantOpMap.set(resolvedParticipantCode, {
          op: "update",
          existing_id: partMatch.record.id,
          contingent_code: resolvedContingentCode,
          participant_code: partMatch.record.participant_code,
          full_name: merged.value.full_name,
          email: merged.value.email,
          phone: merged.value.phone,
          institution_name: merged.value.institution_name,
          external_registration_ref: merged.value.external_registration_ref,
          is_contingent_lead: merged.value.is_contingent_lead,
          approved_fields: [...choice.approvedFields],
        });
        approvedUpdates.push({
          entity: "participant",
          existingId: partMatch.record.id,
          entityCode: partMatch.record.participant_code,
          updatedFields: [...choice.approvedFields],
        });
      } else {
        participantOpMap.set(resolvedParticipantCode, {
          op: "reuse",
          existing_id: partMatch.record.id,
          contingent_code: resolvedContingentCode,
          participant_code: partMatch.record.participant_code,
          full_name: partMatch.record.full_name,
          email: partMatch.record.email,
          phone: partMatch.record.phone,
          institution_name: partMatch.record.institution_name,
          external_registration_ref: partMatch.record.external_registration_ref,
          is_contingent_lead: partMatch.record.is_contingent_lead,
          approved_fields: [],
        });
      }
    } else {
      const partCheck = validateParticipantInput({
        contingentId: resolvedContingentCode ? SYNTHETIC_CONTINGENT_UUID : null,
        participantCode: resolvedParticipantCode,
        fullName: incomingPart.fullName ?? "",
        email: incomingPart.email,
        phone: incomingPart.phone,
        institutionName: incomingPart.institutionName ?? "",
        externalRegistrationRef: incomingPart.externalRegistrationRef,
        isContingentLead: incomingPart.isContingentLead,
        isActive: true,
      });
      if (!partCheck.ok) {
        return {
          ok: false,
          error: `Row #${row.rowNumber} participant validation failed: ${partCheck.error}`,
        };
      }
      participantOpMap.set(resolvedParticipantCode, {
        op: "create",
        existing_id: null,
        contingent_code: resolvedContingentCode,
        participant_code: partCheck.value.participant_code,
        full_name: partCheck.value.full_name,
        email: partCheck.value.email,
        phone: partCheck.value.phone,
        institution_name: partCheck.value.institution_name,
        external_registration_ref: partCheck.value.external_registration_ref,
        is_contingent_lead: partCheck.value.is_contingent_lead,
        approved_fields: [],
      });
    }

    // 3. Event entry operation (deduplicated per contingent or individual)
    const statusCheck = validateEventEntryStatus(row.normalized.entryStatus);
    if (!statusCheck.ok) {
      return {
        ok: false,
        error: `Row #${row.rowNumber} entry status invalid: ${statusCheck.error}`,
      };
    }

    if (row.resolvedEntryType === "contingent") {
      if (!resolvedContingentCode) {
        return {
          ok: false,
          error: `Row #${row.rowNumber} resolves to a contingent entry without a contingent code.`,
        };
      }
      const entryKey = `contingent:${resolvedContingentCode}`;
      if (!entryOpMap.has(entryKey)) {
        entryOpMap.set(entryKey, {
          entry_type: "contingent",
          contingent_code: resolvedContingentCode,
          participant_code: null,
          status: statusCheck.value,
          notes: row.normalized.entryNotes,
        });
      }
    } else {
      const entryKey = `individual:${resolvedParticipantCode}`;
      if (!entryOpMap.has(entryKey)) {
        entryOpMap.set(entryKey, {
          entry_type: "individual",
          contingent_code: null,
          participant_code: resolvedParticipantCode,
          status: statusCheck.value,
          notes: row.normalized.entryNotes,
        });
      }
    }
  }

  const contingentOps = Array.from(contingentOpMap.values());
  const participantOps = Array.from(participantOpMap.values());
  const entryOps = Array.from(entryOpMap.values());

  // Compute exact pre-execution summary counts
  let entriesToCreateCount = 0;
  let entriesToReuseCount = 0;
  for (const op of entryOps) {
    if (op.entry_type === "contingent" && op.contingent_code) {
      const matches = contingentsByCode.get(op.contingent_code.toUpperCase());
      const match = matches?.[0];
      if (match && enteredContingentIds.has(match.id)) {
        entriesToReuseCount += 1;
      } else {
        entriesToCreateCount += 1;
      }
    } else if (op.entry_type === "individual" && op.participant_code) {
      const matches = participantsByCode.get(op.participant_code.toUpperCase());
      const match = matches?.[0];
      if (match && enteredParticipantIds.has(match.id)) {
        entriesToReuseCount += 1;
      } else {
        entriesToCreateCount += 1;
      }
    }
  }

  const canonicalPayload = JSON.stringify({
    eventId: report.event.id,
    contingentOps,
    participantOps,
    entryOps,
    skippedRowsCount: explicitOrEntitySkippedCount,
    rejectedRowsCount: rejectedRowsCount,
  });

  const payloadHash = crypto
    .createHash("sha256")
    .update(canonicalPayload)
    .digest("hex");

  return {
    ok: true,
    resolutionContext,
    plan: {
      payloadHash,
      contingentOps,
      participantOps,
      entryOps,
      approvedUpdates,
      preExecutionSummary: {
        totalRows: report.summary.totalRows,
        activeRowsCount: activeRows.length,
        skippedRowsCount: explicitOrEntitySkippedCount,
        rejectedRowsCount,
        contingentsToCreateCount: contingentOps.filter((o) => o.op === "create")
          .length,
        contingentsToReuseCount: contingentOps.filter((o) => o.op === "reuse")
          .length,
        contingentsToUpdateCount: contingentOps.filter((o) => o.op === "update")
          .length,
        participantsToCreateCount: participantOps.filter((o) => o.op === "create")
          .length,
        participantsToReuseCount: participantOps.filter((o) => o.op === "reuse")
          .length,
        participantsToUpdateCount: participantOps.filter((o) => o.op === "update")
          .length,
        entriesToCreateCount,
        entriesToReuseCount,
        missingFromFileCount: resolutionContext.missingFromFileEntries.length,
      },
    },
  };
}
