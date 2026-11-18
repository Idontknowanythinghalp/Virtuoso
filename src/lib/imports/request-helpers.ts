import {
  ALL_TARGET_FIELD_KEYS,
  createEmptyMapping,
} from "@/lib/imports/fields";
import { MAX_IMPORT_COLUMNS, MAX_IMPORT_ROWS } from "@/lib/imports/parser";
import type {
  ColumnMappingState,
  DetectedColumn,
  EntityResolutionChoice,
  ImportFileFormat,
  ImportResolutionSelection,
  ImportTargetFieldKey,
  ParsedDataRow,
} from "@/types/imports";

export function sanitizeMappingInput(raw: unknown): ColumnMappingState {
  const clean = createEmptyMapping();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return clean;
  }
  const source = raw as Record<string, unknown>;
  for (const key of ALL_TARGET_FIELD_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const value = source[key];
      clean[key] = typeof value === "string" && value.trim() ? value.trim() : null;
    }
  }
  return clean;
}

export function sanitizeRequiredOverrides(raw: unknown): ImportTargetFieldKey[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(ALL_TARGET_FIELD_KEYS);
  const out: ImportTargetFieldKey[] = [];
  for (const item of raw) {
    if (
      typeof item === "string" &&
      allowed.has(item) &&
      !out.includes(item as ImportTargetFieldKey)
    ) {
      out.push(item as ImportTargetFieldKey);
    }
  }
  return out;
}

export function sanitizeColumns(raw: unknown): DetectedColumn[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_IMPORT_COLUMNS) {
    return null;
  }
  const columns: DetectedColumn[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i];
    if (!item || typeof item !== "object") return null;
    const obj = item as Record<string, unknown>;
    if (
      typeof obj.key !== "string" ||
      typeof obj.index !== "number" ||
      !Number.isInteger(obj.index) ||
      obj.index < 0 ||
      obj.index >= raw.length ||
      typeof obj.headerName !== "string"
    ) {
      return null;
    }
    columns.push({
      key: obj.key,
      index: obj.index,
      headerName: obj.headerName,
      displayLabel:
        typeof obj.displayLabel === "string" ? obj.displayLabel : obj.headerName,
      isDuplicateHeader: Boolean(obj.isDuplicateHeader),
      duplicateOccurrence:
        typeof obj.duplicateOccurrence === "number" ? obj.duplicateOccurrence : 1,
      duplicateTotal:
        typeof obj.duplicateTotal === "number" ? obj.duplicateTotal : 1,
      nonEmptyCount:
        typeof obj.nonEmptyCount === "number" ? obj.nonEmptyCount : 0,
      sampleValues: Array.isArray(obj.sampleValues)
        ? obj.sampleValues.filter((v): v is string => typeof v === "string").slice(0, 3)
        : [],
    });
  }
  return columns;
}

export function sanitizeRows(
  raw: unknown,
  columnCount: number,
): ParsedDataRow[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_IMPORT_ROWS) {
    return null;
  }
  const rows: ParsedDataRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const obj = item as Record<string, unknown>;
    if (
      typeof obj.rowNumber !== "number" ||
      !Number.isInteger(obj.rowNumber) ||
      obj.rowNumber < 1 ||
      !Array.isArray(obj.cells)
    ) {
      return null;
    }
    const cells = Array.from({ length: columnCount }, (_, idx) => {
      const val = obj.cells && Array.isArray(obj.cells) ? obj.cells[idx] : "";
      return typeof val === "string" ? val : String(val ?? "");
    });
    rows.push({ rowNumber: obj.rowNumber, cells });
  }
  return rows;
}

export function sanitizeResolutionSelection(
  raw: unknown,
): ImportResolutionSelection {
  const entityResolutions: Record<string, EntityResolutionChoice> = {};
  const skippedRowNumbers: number[] = [];

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { entityResolutions, skippedRowNumbers };
  }

  const source = raw as Record<string, unknown>;

  if (
    source.entityResolutions &&
    typeof source.entityResolutions === "object" &&
    !Array.isArray(source.entityResolutions)
  ) {
    for (const [matchKey, choiceRaw] of Object.entries(
      source.entityResolutions as Record<string, unknown>,
    )) {
      if (!choiceRaw || typeof choiceRaw !== "object" || Array.isArray(choiceRaw)) {
        continue;
      }
      const choiceObj = choiceRaw as Record<string, unknown>;
      const action =
        typeof choiceObj.action === "string" ? choiceObj.action.trim() : "";
      const approvedFields = Array.isArray(choiceObj.approvedFields)
        ? choiceObj.approvedFields
            .filter((f): f is string => typeof f === "string" && f.trim().length > 0)
            .map((f) => f.trim())
        : [];
      entityResolutions[matchKey] = {
        action: action as EntityResolutionChoice["action"],
        approvedFields: Array.from(new Set(approvedFields)),
      };
    }
  }

  if (Array.isArray(source.skippedRowNumbers)) {
    const seen = new Set<number>();
    for (const val of source.skippedRowNumbers) {
      if (typeof val === "number" && Number.isInteger(val) && val >= 1 && !seen.has(val)) {
        seen.add(val);
        skippedRowNumbers.push(val);
      }
    }
  }

  return { entityResolutions, skippedRowNumbers };
}

const IDEMPOTENCY_KEY_REGEX = /^[a-zA-Z0-9._:-]{8,128}$/;

export function sanitizeIdempotencyKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!IDEMPOTENCY_KEY_REGEX.test(trimmed)) return null;
  return trimmed;
}

export function sanitizeSourceFilename(raw: unknown): string {
  if (typeof raw !== "string") return "registration-import";
  const base = raw
    .trim()
    .replace(/[/\\]/g, "_")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .slice(0, 255);
  return base.length > 0 ? base : "registration-import";
}

export function sanitizeFileFormat(raw: unknown): ImportFileFormat | null {
  if (typeof raw !== "string") return null;
  const norm = raw.trim().toLowerCase();
  if (norm === "csv" || norm === "xlsx") return norm;
  return null;
}

export function sanitizeImportRpcError(
  rawMessage: string,
  code?: string | null,
): { status: number; message: string; missingMigration?: boolean } {
  const msg = rawMessage.trim();
  const lower = msg.toLowerCase();

  if (
    code === "PGRST202" ||
    code === "42883" ||
    code === "42P01" ||
    lower.includes("could not find the function") ||
    (lower.includes("registration_imports") && lower.includes("does not exist")) ||
    (lower.includes("execute_registration_import") && lower.includes("does not exist"))
  ) {
    return {
      status: 503,
      missingMigration: true,
      message:
        "Stage 2B.2 database migration (0004) has not been applied yet. Apply supabase/migrations/202611170004_stage2b2_registration_imports.sql before executing imports.",
    };
  }

  if (lower.includes("active organiser privileges required")) {
    return {
      status: 403,
      message: "Active organiser permissions are required to execute imports.",
    };
  }

  if (lower.includes("idempotency key was already used")) {
    return {
      status: 409,
      message:
        "This import confirmation token was already used for a different set of changes. Re-run validation or confirm again to generate a fresh import request.",
    };
  }

  if (lower.includes("archived event")) {
    return {
      status: 400,
      message: "Registrations cannot be imported into an archived event.",
    };
  }

  if (
    lower.includes("already exists") ||
    lower.includes("concurrent update") ||
    code === "23505"
  ) {
    return {
      status: 409,
      message:
        "A conflicting record already exists or was updated concurrently in the CMS. Re-run validation to inspect the latest database state; no partial changes were saved.",
    };
  }

  if (
    lower.includes("accepts contingent entries only") ||
    lower.includes("accepts individual participant entries only") ||
    lower.includes("must exist and be active") ||
    lower.includes("cannot be contingent lead") ||
    lower.includes("could not be resolved") ||
    lower.includes("approved field list") ||
    lower.includes("unsupported") ||
    code === "23514" ||
    code === "23503"
  ) {
    return {
      status: 400,
      message:
        "Import data failed Stage 2A database integrity checks and the entire batch was rolled back cleanly. Re-run validation and resolve flagged rows.",
    };
  }

  return {
    status: 500,
    message:
      "Import execution failed and the database transaction was rolled back cleanly. No records were created or modified.",
  };
}
