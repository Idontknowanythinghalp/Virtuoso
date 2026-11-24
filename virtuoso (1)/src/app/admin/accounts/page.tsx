import React from "react";
import { CmsShell } from "@/components/layout/CmsShell";
import { AccountsManager } from "@/components/admin/AccountsManager";
import { requireActiveUser } from "@/lib/auth/guards";
import { SUPER_ADMIN_ONLY } from "@/lib/auth/policy";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminSupabaseConfigured } from "@/lib/supabase/server-env";
import { siteConfig } from "@/lib/site-config";
import type { OrganiserProfile } from "@/types/auth";

export const dynamic = "force-dynamic";

export default async function AdminAccountsPage() {
  const { sessionUser } = await requireActiveUser(SUPER_ADMIN_ONLY, {
    routeLabel: "/admin/accounts",
  });

  const supabase = await createSupabaseServerClient();
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, role, scope_mode, is_active, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .returns<OrganiserProfile[]>();

  return (
    <CmsShell
      user={sessionUser}
      breadcrumbs={[
        { label: siteConfig.appName, href: "/" },
        { label: "Administration" },
        { label: "Organiser Accounts" },
      ]}
    >
      <section className="space-y-2 border-b border-slate-200 pb-6">
        <p className="text-xs font-medium text-[#4B0507]">
          Super Admin Governance
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Organiser Accounts
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
          Manage Virtuoso CMS organiser access. Only active Super Admins can
          provision coordinators, adjust roles, or toggle account activation.
        </p>
      </section>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800"
        >
          Unable to load organiser profiles right now. Verify that Stage 1B
          database migrations and RLS policies have been applied.
        </div>
      ) : (
        <AccountsManager
          currentUserId={sessionUser.id}
          profiles={profiles ?? []}
          adminConfigured={isAdminSupabaseConfigured()}
        />
      )}
    </CmsShell>
  );
}
