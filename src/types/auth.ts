export type OrganiserRole = "super_admin" | "event_coordinator";

export type ScopeMode = "all_events";

export interface OrganiserProfile {
  id: string;
  full_name: string;
  email: string;
  role: OrganiserRole;
  scope_mode: ScopeMode;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganiserSessionUser {
  id: string;
  fullName: string;
  email: string;
  role: OrganiserRole;
  scopeMode: ScopeMode;
  isActive: boolean;
}

export interface AuditLogEntry {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export const ORGANISER_ROLE_LABELS: Record<OrganiserRole, string> = {
  super_admin: "Super Admin",
  event_coordinator: "Event Coordinator",
};

export function formatOrganiserRole(role: OrganiserRole): string {
  return ORGANISER_ROLE_LABELS[role];
}
