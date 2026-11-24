import React from "react";
import { CmsShell } from "@/components/layout/CmsShell";
import { ImportPreparationClient } from "@/components/imports/ImportPreparationClient";
import { requireActiveUser } from "@/lib/auth/guards";
import { ALL_ORGANISER_ROLES } from "@/lib/auth/policy";
import { siteConfig } from "@/lib/site-config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EventRecord } from "@/types/competition";
import type {
  ImportEventOption,
  RegistrationImportHistoryItem,
} from "@/types/imports";

export const dynamic = "force-dynamic";

async function loadImportPageData(): Promise<{
  events: ImportEventOption[];
  migrationMissing: boolean;
  defaultEventId: string;
  initialHistory: RegistrationImportHistoryItem[];
  historyMigrationMissing: boolean;
}> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, code, name, entry_mode, codename_mode, status, min_team_size, max_team_size",
    )
    .order("created_at", { ascending: false })
    .returns<
      Pick<
        EventRecord,
        | "id"
        | "code"
        | "name"
        | "entry_mode"
        | "codename_mode"
        | "status"
        | "min_team_size"
        | "max_team_size"
      >[]
    >();

  if (error || !data) {
    return {
      events: [],
      migrationMissing: Boolean(error),
      defaultEventId: "",
      initialHistory: [],
      historyMigrationMissing: false,
    };
  }

  const defaultEventId =
    data.find((e) => e.status !== "archived")?.id ?? data[0]?.id ?? "";

  if (!defaultEventId) {
    return {
      events: data,
      migrationMissing: false,
      defaultEventId: "",
      initialHistory: [],
      historyMigrationMissing: false,
    };
  }

  const { data: historyRows, error: historyErr } = await supabase
    .from("registration_imports")
    .select(
      "id, event_id, initiated_by, initiated_by_email, source_filename, file_format, status, total_rows, created_contingents_count, created_participants_count, created_entries_count, reused_records_count, updated_records_count, skipped_rows_count, rejected_rows_count, missing_from_file_count, error_summary, created_at",
    )
    .eq("event_id", defaultEventId)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<RegistrationImportHistoryItem[]>();

  if (historyErr) {
    const lower = historyErr.message.toLowerCase();
    const isMissing =
      historyErr.code === "42P01" ||
      historyErr.code === "PGRST205" ||
      lower.includes("registration_imports");
    return {
      events: data,
      migrationMissing: false,
      defaultEventId,
      initialHistory: [],
      historyMigrationMissing: isMissing,
    };
  }

  return {
    events: data,
    migrationMissing: false,
    defaultEventId,
    initialHistory: historyRows ?? [],
    historyMigrationMissing: false,
  };
}

export default async function ImportPreparationPage() {
  const { sessionUser } = await requireActiveUser(ALL_ORGANISER_ROLES, {
    routeLabel: "/imports",
  });

  const {
    events,
    migrationMissing,
    defaultEventId,
    initialHistory,
    historyMigrationMissing,
  } = await loadImportPageData();

  return (
    <CmsShell
      user={sessionUser}
      breadcrumbs={[
        { label: siteConfig.appName, href: "/" },
        { label: "Registration Imports" },
      ]}
    >
      <section className="space-y-2 border-b border-slate-200 pb-6">
        <p className="text-xs font-medium text-[#4B0507]">
          Stage 2B.2 · Safe Registration Import Execution
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Registration Import &amp; Execution
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
          Upload exported CSV or Excel (.xlsx) registration files, map source
          columns to CMS fields, resolve existing CMS matches or duplicate rows,
          and commit validated registrations atomically per event.
        </p>
      </section>

      <ImportPreparationClient
        events={events}
        migrationMissing={migrationMissing}
        initialEventId={defaultEventId}
        initialHistory={initialHistory}
        historyMigrationMissing={historyMigrationMissing}
      />
    </CmsShell>
  );
}
