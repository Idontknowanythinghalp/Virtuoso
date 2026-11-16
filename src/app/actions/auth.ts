"use server";

import { redirect } from "next/navigation";
import { isPublicSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordAuditLog } from "@/lib/audit/logger";
import { validateEmailInput } from "@/lib/auth/account-rules";
import { sanitizeInternalRedirectPath } from "@/lib/auth/policy";
import type { OrganiserProfile } from "@/types/auth";

export interface LoginActionState {
  error: string | null;
}

export async function signInOrganiserAction(
  _prevState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  if (!isPublicSupabaseConfigured()) {
    return {
      error:
        "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your environment.",
    };
  }

  const rawEmail = String(formData.get("email") ?? "");
  const rawPassword = String(formData.get("password") ?? "");
  const nextPath = sanitizeInternalRedirectPath(
    String(formData.get("next") ?? "/"),
    "/",
  );

  const emailCheck = validateEmailInput(rawEmail);
  if (!emailCheck.ok) {
    return { error: emailCheck.error };
  }

  if (!rawPassword) {
    return { error: "Password is required." };
  }

  const email = emailCheck.value;
  const supabase = await createSupabaseServerClient();

  const { data, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: rawPassword,
  });

  if (signInError || !data.user) {
    await recordAuditLog({
      actorUserId: null,
      actorEmail: email,
      action: "auth.login_failed",
      entityType: "session",
      entityId: null,
      metadata: { reason: "invalid_credentials" },
    });
    return { error: "Invalid email or password." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, role, scope_mode, is_active, created_at, updated_at",
    )
    .eq("id", data.user.id)
    .maybeSingle<OrganiserProfile>();

  if (profileError || !profile) {
    await supabase.auth.signOut();
    await recordAuditLog({
      actorUserId: null,
      actorEmail: email,
      action: "auth.login_blocked_no_profile",
      entityType: "session",
      entityId: data.user.id,
      metadata: { reason: "missing_organiser_profile" },
    });
    return {
      error:
        "Your login succeeded, but no organiser CMS profile exists for this account. Contact a Super Admin.",
    };
  }

  if (!profile.is_active) {
    await supabase.auth.signOut();
    await recordAuditLog({
      actorUserId: profile.id,
      actorEmail: profile.email,
      action: "auth.login_blocked_inactive",
      entityType: "session",
      entityId: profile.id,
      metadata: { role: profile.role },
    });
    return {
      error:
        "This organiser account has been deactivated. Contact a Super Admin to restore access.",
    };
  }

  await recordAuditLog({
    actorUserId: profile.id,
    actorEmail: profile.email,
    action: "auth.login_success",
    entityType: "session",
    entityId: profile.id,
    afterData: {
      role: profile.role,
      scope_mode: profile.scope_mode,
    },
  });

  redirect(nextPath);
}

export async function signOutOrganiserAction(): Promise<void> {
  if (isPublicSupabaseConfigured()) {
    try {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await recordAuditLog({
          actorUserId: user.id,
          actorEmail: user.email ?? null,
          action: "auth.logout",
          entityType: "session",
          entityId: user.id,
        });
      }

      await supabase.auth.signOut();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown sign-out error";
      console.error("[auth] sign-out error:", message);
    }
  }

  redirect("/login?message=logged_out");
}
