import "server-only";
import { redirect } from "next/navigation";
import { isPublicSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordAuditLog } from "@/lib/audit/logger";
import {
  ALL_ORGANISER_ROLES,
  evaluateOrganiserAccess,
} from "@/lib/auth/policy";
import type {
  OrganiserProfile,
  OrganiserRole,
  OrganiserSessionUser,
} from "@/types/auth";

export class OrganiserAuthError extends Error {
  readonly code:
    | "config"
    | "unauthenticated"
    | "missing_profile"
    | "inactive"
    | "forbidden";
  readonly status: number;

  constructor(
    message: string,
    code:
      | "config"
      | "unauthenticated"
      | "missing_profile"
      | "inactive"
      | "forbidden",
    status: number,
  ) {
    super(message);
    this.name = "OrganiserAuthError";
    this.code = code;
    this.status = status;
  }
}

export interface ActiveUserContext {
  userId: string;
  profile: OrganiserProfile;
  sessionUser: OrganiserSessionUser;
}

async function resolveCurrentOrganiserContext(
  allowedRoles: readonly OrganiserRole[],
): Promise<
  | { ok: true; context: ActiveUserContext }
  | {
      ok: false;
      code:
        | "config"
        | "unauthenticated"
        | "missing_profile"
        | "inactive"
        | "forbidden";
      userId?: string;
      email?: string | null;
      role?: OrganiserRole;
    }
> {
  if (!isPublicSupabaseConfigured()) {
    return { ok: false, code: "config" };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, code: "unauthenticated" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, role, scope_mode, is_active, created_at, updated_at",
    )
    .eq("id", user.id)
    .maybeSingle<OrganiserProfile>();

  if (profileError) {
    console.error(
      "[auth] failed to load organiser profile:",
      profileError.message,
    );
    return {
      ok: false,
      code: "missing_profile",
      userId: user.id,
      email: user.email ?? null,
    };
  }

  const decision = evaluateOrganiserAccess({
    authUserId: user.id,
    profile,
    allowedRoles,
  });

  if (!decision.ok) {
    return {
      ok: false,
      code: decision.reason,
      userId: user.id,
      email: profile?.email ?? user.email ?? null,
      role: profile?.role,
    };
  }

  return {
    ok: true,
    context: {
      userId: user.id,
      profile: decision.profile,
      sessionUser: decision.sessionUser,
    },
  };
}

/**
 * Authoritative server-side guard for App Router Server Components/Pages.
 * Always verifies identity via supabase.auth.getUser() and checks active profile & role.
 */
export async function requireActiveUser(
  allowedRoles: readonly OrganiserRole[] = ALL_ORGANISER_ROLES,
  options?: { routeLabel?: string },
): Promise<ActiveUserContext> {
  const result = await resolveCurrentOrganiserContext(allowedRoles);

  if (result.ok) {
    return result.context;
  }

  if (result.code === "config") {
    redirect("/login?error=config");
  }

  if (result.code === "unauthenticated") {
    redirect("/login");
  }

  if (result.code === "missing_profile") {
    redirect("/login?error=no_profile");
  }

  if (result.code === "inactive") {
    redirect("/login?error=inactive");
  }

  await recordAuditLog({
    actorUserId: result.userId ?? null,
    actorEmail: result.email ?? null,
    action: "security.unauthorized_page_access",
    entityType: "route",
    entityId: options?.routeLabel ?? null,
    metadata: {
      actorRole: result.role ?? null,
      requiredRoles: [...allowedRoles],
    },
  });

  redirect("/access-denied");
}

/**
 * Authoritative server-side guard for Server Actions and API Route Handlers.
 * Throws OrganiserAuthError instead of relying on redirects.
 */
export async function requireActiveUserForAction(
  allowedRoles: readonly OrganiserRole[] = ALL_ORGANISER_ROLES,
  options?: { actionName?: string },
): Promise<ActiveUserContext> {
  const result = await resolveCurrentOrganiserContext(allowedRoles);

  if (result.ok) {
    return result.context;
  }

  if (result.code === "config") {
    throw new OrganiserAuthError(
      "Supabase environment variables are not configured.",
      "config",
      503,
    );
  }

  if (result.code === "unauthenticated") {
    throw new OrganiserAuthError(
      "Authentication is required. Please sign in again.",
      "unauthenticated",
      401,
    );
  }

  if (result.code === "missing_profile") {
    throw new OrganiserAuthError(
      "No active organiser profile is linked to this account.",
      "missing_profile",
      403,
    );
  }

  if (result.code === "inactive") {
    throw new OrganiserAuthError(
      "Your organiser account has been deactivated.",
      "inactive",
      403,
    );
  }

  await recordAuditLog({
    actorUserId: result.userId ?? null,
    actorEmail: result.email ?? null,
    action: "security.unauthorized_admin_action",
    entityType: "action",
    entityId: options?.actionName ?? null,
    metadata: {
      actorRole: result.role ?? null,
      requiredRoles: [...allowedRoles],
    },
  });

  throw new OrganiserAuthError(
    "You do not have permission to perform this action.",
    "forbidden",
    403,
  );
}
