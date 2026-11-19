"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdminSupabaseConfigured } from "@/lib/supabase/server-env";
import { recordAuditLog } from "@/lib/audit/logger";
import {
  OrganiserAuthError,
  requireActiveUserForAction,
} from "@/lib/auth/guards";
import { ALL_ORGANISER_ROLES } from "@/lib/auth/policy";
import { parseCsv } from "@/lib/import/csv-parser";
import { parseExcel } from "@/lib/import/excel-parser";
import { buildDefaultMappings } from "@/lib/import/column-mapper";
import { validateAndPreviewImport } from "@/lib/import/validator";
import type {
  ColumnMappingItem,
  ImportExecutionResult,
  ImportPreviewResult,
  RegistrationImportRecord,
} from "@/types/data-operations";
import type {
  ContingentRecord,
  EventEntryRecord,
  EventRecord,
  ParticipantRecord,
} from "@/types/competition";

export interface ParseRegistrationFileResult {
  ok: boolean;
  message: string;
  fileName?: string;
  fileSizeBytes?: number;
  headers?: string[];
  rows?: Record<string, string>[];
  totalRows?: number;
  mappings?: ColumnMappingItem[];
}

const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function parseRegistrationFileAction(
  formData: FormData,
): Promise<ParseRegistrationFileResult> {
  try {
    await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "registration_import.upload",
    });

    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return { ok: false, message: "Please select a valid CSV or Excel file to upload." };
    }

    if (file.size === 0) {
      return { ok: false, message: "The uploaded file is empty (0 bytes)." };
    }

    if (file.size > MAX_IMPORT_FILE_SIZE) {
      return {
        ok: false,
        message: `File size exceeds the 10 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB).`,
      };
    }

    const fileName = file.name;
    const lowerName = fileName.toLowerCase();
    const isCsv = lowerName.endsWith(".csv");
    const isExcel =
      lowerName.endsWith(".xlsx") ||
      lowerName.endsWith(".xls") ||
      file.type.includes("spreadsheet") ||
      file.type.includes("excel");

    if (!isCsv && !isExcel) {
      return {
        ok: false,
        message:
          "Unsupported file format. Please upload a CSV (.csv) or Excel (.xlsx) file.",
      };
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let parsedHeaders: string[] = [];
    let parsedRows: Record<string, string>[] = [];
    let totalRows = 0;

    if (isCsv) {
      const text = buffer.toString("utf8");
      const csvResult = parseCsv(text);
      parsedHeaders = csvResult.headers;
      parsedRows = csvResult.rows;
      totalRows = csvResult.totalRows;
    } else {
      try {
        const excelResult = parseExcel(buffer);
        parsedHeaders = excelResult.headers;
        parsedRows = excelResult.rows;
        totalRows = excelResult.totalRows;
      } catch (excelErr) {
        return {
          ok: false,
          message:
            excelErr instanceof Error
              ? excelErr.message
              : "Unable to parse Excel file. Please ensure it is a valid .xlsx file or convert to CSV.",
        };
      }
    }

    if (parsedHeaders.length === 0 || totalRows === 0) {
      return {
        ok: false,
        message: "The uploaded file contains no data rows or headers.",
      };
    }

    const mappings = buildDefaultMappings(parsedHeaders, parsedRows);

    return {
      ok: true,
      message: `Parsed ${totalRows} row(s) with ${parsedHeaders.length} column(s).`,
      fileName,
      fileSizeBytes: file.size,
      headers: parsedHeaders,
      rows: parsedRows,
      totalRows,
      mappings,
    };
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : "Unexpected error parsing registration file.",
    };
  }
}

export async function previewRegistrationImportAction(input: {
  fileName: string;
  fileSizeBytes: number;
  rows: Record<string, string>[];
  mappings: ColumnMappingItem[];
}): Promise<{ ok: boolean; message: string; preview?: ImportPreviewResult }> {
  try {
    await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "registration_import.preview",
    });

    const supabase = await createSupabaseServerClient();

    const [eventsRes, contingentsRes, participantsRes, entriesRes] =
      await Promise.all([
        supabase.from("events").select("*").returns<EventRecord[]>(),
        supabase.from("contingents").select("*").returns<ContingentRecord[]>(),
        supabase
          .from("participants")
          .select("*")
          .returns<ParticipantRecord[]>(),
        supabase
          .from("event_entries")
          .select("*")
          .returns<EventEntryRecord[]>(),
      ]);

    const preview = validateAndPreviewImport({
      fileName: input.fileName,
      fileSizeBytes: input.fileSizeBytes,
      rows: input.rows,
      mappings: input.mappings,
      existingEvents: eventsRes.data ?? [],
      existingContingents: contingentsRes.data ?? [],
      existingParticipants: participantsRes.data ?? [],
      existingEntries: entriesRes.data ?? [],
    });

    return {
      ok: true,
      message: `Validation complete. ${preview.validRowsCount} valid rows, ${preview.invalidRowsCount} invalid rows.`,
      preview,
    };
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : "Failed to validate registration import.",
    };
  }
}

export async function commitRegistrationImportAction(input: {
  preview: ImportPreviewResult;
  applyUpdatesToExisting: boolean;
}): Promise<ImportExecutionResult> {
  try {
    const actor = await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "registration_import.commit",
    });

    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        message:
          "Import requires SUPABASE_SERVICE_ROLE_KEY to be configured on the server for transactional registration processing.",
      };
    }

    const { preview, applyUpdatesToExisting } = input;
    const supabase = await createSupabaseServerClient();
    const admin = createSupabaseAdminClient();

    let createdContingents = 0;
    let updatedContingents = 0;
    let createdParticipants = 0;
    let updatedParticipants = 0;
    let createdEntries = 0;
    let skipped = 0;
    const rejected = preview.invalidRowsCount;

    // Load existing events map for entries
    const { data: events } = await supabase.from("events").select("id, code");
    const eventIdByCode = new Map<string, string>();
    for (const ev of events ?? []) {
      eventIdByCode.set(ev.code.toUpperCase(), ev.id);
    }

    // 1. Process Contingents
    const contingentIdByCode = new Map<string, string>();
    // Pre-populate with existing
    const { data: existingContingents } = await supabase
      .from("contingents")
      .select("id, contingent_code, name, institution_city, contact_email, contact_phone, notes");

    for (const c of existingContingents ?? []) {
      contingentIdByCode.set(c.contingent_code.toUpperCase(), c.id);
    }

    // Insert new contingents
    for (const c of preview.newContingents) {
      const { data: inserted, error } = await supabase
        .from("contingents")
        .insert({
          contingent_code: c.code.toUpperCase(),
          name: c.name,
          institution_name: c.institutionName,
          institution_city: c.institutionCity,
          contact_email: c.contactEmail,
          contact_phone: c.contactPhone,
          external_registration_ref: c.externalRef,
          notes: c.notes,
          is_active: true,
        })
        .select("id, contingent_code")
        .single<ContingentRecord>();

      if (!error && inserted) {
        contingentIdByCode.set(inserted.contingent_code.toUpperCase(), inserted.id);
        createdContingents++;
      } else {
        skipped++;
      }
    }

    // Update existing contingents if authorized
    if (applyUpdatesToExisting && preview.existingContingents.length > 0) {
      for (const c of preview.existingContingents) {
        const existingId = contingentIdByCode.get(c.code.toUpperCase());
        if (existingId) {
          const updatePayload: Record<string, unknown> = {
            name: c.name,
            institution_name: c.institutionName,
          };
          if (c.institutionCity) updatePayload.institution_city = c.institutionCity;
          if (c.contactEmail) updatePayload.contact_email = c.contactEmail;
          if (c.contactPhone) updatePayload.contact_phone = c.contactPhone;

          const { error } = await supabase
            .from("contingents")
            .update(updatePayload)
            .eq("id", existingId);

          if (!error) {
            updatedContingents++;
          }
        }
      }
    }

    // 2. Process Participants
    const participantIdByCode = new Map<string, string>();
    const { data: existingParticipants } = await supabase
      .from("participants")
      .select("id, participant_code");

    for (const p of existingParticipants ?? []) {
      participantIdByCode.set(p.participant_code.toUpperCase(), p.id);
    }

    // Insert new participants
    for (const p of preview.newParticipants) {
      const linkedContingentId = p.contingentCode
        ? contingentIdByCode.get(p.contingentCode.toUpperCase()) ?? null
        : null;

      const { data: inserted, error } = await supabase
        .from("participants")
        .insert({
          participant_code: p.code.toUpperCase(),
          full_name: p.fullName,
          email: p.email,
          phone: p.phone,
          institution_name: p.institutionName,
          contingent_id: linkedContingentId,
          is_contingent_lead: p.isContingentLead && Boolean(linkedContingentId),
          external_registration_ref: p.externalRef,
          is_active: true,
        })
        .select("id, participant_code")
        .single<ParticipantRecord>();

      if (!error && inserted) {
        participantIdByCode.set(inserted.participant_code.toUpperCase(), inserted.id);
        createdParticipants++;
      } else {
        skipped++;
      }
    }

    // Update existing participants if authorized
    if (applyUpdatesToExisting && preview.existingParticipants.length > 0) {
      for (const p of preview.existingParticipants) {
        const existingId = participantIdByCode.get(p.code.toUpperCase());
        if (existingId) {
          const updatePayload: Record<string, unknown> = {
            full_name: p.fullName,
            institution_name: p.institutionName,
          };
          if (p.email) updatePayload.email = p.email;
          if (p.phone) updatePayload.phone = p.phone;
          if (p.contingentCode) {
            const cid = contingentIdByCode.get(p.contingentCode.toUpperCase());
            if (cid) updatePayload.contingent_id = cid;
          }

          const { error } = await supabase
            .from("participants")
            .update(updatePayload)
            .eq("id", existingId);

          if (!error) {
            updatedParticipants++;
          }
        }
      }
    }

    // 3. Process Event Entries (Non-destructive: insert new only, NEVER delete or overwrite)
    for (const e of preview.newEntries) {
      const eventId = eventIdByCode.get(e.eventCode.toUpperCase());
      if (!eventId) {
        skipped++;
        continue;
      }

      if (e.entryType === "contingent" && e.contingentCode) {
        const contingentId = contingentIdByCode.get(e.contingentCode.toUpperCase());
        if (contingentId) {
          const { error } = await supabase.from("event_entries").insert({
            event_id: eventId,
            entry_type: "contingent",
            contingent_id: contingentId,
            participant_id: null,
            status: "registered",
          });
          if (!error) {
            createdEntries++;
          } else {
            skipped++;
          }
        }
      } else if (e.entryType === "individual" && e.participantCode) {
        const participantId = participantIdByCode.get(e.participantCode.toUpperCase());
        if (participantId) {
          const { error } = await supabase.from("event_entries").insert({
            event_id: eventId,
            entry_type: "individual",
            contingent_id: null,
            participant_id: participantId,
            status: "registered",
          });
          if (!error) {
            createdEntries++;
          } else {
            skipped++;
          }
        }
      }
    }

    // 4. Record Import History in registration_imports table
    const { data: importRecord, error: histError } = await admin
      .from("registration_imports")
      .insert({
        imported_by: actor.userId,
        imported_by_email: actor.profile.email,
        file_name: preview.fileName,
        file_size_bytes: preview.fileSizeBytes,
        total_rows: preview.totalRows,
        created_contingents_count: createdContingents,
        updated_contingents_count: updatedContingents,
        created_participants_count: createdParticipants,
        updated_participants_count: updatedParticipants,
        created_entries_count: createdEntries,
        skipped_records_count: skipped,
        rejected_records_count: rejected,
        validation_errors: preview.errors.slice(0, 100), // top 100 errors for auditing
        summary: {
          applyUpdatesToExisting,
          missingFromImportCount: preview.missingFromImport.length,
          newContingentsCount: preview.newContingents.length,
          newParticipantsCount: preview.newParticipants.length,
          newEntriesCount: preview.newEntries.length,
        },
      })
      .select("id")
      .single<{ id: string }>();

    // 5. Record immutable audit log
    await recordAuditLog({
      actorUserId: actor.userId,
      actorEmail: actor.profile.email,
      action: "registration_import.completed",
      entityType: "registration_import",
      entityId: importRecord?.id ?? null,
      metadata: {
        fileName: preview.fileName,
        totalRows: preview.totalRows,
        createdContingents,
        updatedContingents,
        createdParticipants,
        updatedParticipants,
        createdEntries,
        skipped,
        rejected,
        applyUpdatesToExisting,
      },
    });

    revalidatePath("/contingents");
    revalidatePath("/participants");
    revalidatePath("/events");
    revalidatePath("/registration-import");

    return {
      ok: true,
      message: `Import successfully completed: ${createdContingents} contingents created, ${updatedContingents} updated; ${createdParticipants} participants created, ${updatedParticipants} updated; ${createdEntries} event entries added.`,
      importId: importRecord?.id,
      stats: {
        createdContingents,
        updatedContingents,
        createdParticipants,
        updatedParticipants,
        createdEntries,
        skipped,
        rejected,
      },
    };
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return { ok: false, message: err.message };
    }
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : "Unexpected error during registration import execution.",
    };
  }
}

export async function getRegistrationImportHistoryAction(): Promise<
  RegistrationImportRecord[]
> {
  try {
    await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "registration_import.history",
    });

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("registration_imports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<RegistrationImportRecord[]>();

    if (error || !data) {
      return [];
    }

    return data;
  } catch {
    return [];
  }
}
