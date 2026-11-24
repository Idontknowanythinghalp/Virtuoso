import type {
  OrganiserProfile,
  OrganiserRole,
  OrganiserSessionUser,
} from "@/types/auth";

export const ALL_ORGANISER_ROLES: readonly OrganiserRole[] = [
  "super_admin",
  "event_coordinator",
] as const;

export const SUPER_ADMIN_ONLY: readonly OrganiserRole[] = [
  "super_admin",
] as const;

export type AccessDenialReason =
  | "unauthenticated"
  | "missing_profile"
  | "inactive"
  | "forbidden";

export type AccessEvaluationResult =
  | {
      ok: true;
      sessionUser: OrganiserSessionUser;
      profile: OrganiserProfile;
    }
  | {
      ok: false;
      reason: AccessDenialReason;
    };

export function toOrganiserSessionUser(
  profile: OrganiserProfile,
): OrganiserSessionUser {
  return {
    id: profile.id,
    fullName: profile.full_name,
    email: profile.email,
    role: profile.role,
    scopeMode: profile.scope_mode,
    isActive: profile.is_active,
  };
}

export function evaluateOrganiserAccess(params: {
  authUserId: string | null | undefined;
  profile: OrganiserProfile | null | undefined;
  allowedRoles?: readonly OrganiserRole[];
}): AccessEvaluationResult {
  const { authUserId, profile, allowedRoles = ALL_ORGANISER_ROLES } = params;

  if (!authUserId) {
    return { ok: false, reason: "unauthenticated" };
  }

  if (!profile || profile.id !== authUserId) {
    return { ok: false, reason: "missing_profile" };
  }

  if (!profile.is_active) {
    return { ok: false, reason: "inactive" };
  }

  if (!allowedRoles.includes(profile.role)) {
    return { ok: false, reason: "forbidden" };
  }

  return {
    ok: true,
    sessionUser: toOrganiserSessionUser(profile),
    profile,
  };
}

export function sanitizeInternalRedirectPath(
  candidate: string | null | undefined,
  fallback = "/",
): string {
  if (!candidate) {
    return fallback;
  }

  const trimmed = candidate.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }

  if (trimmed.startsWith("/login")) {
    return fallback;
  }

  return trimmed;
}
