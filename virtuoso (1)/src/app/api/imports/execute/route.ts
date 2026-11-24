import { NextRequest, NextResponse } from "next/server";
import { recordAuditLog } from "@/lib/audit/logger";
import {
  OrganiserAuthError,
  requireActiveUserForAction,
} from "@/lib/auth/guards";
import { ALL_ORGANISER_ROLES } from "@/lib/auth/policy";
import { validateUuid } from "@/lib/competition/validation";
import {
  buildImportExecutionPlan,
  type ExistingContingentFullItem,
  type ExistingEventEntryFullItem,
  type ExistingParticipantFullItem,
} from "@/lib/imports/execution-planner";
import {
  sanitizeColumns,
  sanitizeFileFormat,
  sanitizeIdempotencyKey,
  sanitizeImportRpcError,
  sanitizeMappingInput,
  sanitizeRequiredOverrides,
  sanitizeResolutionSelection,
  sanitizeRows,
  sanitizeSourceFilename,
} from "@/lib/imports/request-helpers";
import { validateImportBatch } from "@/lib/imports/validator";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminSupabaseConfigured } from "@/lib/supabase/server-env";
import type { EventRecord } from "@/types/competition";
import type { ImportEventOption, ImportExecutionResult } from "@/types/imports";

export const runtime = "nodejs";

interface RpcImportSummaryPayload {
  import_id: string;
  status: "completed" | "failed";
  idempotent_replay: boolean;
  total_rows: number;
  created_contingents_count: number;
  created_participants_count: number;
  created_entries_count: number;
  reused_records_count: number;
  updated_records_count: number;
  skipped_rows_count: number;
  rejected_rows_count: number;
  missing_from_file_count: number;
  created_at: string;
}

export async function POST(request: NextRequest) {
  try {
    const { userId, profile } = await requireActiveUserForAction(
      ALL_ORGANISER_ROLES,
      { actionName: "import.execute" },
    );

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

    const idempotencyKey = sanitizeIdempotencyKey(body.idempotencyKey);
    if (!idempotencyKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "A valid import idempotency key (8–128 characters) is required.",
        },
        { status: 400 },
      );
    }

    const fileFormat = sanitizeFileFormat(body.fileFormat);
    if (!fileFormat) {
      return NextResponse.json(
        { ok: false, error: "File format must be csv or xlsx." },
        { status: 400 },
      );
    }

    const sourceFilename = sanitizeSourceFilename(body.sourceFilename);

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
    const resolutions = sanitizeResolutionSelection(body.resolutions);

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
            "Unable to load existing CMS registry records for authoritative revalidation.",
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

    // Authoritative server-side revalidation: never trust client-supplied validation flags or counts
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

    const planResult = buildImportExecutionPlan({
      report,
      cmsContext: {
        contingents,
        participants,
        eventEntries,
      },
      selection: resolutions,
    });

    if (!planResult.ok) {
      return NextResponse.json(
        { ok: false, error: planResult.error },
        { status: 400 },
      );
    }

    const { plan, resolutionContext } = planResult;

    // Pre-flight completed idempotency check
    const { data: existingCompleted, error: preflightErr } = await supabase
      .from("registration_imports")
      .select(
        "id, status, payload_hash, total_rows, created_contingents_count, created_participants_count, created_entries_count, reused_records_count, updated_records_count, skipped_rows_count, rejected_rows_count, missing_from_file_count, created_at",
      )
      .eq("event_id", eventRow.id)
      .eq("idempotency_key", idempotencyKey)
      .eq("status", "completed")
      .maybeSingle<{
        id: string;
        status: "completed" | "failed";
        payload_hash: string;
        total_rows: number;
        created_contingents_count: number;
        created_participants_count: number;
        created_entries_count: number;
        reused_records_count: number;
        updated_records_count: number;
        skipped_rows_count: number;
        rejected_rows_count: number;
        missing_from_file_count: number;
        created_at: string;
      }>();

    if (preflightErr) {
      const mappedPreflight = sanitizeImportRpcError(
        preflightErr.message,
        preflightErr.code,
      );
      return NextResponse.json(
        {
          ok: false,
          error: mappedPreflight.missingMigration
            ? mappedPreflight.message
            : "Unable to verify import execution history table.",
        },
        { status: mappedPreflight.missingMigration ? 503 : 500 },
      );
    }

    if (existingCompleted) {
      if (existingCompleted.payload_hash !== plan.payloadHash) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "This import confirmation token was already used for a different set of changes. Re-run validation or confirm again to generate a fresh import request.",
          },
          { status: 409 },
        );
      }

      const replayResult: ImportExecutionResult = {
        importId: existingCompleted.id,
        status: "completed",
        idempotentReplay: true,
        totalRows: existingCompleted.total_rows,
        createdContingentsCount: existingCompleted.created_contingents_count,
        createdParticipantsCount: existingCompleted.created_participants_count,
        createdEntriesCount: existingCompleted.created_entries_count,
        reusedRecordsCount: existingCompleted.reused_records_count,
        updatedRecordsCount: existingCompleted.updated_records_count,
        skippedRowsCount: existingCompleted.skipped_rows_count,
        rejectedRowsCount: existingCompleted.rejected_rows_count,
        missingFromFileCount: existingCompleted.missing_from_file_count,
        createdAt: existingCompleted.created_at,
        missingFromFileEntries: resolutionContext.missingFromFileEntries,
        auditWarning: null,
      };

      return NextResponse.json({
        ok: true,
        executionResult: replayResult,
        auditWarning: null,
      });
    }

    const auditWarnings: string[] = [];

    // Record non-PII initiated audit event prior to RPC execution
    const initiatedAudit = await recordAuditLog({
      actorUserId: userId,
      actorEmail: profile.email,
      action: "registration_import.initiated",
      entityType: "registration_import",
      entityId: eventRow.id,
      metadata: {
        eventId: eventRow.id,
        eventCode: eventRow.code,
        idempotencyKey,
        sourceFilename,
        fileFormat,
        payloadHash: plan.payloadHash,
        plannedSummary: plan.preExecutionSummary,
      },
    });
    if (!initiatedAudit.ok && initiatedAudit.error) {
      auditWarnings.push(initiatedAudit.error);
    }

    const summaryMeta = {
      total_rows: plan.preExecutionSummary.totalRows,
      active_rows_count: plan.preExecutionSummary.activeRowsCount,
      skipped_rows_count: plan.preExecutionSummary.skippedRowsCount,
      rejected_rows_count: plan.preExecutionSummary.rejectedRowsCount,
      missing_from_file_count: plan.preExecutionSummary.missingFromFileCount,
      approved_updates_count: plan.approvedUpdates.length,
    };

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "execute_registration_import",
      {
        p_event_id: eventRow.id,
        p_idempotency_key: idempotencyKey,
        p_payload_hash: plan.payloadHash,
        p_source_filename: sourceFilename,
        p_file_format: fileFormat,
        p_summary_meta: summaryMeta,
        p_contingent_ops: plan.contingentOps,
        p_participant_ops: plan.participantOps,
        p_entry_ops: plan.entryOps,
      },
    );

    if (rpcError || !rpcData) {
      const mapped = sanitizeImportRpcError(
        rpcError?.message ?? "Import execution failed.",
        rpcError?.code ?? null,
      );

      if (!mapped.missingMigration) {
        if (isAdminSupabaseConfigured()) {
          try {
            const admin = createSupabaseAdminClient();
            await admin.from("registration_imports").insert({
              event_id: eventRow.id,
              initiated_by: userId,
              initiated_by_email: profile.email,
              idempotency_key: idempotencyKey,
              payload_hash: plan.payloadHash,
              source_filename: sourceFilename,
              file_format: fileFormat,
              status: "failed",
              total_rows: plan.preExecutionSummary.totalRows,
              created_contingents_count: 0,
              created_participants_count: 0,
              created_entries_count: 0,
              reused_records_count: 0,
              updated_records_count: 0,
              skipped_rows_count: plan.preExecutionSummary.skippedRowsCount,
              rejected_rows_count: plan.preExecutionSummary.rejectedRowsCount,
              missing_from_file_count:
                plan.preExecutionSummary.missingFromFileCount,
              error_summary: mapped.message,
              summary_metadata: summaryMeta,
            });
          } catch (historyErr) {
            console.error(
              "[imports/execute] failed to record failed import history:",
              historyErr instanceof Error ? historyErr.message : "unknown",
            );
          }
        }

        await recordAuditLog({
          actorUserId: userId,
          actorEmail: profile.email,
          action: "registration_import.failed",
          entityType: "registration_import",
          entityId: eventRow.id,
          metadata: {
            eventId: eventRow.id,
            eventCode: eventRow.code,
            idempotencyKey,
            sourceFilename,
            fileFormat,
            errorSummary: mapped.message,
            rolledBack: true,
          },
        });
      }

      return NextResponse.json(
        {
          ok: false,
          error: mapped.message,
          rolledBack: !mapped.missingMigration,
        },
        { status: mapped.status },
      );
    }

    const rpcRow = rpcData as RpcImportSummaryPayload;
    const isReplay = Boolean(rpcRow.idempotent_replay);

    if (!isReplay) {
      const completedAudit = await recordAuditLog({
        actorUserId: userId,
        actorEmail: profile.email,
        action: "registration_import.completed",
        entityType: "registration_import",
        entityId: rpcRow.import_id,
        metadata: {
          importId: rpcRow.import_id,
          eventId: eventRow.id,
          eventCode: eventRow.code,
          sourceFilename,
          fileFormat,
          totalRows: rpcRow.total_rows,
          createdContingentsCount: rpcRow.created_contingents_count,
          createdParticipantsCount: rpcRow.created_participants_count,
          createdEntriesCount: rpcRow.created_entries_count,
          reusedRecordsCount: rpcRow.reused_records_count,
          updatedRecordsCount: rpcRow.updated_records_count,
          skippedRowsCount: rpcRow.skipped_rows_count,
          rejectedRowsCount: rpcRow.rejected_rows_count,
          missingFromFileCount: rpcRow.missing_from_file_count,
        },
      });
      if (!completedAudit.ok && completedAudit.error) {
        auditWarnings.push(completedAudit.error);
      }

      if (plan.approvedUpdates.length > 0) {
        const updatesAudit = await recordAuditLog({
          actorUserId: userId,
          actorEmail: profile.email,
          action: "registration_import.approved_updates_applied",
          entityType: "registration_import",
          entityId: rpcRow.import_id,
          metadata: {
            importId: rpcRow.import_id,
            eventId: eventRow.id,
            eventCode: eventRow.code,
            approvedUpdatesCount: plan.approvedUpdates.length,
            updates: plan.approvedUpdates.map((item) => ({
              entity: item.entity,
              existingId: item.existingId,
              entityCode: item.entityCode,
              updatedFields: item.updatedFields,
            })),
          },
        });
        if (!updatesAudit.ok && updatesAudit.error) {
          auditWarnings.push(updatesAudit.error);
        }
      }
    }

    const uniqueWarnings = Array.from(new Set(auditWarnings));
    const auditWarning =
      uniqueWarnings.length > 0 ? uniqueWarnings.join(" ") : null;

    const executionResult: ImportExecutionResult = {
      importId: rpcRow.import_id,
      status: rpcRow.status,
      idempotentReplay: isReplay,
      totalRows: rpcRow.total_rows,
      createdContingentsCount: rpcRow.created_contingents_count,
      createdParticipantsCount: rpcRow.created_participants_count,
      createdEntriesCount: rpcRow.created_entries_count,
      reusedRecordsCount: rpcRow.reused_records_count,
      updatedRecordsCount: rpcRow.updated_records_count,
      skippedRowsCount: rpcRow.skipped_rows_count,
      rejectedRowsCount: rpcRow.rejected_rows_count,
      missingFromFileCount: rpcRow.missing_from_file_count,
      createdAt: rpcRow.created_at,
      missingFromFileEntries: resolutionContext.missingFromFileEntries,
      auditWarning,
    };

    return NextResponse.json({
      ok: true,
      executionResult,
      auditWarning,
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
        error: "Unexpected server error while executing registration import.",
      },
      { status: 500 },
    );
  }
}
