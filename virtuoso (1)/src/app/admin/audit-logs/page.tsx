import React from "react";
import { CmsShell } from "@/components/layout/CmsShell";
import { AuditLogViewer } from "@/components/admin/AuditLogViewer";
import { requireActiveUser } from "@/lib/auth/guards";
import { SUPER_ADMIN_ONLY } from "@/lib/auth/policy";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { siteConfig } from "@/lib/site-config";
import type { AuditLogEntry } from "@/types/auth";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

interface AuditLogsPageProps {
  searchParams: Promise<{
    action?: string;
    entityType?: string;
    page?: string;
  }>;
}

export default async function AdminAuditLogsPage({
  searchParams,
}: AuditLogsPageProps) {
  const { sessionUser } = await requireActiveUser(SUPER_ADMIN_ONLY, {
    routeLabel: "/admin/audit-logs",
  });

  const params = await searchParams;
  const selectedAction = (params.action ?? "").trim();
  const selectedEntityType = (params.entityType ?? "").trim();
  const parsedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("audit_logs")
    .select(
      "id, actor_user_id, actor_email, action, entity_type, entity_id, before_data, after_data, metadata, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (selectedAction) {
    query = query.eq("action", selectedAction);
  }
  if (selectedEntityType) {
    query = query.eq("entity_type", selectedEntityType);
  }

  const { data: entries, count, error } =
    await query.returns<AuditLogEntry[]>();

  return (
    <CmsShell
      user={sessionUser}
      breadcrumbs={[
        { label: siteConfig.appName, href: "/" },
        { label: "Administration" },
        { label: "Audit Log" },
      ]}
    >
      <section className="space-y-2 border-b border-slate-200 pb-6">
        <p className="text-xs font-medium text-[#4B0507]">
          Super Admin Security Trail
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Audit Log
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
          Immutable log of organiser provisioning, role changes, account status
          updates, authentication events, and denied access attempts.
        </p>
      </section>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800"
        >
          Unable to load audit logs. Verify that Stage 1B database migrations
          and Super Admin RLS policies have been applied.
        </div>
      ) : (
        <AuditLogViewer
          entries={entries ?? []}
          totalCount={count ?? 0}
          page={page}
          pageSize={PAGE_SIZE}
          selectedAction={selectedAction}
          selectedEntityType={selectedEntityType}
        />
      )}
    </CmsShell>
  );
}
