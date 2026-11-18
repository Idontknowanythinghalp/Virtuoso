import type {
  ContingentRecord,
  EventEntryRecord,
  EventRecord,
  ParticipantRecord,
  RoundRecord,
} from "@/types/competition";

// ============================================================================
// 1. REGISTRATION IMPORT TYPES
// ============================================================================

export type CmsTargetField =
  // Contingent fields
  | "contingent_code"
  | "contingent_name"
  | "institution_name"
  | "institution_city"
  | "contact_email"
  | "contact_phone"
  | "contingent_ext_ref"
  | "contingent_notes"
  // Participant fields
  | "participant_code"
  | "participant_name"
  | "participant_email"
  | "participant_phone"
  | "participant_institution"
  | "is_contingent_lead"
  | "participant_ext_ref"
  // Mapping links
  | "member_contingent_code"
  // Event entry
  | "entry_event_code"
  | "entry_type"
  | "ignore";

export interface ColumnMappingItem {
  sourceColumn: string;
  targetField: CmsTargetField;
  sampleValues: string[];
}

export interface ParsedRawRow {
  rowNumber: number;
  data: Record<string, string>;
}

export interface ImportErrorDetail {
  rowNumber: number;
  field?: string;
  message: string;
}

export interface ExistingRecordDiff {
  entityType: "contingent" | "participant";
  identifier: string; // code or external ref
  name: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
}

export interface ImportCandidateContingent {
  code: string;
  name: string;
  institutionName: string;
  institutionCity: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  externalRef: string | null;
  notes: string | null;
  isExisting: boolean;
  existingId?: string;
}

export interface ImportCandidateParticipant {
  code: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  institutionName: string;
  contingentCode: string | null;
  isContingentLead: boolean;
  externalRef: string | null;
  isExisting: boolean;
  existingId?: string;
}

export interface ImportCandidateEntry {
  eventCode: string;
  entryType: "contingent" | "individual";
  contingentCode?: string;
  participantCode?: string;
  isExisting: boolean;
}

export interface MissingRecordNotice {
  entityType: "contingent" | "participant";
  code: string;
  name: string;
  institutionName: string;
}

export interface ImportPreviewResult {
  fileName: string;
  fileSizeBytes: number;
  totalRows: number;
  validRowsCount: number;
  invalidRowsCount: number;
  errors: ImportErrorDetail[];
  potentialDuplicates: {
    type: "contingent_code" | "participant_code" | "external_ref";
    value: string;
    rowNumbers: number[];
  }[];
  newContingents: ImportCandidateContingent[];
  newParticipants: ImportCandidateParticipant[];
  newEntries: ImportCandidateEntry[];
  existingContingents: ImportCandidateContingent[];
  existingParticipants: ImportCandidateParticipant[];
  existingEntries: ImportCandidateEntry[];
  differences: ExistingRecordDiff[];
  missingFromImport: MissingRecordNotice[];
  detectedMappings: ColumnMappingItem[];
}

export interface RegistrationImportRecord {
  id: string;
  imported_by: string | null;
  imported_by_email: string | null;
  file_name: string;
  file_size_bytes: number;
  total_rows: number;
  created_contingents_count: number;
  updated_contingents_count: number;
  created_participants_count: number;
  updated_participants_count: number;
  created_entries_count: number;
  skipped_records_count: number;
  rejected_records_count: number;
  validation_errors: ImportErrorDetail[];
  summary: Record<string, unknown>;
  created_at: string;
}

export interface ImportExecutionResult {
  ok: boolean;
  message: string;
  importId?: string;
  stats?: {
    createdContingents: number;
    updatedContingents: number;
    createdParticipants: number;
    updatedParticipants: number;
    createdEntries: number;
    skipped: number;
    rejected: number;
  };
}

// ============================================================================
// 2. CODENAME TYPES
// ============================================================================

export interface CodenameRecord {
  id: string;
  event_id: string;
  round_id: string | null;
  event_entry_id: string;
  codename: string;
  assigned_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CodenameView extends CodenameRecord {
  event?: Pick<EventRecord, "id" | "code" | "name" | "codename_mode"> | null;
  round?: Pick<RoundRecord, "id" | "round_number" | "name"> | null;
  entry?: {
    id: string;
    entry_type: "contingent" | "individual";
    status: string;
    contingent?: Pick<ContingentRecord, "id" | "contingent_code" | "name" | "institution_name"> | null;
    participant?: Pick<ParticipantRecord, "id" | "participant_code" | "full_name" | "institution_name"> | null;
  } | null;
}

export interface GenerateCodenamesResult {
  ok: boolean;
  message: string;
  generatedCount: number;
  skippedExistingCount: number;
  codenames: { entryId: string; codename: string }[];
}

// ============================================================================
// 3. PRIVATE COMPETITION DOCUMENT TYPES
// ============================================================================

export interface CompetitionDocumentRecord {
  id: string;
  event_id: string;
  round_id: string | null;
  title: string;
  description: string | null;
  file_name: string;
  file_path: string;
  file_size_bytes: number;
  mime_type: string;
  storage_bucket: string;
  uploaded_by: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompetitionDocumentView extends CompetitionDocumentRecord {
  event?: Pick<EventRecord, "id" | "code" | "name"> | null;
  round?: Pick<RoundRecord, "id" | "round_number" | "name"> | null;
  uploaded_by_profile?: {
    full_name: string;
    email: string;
  } | null;
}
