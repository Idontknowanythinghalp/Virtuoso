import { NextRequest, NextResponse } from "next/server";
import {
  OrganiserAuthError,
  requireActiveUserForAction,
} from "@/lib/auth/guards";
import { ALL_ORGANISER_ROLES } from "@/lib/auth/policy";
import { validateUuid } from "@/lib/competition/validation";
import {
  buildResolutionContext,
  type ExistingContingentFullItem,
  type ExistingEventEntryFullItem,
  type ExistingParticipantFullItem,
} from "@/lib/imports/execution-planner";
import {
  sanitizeColumns,
  sanitizeMappingInput,
  sanitizeRequiredOverrides,
  sanitizeRows,
} from "@/lib/imports/request-helpers";
import { validateImportBatch } from "@/lib/imports/validator";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EventRecord } from "@/types/competition";
import type { ImportEventOption } from "@/types/imports";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "import.validate_preview",
    });

    let body: Record<string, unknown>;
    try {
      const parsed = await request.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json(
          { ok: false, error: "Invalid JSON request body." },
          { status: 400 },
        );
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Unable to parse request JSON body." },
        { status: 400 },
      );
    }

    const eventCheck = validateUuid(
      typeof body.eventId === "string" ? body.eventId : "",
      "Event",
    );
    if (!eventCheck.ok) {
      return NextResponse.json(
        { ok: false, error: eventCheck.error },
        { status: 400 },
      );
    }

    const columns = sanitizeColumns(body.columns);
    if (!columns) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Uploaded column metadata is missing or invalid. Re-upload the registration file.",
        },
        { status: 400 },
      );
    }

    const rows = sanitizeRows(body.rows, columns.length);
    if (!rows) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Parsed registration rows are missing or exceed the row limit.",
        },
        { status: 400 },
      );
    }

    const mapping = sanitizeMappingInput(body.mapping);
    const requiredOverrides = sanitizeRequiredOverrides(body.requiredFields);

    const supabase = await createSupabaseServerClient();
    const { data: eventRow, error: eventErr } = await supabase
      .from("events")
      .select(
        "id, code, name, entry_mode, codename_mode, status, min_team_size, max_team_size",
      )
      .eq("id", eventCheck.value)
      .maybeSingle<
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
        >
      >();

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

    // Read-only lookups under active organiser RLS for match diagnostics, diff preview & missing-from-file notices
    const [
      { data: contingentsData, error: contErr },
      { data: participantsData, error: partErr },
      { data: entriesData, error: entriesErr },
    ] = await Promise.all([
      supabase
        .from("contingents")
        .select(
          "id, contingent_code, name, institution_name, institution_city, external_registration_ref, contact_email, contact_phone, is_active, notes",
        )
        .returns<ExistingContingentFullItem[]>(),
      supabase
        .from("participants")
        .select(
          "id, contingent_id, participant_code, full_name, email, phone, institution_name, external_registration_ref, is_contingent_lead, is_active",
        )
        .returns<ExistingParticipantFullItem[]>(),
      supabase
        .from("event_entries")
        .select("id, event_id, entry_type, contingent_id, participant_id, status")
        .eq("event_id", eventRow.id)
        .returns<ExistingEventEntryFullItem[]>(),
    ]);

    if (contErr || partErr || entriesErr) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Unable to load existing CMS registry records for comparison preview.",
        },
        { status: 503 },
      );
    }

    const enteredContingentIds = new Set<string>();
    const enteredParticipantIds = new Set<string>();
    for (const entry of entriesData ?? []) {
      if (entry.contingent_id) enteredContingentIds.add(entry.contingent_id);
      if (entry.participant_id) enteredParticipantIds.add(entry.participant_id);
    }

    const eventOption: ImportEventOption = {
      id: eventRow.id,
      code: eventRow.code,
      name: eventRow.name,
      entry_mode: eventRow.entry_mode,
      codename_mode: eventRow.codename_mode,
      status: eventRow.status,
      min_team_size: eventRow.min_team_size,
      max_team_size: eventRow.max_team_size,
    };

    const contingents = contingentsData ?? [];
    const participants = participantsData ?? [];
    const eventEntries = entriesData ?? [];

    const report = validateImportBatch({
      event: eventOption,
      columns,
      rows,
      mapping,
      requiredOverrides,
      existingContext: {
        contingents,
        participants,
        enteredContingentIdsForEvent: enteredContingentIds,
        enteredParticipantIdsForEvent: enteredParticipantIds,
      },
    });

    const resolutionContext = buildResolutionContext({
      report,
      cmsContext: {
        contingents,
        participants,
        eventEntries,
      },
    });

    return NextResponse.json({ ok: true, report, resolutionContext });
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
        error: "Unexpected server error while validating import preview.",
      },
      { status: 500 },
    );
  }
}
