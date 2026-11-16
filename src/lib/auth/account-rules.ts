import type { OrganiserProfile, OrganiserRole } from "@/types/auth";

export interface ValidationResult<T> {
  ok: true;
  value: T;
}

export interface ValidationError {
  ok: false;
  error: string;
}

export type FieldValidation<T> = ValidationResult<T> | ValidationError;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmailInput(rawEmail: string): FieldValidation<string> {
  const email = rawEmail.trim().toLowerCase();
  if (!email) {
    return { ok: false, error: "Email address is required." };
  }
  if (email.length > 254 || !EMAIL_REGEX.test(email)) {
    return { ok: false, error: "Enter a valid institutional email address." };
  }
  return { ok: true, value: email };
}

export function validateFullNameInput(rawName: string): FieldValidation<string> {
  const fullName = rawName.trim().replace(/\s+/g, " ");
  if (fullName.length < 2) {
    return {
      ok: false,
      error: "Full name must be at least 2 characters.",
    };
  }
  if (fullName.length > 120) {
    return {
      ok: false,
      error: "Full name must be 120 characters or fewer.",
    };
  }
  return { ok: true, value: fullName };
}

export function validatePasswordInput(
  rawPassword: string,
): FieldValidation<string> {
  if (!rawPassword) {
    return { ok: false, error: "Password is required." };
  }
  if (rawPassword.length < 10) {
    return {
      ok: false,
      error: "Temporary password must be at least 10 characters.",
    };
  }
  if (rawPassword.length > 128) {
    return {
      ok: false,
      error: "Password must be 128 characters or fewer.",
    };
  }
  return { ok: true, value: rawPassword };
}

export function validateOrganiserRoleInput(
  rawRole: string,
): FieldValidation<OrganiserRole> {
  if (rawRole === "super_admin" || rawRole === "event_coordinator") {
    return { ok: true, value: rawRole };
  }
  return {
    ok: false,
    error: "Invalid organiser role. Allowed roles are Super Admin and Event Coordinator.",
  };
}

export interface ProfileMutationCheckParams {
  actor: Pick<OrganiserProfile, "id" | "role" | "is_active">;
  target: Pick<OrganiserProfile, "id" | "role" | "is_active">;
  nextRole: OrganiserRole;
  nextIsActive: boolean;
  activeSuperAdminCount: number;
}

export function validateProfileMutation(
  params: ProfileMutationCheckParams,
): ValidationResult<null> | ValidationError {
  const { actor, target, nextRole, nextIsActive, activeSuperAdminCount } =
    params;

  if (!actor.is_active || actor.role !== "super_admin") {
    return {
      ok: false,
      error: "Only an active Super Admin may modify organiser accounts.",
    };
  }

  if (actor.id === target.id) {
    return {
      ok: false,
      error: "You cannot modify your own role or active status.",
    };
  }

  const targetIsCurrentlyActiveSuperAdmin =
    target.role === "super_admin" && target.is_active;
  const mutationRemovesActiveSuperAdmin =
    nextRole !== "super_admin" || !nextIsActive;

  if (
    targetIsCurrentlyActiveSuperAdmin &&
    mutationRemovesActiveSuperAdmin &&
    activeSuperAdminCount <= 1
  ) {
    return {
      ok: false,
      error: "Cannot deactivate or demote the last active Super Admin.",
    };
  }

  return { ok: true, value: null };
}
