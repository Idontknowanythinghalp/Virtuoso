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

