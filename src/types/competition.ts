export type EventEntryMode = "contingent" | "individual" | "hybrid";

export type CodenameMode = "event_wide" | "per_round";

export type EventStatus = "draft" | "active" | "inactive" | "archived";

export type RoundScoringMethod =
  | "criteria_sum"
  | "criteria_weighted"
  | "direct_points";

export type RoundAttributionMode =
  | "individual_judge"
  | "panel_consolidated"
  | "round_direct";

export type RoundStatus =
  | "draft"
  | "ready"
  | "deployed"
  | "closed"
  | "completed"
  | "archived";

export type RoundReleaseCloseReason = "manual" | "expired";

export type RoundReleaseEffectiveState =
  | "draft"
  | "ready"
  | "live"
  | "expired"
  | "closed"
  | "completed"
  | "archived";

export interface RoundReleaseSessionRecord {
  id: string;
  event_id: string;
  round_id: string;
  session_number: number;
  duration_minutes: number;
  started_at: string;
  expires_at: string;
  closed_at: string | null;
  close_reason: RoundReleaseCloseReason | null;
  released_by: string | null;
  closed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type EventEntryType = "contingent" | "individual";

export type EventEntryStatus =
  | "registered"
  | "checked_in"
  | "withdrawn"
  | "disqualified";

export interface EventRecord {
  id: string;
  code: string;
  name: string;
  description: string | null;
  entry_mode: EventEntryMode;
  codename_mode: CodenameMode;
  status: EventStatus;
  min_team_size: number | null;
  max_team_size: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoundRecord {
  id: string;
  event_id: string;
  round_number: number;
  name: string;
  description: string | null;
  scoring_method: RoundScoringMethod;
  attribution_mode: RoundAttributionMode;
  status: RoundStatus;
  is_locked: boolean;
  duration_minutes: number | null;
  created_at: string;
  updated_at: string;
}

export interface JudgingCriterionRecord {
  id: string;
  round_id: string;
  display_order: number;
  name: string;
  max_points: number;
  weight: number;
  rubric_guidance: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContingentRecord {
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
  created_at: string;
  updated_at: string;
}

export interface ParticipantRecord {
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
  created_at: string;
  updated_at: string;
}

export interface EventEntryRecord {
  id: string;
  event_id: string;
  entry_type: EventEntryType;
  contingent_id: string | null;
  participant_id: string | null;
  status: EventEntryStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const ENTRY_MODE_LABELS: Record<EventEntryMode, string> = {
  contingent: "Contingent (Team)",
  individual: "Individual Participant",
  hybrid: "Hybrid (Contingent or Individual)",
};

export const CODENAME_MODE_LABELS: Record<CodenameMode, string> = {
  event_wide: "Event-Wide Codename",
  per_round: "Per-Round Codename",
};

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: "Draft",
  active: "Active",
  inactive: "Inactive",
  archived: "Archived",
};

export const SCORING_METHOD_LABELS: Record<RoundScoringMethod, string> = {
  criteria_sum: "Criteria Sum",
  criteria_weighted: "Criteria Weighted",
  direct_points: "Direct Points",
};

export const ATTRIBUTION_MODE_LABELS: Record<RoundAttributionMode, string> = {
  individual_judge: "Individual Judge",
  panel_consolidated: "Panel Consolidated",
  round_direct: "Round Direct",
};

export const ROUND_STATUS_LABELS: Record<RoundStatus, string> = {
  draft: "Draft",
  ready: "Ready",
  deployed: "Deployed (Live)",
  closed: "Closed",
  completed: "Completed",
  archived: "Archived",
};

export const ENTRY_STATUS_LABELS: Record<EventEntryStatus, string> = {
  registered: "Registered",
  checked_in: "Checked In",
  withdrawn: "Withdrawn",
  disqualified: "Disqualified",
};

export type CodenameAssignmentSource = "auto_generated" | "manual";

export interface EntryCodenameRecord {
  id: string;
  event_id: string;
  event_entry_id: string;
  round_id: string | null;
  codename: string;
  assignment_source: CodenameAssignmentSource;
  assigned_by: string | null;
  updated_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const CODENAME_SOURCE_LABELS: Record<CodenameAssignmentSource, string> = {
  auto_generated: "Auto-Generated",
  manual: "Manual",
};

export interface LeaderboardEntryRecord {
  id: string;
  event_id: string;
  event_entry_id: string;
  contingent_id: string;
  position: number | null;
  display_value: string | null;
  score: number | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeaderboardEntryView extends LeaderboardEntryRecord {
  calculatedRank: number | null;
  contingent: Pick<
    ContingentRecord,
    "id" | "contingent_code" | "name" | "institution_name" | "is_active"
  > | null;
  eventEntryStatus: EventEntryStatus | null;
}

export interface LeaderboardPublishedEntryRecord {
  id: string;
  event_id: string;
  contingent_id: string;
  rank: number | null;
  score: number | null;
  display_label: string | null;
  published_at: string;
  created_at: string;
  updated_at: string;
}

export interface LeaderboardPublicationRecord {
  event_id: string;
  is_published: boolean;
  published_at: string | null;
  published_by: string | null;
  unpublished_at: string | null;
  unpublished_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeaderboardPublicationState {
  isPublished: boolean;
  publishedAt: string | null;
  publishedBy: string | null;
  unpublishedAt: string | null;
  unpublishedBy: string | null;
}

export interface ReadOnlyLeaderboardRow {
  id: string;
  rank: number | null;
  score: number | null;
  displayLabel: string | null;
  contingentId: string;
  contingentCode: string;
  contingentName: string;
  institutionName: string;
  updatedAt: string;
}

export type CompetitionDocumentStatus = "active" | "archived";

export interface CompetitionDocumentRecord {
  id: string;
  event_id: string;
  round_id: string;
  title: string;
  original_filename: string;
  storage_bucket: string;
  storage_object_path: string | null;
  mime_type: string;
  file_size_bytes: number;
  status: CompetitionDocumentStatus;
  created_by: string | null;
  updated_by: string | null;
  archived_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminRoundDocumentItem {
  id: string;
  eventId: string;
  roundId: string;
  title: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  status: CompetitionDocumentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentOperationResult {
  ok: boolean;
  message: string;
  documentId?: string;
  warning?: string;
}

export interface SignedUploadIntentResult {
  ok: boolean;
  message: string;
  storageObjectPath?: string;
  token?: string;
}

export type DirectUploadStage =
  | "requesting_permission"
  | "uploading_storage"
  | "finalising";

export interface UploadedStorageObjectInspection {
  exists: boolean;
  sizeBytes: number | null;
  contentType: string | null;
  headerBytes: Uint8Array | null;
  error: string | null;
}

export interface ParticipantRoundDocumentItem {
  id: string;
  eventId: string;
  roundId: string;
  title: string;
  fileSizeBytes: number;
  updatedAt: string;
}

export type ParticipantDocumentViewDenyReason =
  | "unauthenticated"
  | "organiser_forbidden"
  | "invalid_team_session"
  | "not_visible"
  | "not_found"
  | "error";

export type ParticipantDocumentViewResult =
  | {
      ok: true;
      documentId: string;
      title: string;
      viewUrl: string;
      expiresInSeconds: number;
    }
  | {
      ok: false;
      message: string;
      reason: ParticipantDocumentViewDenyReason;
    };

