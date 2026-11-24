import { NextRequest, NextResponse } from "next/server";
import {
  OrganiserAuthError,
  requireActiveUserForAction,
} from "@/lib/auth/guards";
import { ALL_ORGANISER_ROLES } from "@/lib/auth/policy";
import { validateUuid } from "@/lib/competition/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { RegistrationImportHistoryItem } from "@/types/imports";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "import.history",
    });

    const eventIdRaw = request.nextUrl.searchParams.get("eventId") ?? "";
    const eventCheck = validateUuid(eventIdRaw, "Event");
    if (!eventCheck.ok) {
      return NextResponse.json(
        { ok: false, error: eventCheck.error },
        { status: 400 },
      );
    }

    const supabase = await createSupabaseServerClient();

    const { data: eventRow, error: eventErr } = await supabase
      .from("events")
      .select("id")
      .eq("id", eventCheck.value)
      .maybeSingle<{ id: string }>();

    if (eventErr) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Stage 2A database tables are unavailable or inaccessible. Verify migration 0003 and RLS policies.",
        },
        { status: 503 },
      );
    }

    if (!eventRow) {
      return NextResponse.json(
        { ok: false, error: "Selected competition event was not found." },
        { status: 404 },
      );
    }

    const { data: historyRows, error: historyErr } = await supabase
      .from("registration_imports")
      .select(
        "id, event_id, initiated_by, initiated_by_email, source_filename, file_format, status, total_rows, created_contingents_count, created_participants_count, created_entries_count, reused_records_count, updated_records_count, skipped_rows_count, rejected_rows_count, missing_from_file_count, error_summary, created_at",
      )
      .eq("event_id", eventRow.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<RegistrationImportHistoryItem[]>();

    if (historyErr) {
      const msgLower = historyErr.message.toLowerCase();
      if (
        historyErr.code === "42P01" ||
        historyErr.code === "PGRST205" ||
        msgLower.includes("registration_imports")
      ) {
        return NextResponse.json({
          ok: true,
          history: [],
          migrationMissing: true,
        });
      }
      return NextResponse.json(
        {
          ok: false,
          error: "Unable to load registration import history.",
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      history: historyRows ?? [],
      migrationMissing: false,
    });
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: err.status },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: "Unexpected server error while loading import history.",
      },
      { status: 500 },
    );
  }
}
