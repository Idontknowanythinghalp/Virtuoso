export const MAX_TEAM_CONCURRENT_SESSIONS = 4 as const;

export type TeamSessionRevocationReason =
  | "logout"
  | "organiser_revoked"
  | "account_deactivated"
  | "contingent_deactivated"
  | "auth_session_expired";

export interface TeamAccountRecord {
  id: string;
  contingent_id: string;
  auth_user_id: string;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  deactivated_at: string | null;
  deactivated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamSessionRecord {
  id: string;
  team_account_id: string;
  contingent_id: string;
  supabase_session_id: string;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  revoked_reason: TeamSessionRevocationReason | null;
  revoked_by: string | null;
}

export interface TeamSessionRegistrationResult {
  operation: "registered" | "refreshed";
  contingent_id: string;
  active_session_count: number;
  max_sessions: number;
  stale_pruned_count: number;
}

export interface TeamSessionLogoutResult {
  operation: "revoked" | "already_revoked_or_missing";
  revoked: boolean;
}

export interface ActiveTeamSession {
  contingentId: string;
  contingentCode: string;
  contingentName: string;
  institutionName: string;
}

export interface TeamLoginActionState {
  error: string | null;
}

export type TeamSessionStatus = "active" | "expired" | "revoked";

export interface TeamSessionOverviewItem {
  contingentId: string;
  contingentCode: string;
  contingentName: string;
  institutionName: string;
  contingentIsActive: boolean;
  hasTeamAccount: boolean;
  teamAccountIsActive: boolean;
  activeSessionCount: number;
  maxSessions: number;
  isLoggedIn: boolean;
  expiredUnprunedCount: number;
  totalSessionCount: number;
  mostRecentActiveAt: string | null;
  mostRecentActivityAt: string | null;
}

export interface TeamSessionOverviewPayload {
  generatedAt: string;
  maxSessions: number;
  teams: TeamSessionOverviewItem[];
}

export interface TeamSessionDetailItem {
  sessionId: string;
  deviceInfoStatus: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedReason: TeamSessionRevocationReason | null;
  isActive: boolean;
  status: TeamSessionStatus;
}

export interface TeamSessionDetailsPayload {
  contingentId: string;
  contingentCode: string;
  contingentName: string;
  institutionName: string;
  contingentIsActive: boolean;
  teamAccountIsActive: boolean;
  activeSessionCount: number;
  maxSessions: number;
  sessions: TeamSessionDetailItem[];
}

export interface GlobalTeamSessionRevokeResult {
  operation: "revoked_all_teams" | "none_active";
  revokedCount: number;
  expiredPrunedCount: number;
  affectedTeamCount: number;
  affectedContingentCodes: string[];
  revokedAt: string;
}

