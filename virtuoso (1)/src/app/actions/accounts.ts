"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdminSupabaseConfigured } from "@/lib/supabase/server-env";
import { recordAuditLog } from "@/lib/audit/logger";
import {
  OrganiserAuthError,
  requireActiveUserForAction,
} from "@/lib/auth/guards";
import { SUPER_ADMIN_ONLY } from "@/lib/auth/policy";
import {
  validateEmailInput,
  validateFullNameInput,
  validateOrganiserRoleInput,
  validatePasswordInput,
  validateProfileMutation,
} from "@/lib/auth/account-rules";
import type { OrganiserProfile } from "@/types/auth";

export interface AccountActionResult {
  ok: boolean;
  message: string;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createOrganiserAccountAction(
  _prevState: AccountActionResult | null,
  formData: FormData,
): Promise<AccountActionResult> {
  try {
    const actor = await requireActiveUserForAction(SUPER_ADMIN_ONLY, {
      actionName: "account.create",
    });

    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        message:
          "SUPABASE_SERVICE_ROLE_KEY is missing on the server. Provisioning requires admin configuration.",
      };
    }

    const nameCheck = validateFullNameInput(
      String(formData.get("fullName") ?? ""),
    );
    if (!nameCheck.ok) {
      return { ok: false, message: nameCheck.error };
    }

    const emailCheck = validateEmailInput(String(formData.get("email") ?? ""));
    if (!emailCheck.ok) {
      return { ok: false, message: emailCheck.error };
    }

    const passwordCheck = validatePasswordInput(
      String(formData.get("password") ?? ""),
    );
    if (!passwordCheck.ok) {
      return { ok: false, message: passwordCheck.error };
    }

    const roleCheck = validateOrganiserRoleInput(
      String(formData.get("role") ?? "event_coordinator"),
    );
    if (!roleCheck.ok) {
      return { ok: false, message: roleCheck.error };
    }

    const admin = createSupabaseAdminClient();

    const { data: existingProfile, error: lookupError } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", emailCheck.value)
      .maybeSingle<{ id: string }>();

    if (lookupError) {
      console.error("[accounts] lookup failed:", lookupError.message);
      return {
        ok: false,
        message: "Unable to verify existing accounts. Please try again.",
      };
    }

    if (existingProfile) {
      return {
        ok: false,
        message: "An organiser account with this email address already exists.",
      };
    }

    const { data: createdAuth, error: createAuthError } =
      await admin.auth.admin.createUser({
        email: emailCheck.value,
        password: passwordCheck.value,
        email_confirm: true,
        user_metadata: {
          full_name: nameCheck.value,
        },
      });

    if (createAuthError || !createdAuth.user) {
      const safeReason =
        createAuthError?.message.toLowerCase().includes("already")
          ? "An authentication account with this email already exists."
          : "Unable to create authentication user. Verify Supabase Auth settings and try again.";
      return { ok: false, message: safeReason };
    }

    const newUserId = createdAuth.user.id;

    const { error: insertProfileError } = await admin.from("profiles").insert({
      id: newUserId,
      full_name: nameCheck.value,
      email: emailCheck.value,
      role: roleCheck.value,
      scope_mode: "all_events",
      is_active: true,
    });

    if (insertProfileError) {
      // Roll back the Auth user if profile creation fails so no orphan login exists.
      await admin.auth.admin.deleteUser(newUserId);
      console.error("[accounts] profile insert failed:", insertProfileError.message);
      return {
        ok: false,
        message: "Failed to save organiser profile. Account creation was rolled back.",
      };
    }

    await recordAuditLog({
      actorUserId: actor.userId,
      actorEmail: actor.profile.email,
      action: "account.created",
      entityType: "profile",
      entityId: newUserId,
      afterData: {
        full_name: nameCheck.value,
        email: emailCheck.value,
        role: roleCheck.value,
        scope_mode: "all_events",
        is_active: true,
      },
    });

    revalidatePath("/admin/accounts");
    revalidatePath("/admin/audit-logs");

    return {
      ok: true,
      message: `Provisioned ${nameCheck.value} (${emailCheck.value}) as ${
        roleCheck.value === "super_admin" ? "Super Admin" : "Event Coordinator"
      }.`,
    };
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    console.error(
      "[accounts] unexpected create error:",
      err instanceof Error ? err.message : "unknown",
    );
    return {
      ok: false,
      message: "Unexpected error while provisioning organiser account.",
    };
  }
}

export async function updateOrganiserAccountAction(
  formData: FormData,
): Promise<AccountActionResult> {
  try {
    const actor = await requireActiveUserForAction(SUPER_ADMIN_ONLY, {
      actionName: "account.update",
    });

    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        message:
          "SUPABASE_SERVICE_ROLE_KEY is missing on the server. Account updates require admin configuration.",
      };
    }

    const targetUserId = String(formData.get("targetUserId") ?? "").trim();
    if (!UUID_REGEX.test(targetUserId)) {
      return { ok: false, message: "Invalid target account identifier." };
    }

    const roleCheck = validateOrganiserRoleInput(
      String(formData.get("nextRole") ?? ""),
    );
    if (!roleCheck.ok) {
      return { ok: false, message: roleCheck.error };
    }

    const rawActive = String(formData.get("nextIsActive") ?? "");
    if (rawActive !== "true" && rawActive !== "false") {
      return { ok: false, message: "Invalid account status value." };
    }
    const nextIsActive = rawActive === "true";

    const admin = createSupabaseAdminClient();

    const { data: targetProfile, error: targetError } = await admin
      .from("profiles")
      .select(
        "id, full_name, email, role, scope_mode, is_active, created_at, updated_at",
      )
      .eq("id", targetUserId)
      .maybeSingle<OrganiserProfile>();

    if (targetError || !targetProfile) {
      return { ok: false, message: "Target organiser profile was not found." };
    }

    const { count: activeSuperAdminCount, error: countError } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "super_admin")
      .eq("is_active", true);

    if (countError || activeSuperAdminCount === null) {
      return {
        ok: false,
        message: "Unable to verify active Super Admin count.",
      };
    }

    const mutationCheck = validateProfileMutation({
      actor: actor.profile,
      target: targetProfile,
      nextRole: roleCheck.value,
      nextIsActive,
      activeSuperAdminCount,
    });

    if (!mutationCheck.ok) {
      return { ok: false, message: mutationCheck.error };
    }

    const roleChanged = targetProfile.role !== roleCheck.value;
    const statusChanged = targetProfile.is_active !== nextIsActive;

    if (!roleChanged && !statusChanged) {
      return { ok: true, message: "No changes were needed." };
    }

    const { error: updateError } = await admin
      .from("profiles")
      .update({
        role: roleCheck.value,
        is_active: nextIsActive,
      })
      .eq("id", targetProfile.id);

    if (updateError) {
      console.error("[accounts] update failed:", updateError.message);
      return {
        ok: false,
        message: updateError.message.includes("last active super_admin")
          ? "Cannot deactivate or demote the last active Super Admin."
          : "Unable to update organiser profile.",
      };
    }

    let actionName = "account.updated";
    if (statusChanged && !roleChanged) {
      actionName = nextIsActive ? "account.activated" : "account.deactivated";
    } else if (roleChanged && !statusChanged) {
      actionName = "account.role_changed";
    }

    await recordAuditLog({
      actorUserId: actor.userId,
      actorEmail: actor.profile.email,
      action: actionName,
      entityType: "profile",
      entityId: targetProfile.id,
      beforeData: {
        email: targetProfile.email,
        role: targetProfile.role,
        is_active: targetProfile.is_active,
      },
      afterData: {
        email: targetProfile.email,
        role: roleCheck.value,
        is_active: nextIsActive,
      },
    });

    revalidatePath("/admin/accounts");
    revalidatePath("/admin/audit-logs");

    return {
      ok: true,
      message: `Updated ${targetProfile.full_name} (${
        roleCheck.value === "super_admin" ? "Super Admin" : "Event Coordinator"
      }, ${nextIsActive ? "Active" : "Inactive"}).`,
    };
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    console.error(
      "[accounts] unexpected update error:",
      err instanceof Error ? err.message : "unknown",
    );
    return {
      ok: false,
      message: "Unexpected error while updating organiser account.",
    };
  }
}
