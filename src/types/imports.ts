import type {
  CodenameMode,
  EventEntryMode,
  EventEntryStatus,
  EventEntryType,
  EventStatus,
} from "@/types/competition";

export type ImportFileFormat = "csv" | "xlsx";

export type ImportTargetEntity = "contingent" | "participant" | "event_entry";

export type ImportTargetFieldKey =
  | "contingent_code"
  | "contingent_name"
  | "institution_name"
  | "institution_city"
  | "contingent_external_ref"
  | "contact_email"
  | "contact_phone"
  | "contingent_notes"
  | "participant_code"
  | "full_name"
  | "email"
  | "phone"
  | "participant_external_ref"
  | "is_contingent_lead"
  | "entry_type"
  | "entry_status"
  | "entry_notes"
  | "source_event_code";

export interface ImportTargetFieldDefinition {
  key: ImportTargetFieldKey;
  entity: ImportTargetEntity;
  label: string;
  schemaColumn: string;
  description: string;
  aliases: readonly string[];
}

export interface DetectedColumn {
  /** Unique positional column identifier (e.g. "col_0") so duplicate headings stay distinct. */
  key: string;
  /** 0-based column index in the uploaded sheet. */
  index: number;
  /** Raw trimmed heading text from the spreadsheet header row (or fallback label if blank). */
  headerName: string;
  /** Display label distinguishing duplicate headers, e.g. "Email (Column 5 · 2 of 2)". */
  displayLabel: string;
  /** True when another column in the same sheet shares the same normalized headerName. */
  isDuplicateHeader: boolean;
  /** 1-based occurrence counter among columns with the same headerName. */
  duplicateOccurrence: number;
  /** Total columns in this sheet sharing the same headerName. */
  duplicateTotal: number;
  /** Non-empty values seen in this column across parsed data rows. */
  nonEmptyCount: number;
  /** Up to 3 non-empty sample values for column inspection. */
  sampleValues: string[];
}

export interface ParsedDataRow {
  /** Original 1-based spreadsheet row number (accounts for header + skipped blank rows). */
  rowNumber: number;
  /** Positional string cells aligned by index with ParsedImportSheet.columns. */
  cells: string[];
}

export interface ParsedImportSheet {
  sheetName: string;
  columns: DetectedColumn[];
  rows: ParsedDataRow[];
  totalRawRows: number;
  skippedEmptyRowCount: number;
  warnings: string[];
}

export interface ParsedImportWorkbook {
  fileName: string;
  fileFormat: ImportFileFormat;
  fileSizeBytes: number;
  sheetNames: string[];
  selectedSheetName: string;
  sheet: ParsedImportSheet;
}

/** Maps a target CMS field key to a unique source DetectedColumn.key, or null if unmapped. */
export type ColumnMappingState = Record<ImportTargetFieldKey, string | null>;

export interface ImportEventOption {
  id: string;
  code: string;
  name: string;
  entry_mode: EventEntryMode;
  codename_mode: CodenameMode;
  status: EventStatus;
  min_team_size: number | null;
  max_team_size: number | null;
}

export type ImportIssueSeverity = "error" | "warning";

export type ImportIssueCategory =
  | "missing_required"
  | "invalid_value"
  | "duplicate_in_file"
  | "event_compatibility"
  | "schema_rule";

export interface ImportRowIssue {
  field: ImportTargetFieldKey | "row";
  severity: ImportIssueSeverity;
  category: ImportIssueCategory;
  message: string;
}

export interface InFileDuplicateNotice {
  field:
    | "participant_code"
    | "email"
    | "participant_external_ref"
    | "contingent_conflict"
    | "contingent_member_name"
    | "individual_identity";
  value: string;
  matchingRowNumbers: number[];
  message: string;
}

export interface ExistingCmsMatchNotice {
  entity: "contingent" | "participant" | "event_entry";
  matchedBy:
    | "contingent_code"
    | "external_registration_ref"
    | "participant_code"
    | "email"
    | "already_entered_in_event";
  existingId: string;
  existingLabel: string;
  alreadyEnteredInSelectedEvent: boolean;
  message: string;
}

export interface NormalizedImportRowPreview {
  entryType: EventEntryType;
  entryStatus: EventEntryStatus;
  entryNotes: string | null;
  sourceEventCode: string | null;
  contingent: {
    contingentCode: string | null;
    name: string | null;
    institutionName: string | null;
    institutionCity: string | null;
    externalRegistrationRef: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    notes: string | null;
  } | null;
  participant: {
    participantCode: string | null;
    fullName: string | null;
    email: string | null;
    phone: string | null;
    institutionName: string | null;
    externalRegistrationRef: string | null;
    isContingentLead: boolean;
  };
}

export interface ImportPreviewRow {
  rowNumber: number;
  status: "valid" | "invalid";
  resolvedEntryType: EventEntryType;
  normalized: NormalizedImportRowPreview;
  issues: ImportRowIssue[];
  inFileDuplicates: InFileDuplicateNotice[];
  existingMatches: ExistingCmsMatchNotice[];
}

export interface ImportValidationSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  inFileDuplicateRows: number;
  existingMatchRows: number;
  missingRequiredFieldCount: number;
  unmappedSourceColumnsCount: number;
  unmappedTargetFieldsCount: number;
}

export interface ImportValidationReport {
  event: ImportEventOption;
  requiredTargetFields: ImportTargetFieldKey[];
  missingRequiredTargetFields: ImportTargetFieldKey[];
  unmappedSourceColumns: DetectedColumn[];
  unmappedTargetFields: ImportTargetFieldKey[];
  summary: ImportValidationSummary;
  previewRows: ImportPreviewRow[];
  batchNotices: string[];
}

// ============================================================================
// Stage 2B.2: Safe Registration Import Execution, Resolution & History Types
// ============================================================================

export type ExistingMatchResolutionAction = "reuse" | "update" | "skip";

export const CONTINGENT_UPDATABLE_FIELDS = [
  "name",
  "institution_name",
  "institution_city",
  "external_registration_ref",
  "contact_email",
  "contact_phone",
  "notes",
] as const;

export type ContingentUpdatableField =
  (typeof CONTINGENT_UPDATABLE_FIELDS)[number];

export const PARTICIPANT_UPDATABLE_FIELDS = [
  "full_name",
  "email",
  "phone",
  "institution_name",
  "external_registration_ref",
  "is_contingent_lead",
] as const;

export type ParticipantUpdatableField =
  (typeof PARTICIPANT_UPDATABLE_FIELDS)[number];

export interface RecordFieldDiff {
  field: string;
  label: string;
  currentValue: string | null;
  incomingValue: string | null;
  allowedToUpdate: boolean;
}

export interface MatchedRecordReviewItem {
  /** Deterministic match key, e.g. "contingent:<uuid>" or "participant:<uuid>". */
  matchKey: string;
  entity: "contingent" | "participant";
  existingId: string;
  existingCode: string;
  existingLabel: string;
  existingIsActive: boolean;
  alreadyEnteredInSelectedEvent: boolean;
  matchedBy: string[];
  rowNumbers: number[];
  fieldDiffs: RecordFieldDiff[];
  hasAllowedChanges: boolean;
}

export interface MissingFromFileEntryNotice {
  entryId: string;
  entryType: EventEntryType;
  entryStatus: EventEntryStatus;
  subjectCode: string;
  subjectName: string;
}

export interface IdentityConflictCandidate {
  identifier:
    | "contingent_code"
    | "external_registration_ref"
    | "participant_code"
    | "email";
  identifierLabel: string;
  suppliedValue: string;
  matchedRecordId: string;
  matchedRecordCode: string;
  matchedRecordLabel: string;
}

export interface IdentityConflictNotice {
  conflictKey: string;
  entity: "contingent" | "participant";
  rowNumber: number;
  candidates: IdentityConflictCandidate[];
  message: string;
}

export interface ImportResolutionContext {
  matchedRecords: MatchedRecordReviewItem[];
  identityConflicts: IdentityConflictNotice[];
  missingFromFileEntries: MissingFromFileEntryNotice[];
}

export interface EntityResolutionChoice {
  action: ExistingMatchResolutionAction;
  approvedFields: string[];
}

export interface ImportResolutionSelection {
  entityResolutions: Record<string, EntityResolutionChoice>;
  skippedRowNumbers: number[];
}

export interface ContingentExecutionOp {
  op: "create" | "reuse" | "update";
  existing_id: string | null;
  contingent_code: string;
  name: string;
  institution_name: string;
  institution_city: string | null;
  external_registration_ref: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  approved_fields: string[];
}

export interface ParticipantExecutionOp {
  op: "create" | "reuse" | "update";
  existing_id: string | null;
  contingent_code: string | null;
  participant_code: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  institution_name: string;
  external_registration_ref: string | null;
  is_contingent_lead: boolean;
  approved_fields: string[];
}

export interface EventEntryExecutionOp {
  entry_type: EventEntryType;
  contingent_code: string | null;
  participant_code: string | null;
  status: EventEntryStatus;
  notes: string | null;
}

export interface ApprovedUpdateAuditItem {
  entity: "contingent" | "participant";
  existingId: string;
  entityCode: string;
  updatedFields: string[];
}

export interface ImportExecutionPlan {
  payloadHash: string;
  contingentOps: ContingentExecutionOp[];
  participantOps: ParticipantExecutionOp[];
  entryOps: EventEntryExecutionOp[];
  approvedUpdates: ApprovedUpdateAuditItem[];
  preExecutionSummary: {
    totalRows: number;
    activeRowsCount: number;
    skippedRowsCount: number;
    rejectedRowsCount: number;
    contingentsToCreateCount: number;
    contingentsToReuseCount: number;
    contingentsToUpdateCount: number;
    participantsToCreateCount: number;
    participantsToReuseCount: number;
    participantsToUpdateCount: number;
    entriesToCreateCount: number;
    entriesToReuseCount: number;
    missingFromFileCount: number;
  };
}

export interface ImportExecutionResult {
  importId: string;
  status: "completed" | "failed";
  idempotentReplay: boolean;
  totalRows: number;
  createdContingentsCount: number;
  createdParticipantsCount: number;
  createdEntriesCount: number;
  reusedRecordsCount: number;
  updatedRecordsCount: number;
  skippedRowsCount: number;
  rejectedRowsCount: number;
  missingFromFileCount: number;
  createdAt: string;
  missingFromFileEntries: MissingFromFileEntryNotice[];
  auditWarning?: string | null;
}

export interface RegistrationImportHistoryItem {
  id: string;
  event_id: string;
  initiated_by: string;
  initiated_by_email: string | null;
  source_filename: string;
  file_format: ImportFileFormat;
  status: "completed" | "failed";
  total_rows: number;
  created_contingents_count: number;
  created_participants_count: number;
  created_entries_count: number;
  reused_records_count: number;
  updated_records_count: number;
  skipped_rows_count: number;
  rejected_rows_count: number;
  missing_from_file_count: number;
  error_summary: string | null;
  created_at: string;
}

