import readXlsxFile from "read-excel-file/node";
import type {
  DetectedColumn,
  ImportFileFormat,
  ParsedDataRow,
  ParsedImportSheet,
  ParsedImportWorkbook,
} from "@/types/imports";

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_COLUMNS = 100;

const ALLOWED_CSV_MIME_TYPES = new Set([
  "",
  "text/csv",
  "application/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/octet-stream",
]);

const ALLOWED_XLSX_MIME_TYPES = new Set([
  "",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
  "application/zip",
]);

const DISALLOWED_MACRO_MIME_HINTS = [
  "macroenabled",
  "ms-excel.sheet.macro",
  "x-msdownload",
  "javascript",
  "text/html",
];

export type ParseUploadResult =
  | { ok: true; workbook: ParsedImportWorkbook }
  | { ok: false; error: string };

export function validateImportUploadMeta(params: {
  fileName: string;
  mimeType: string;
  byteLength: number;
}): { ok: true; format: ImportFileFormat } | { ok: false; error: string } {
  const cleanName = params.fileName.trim();
  if (!cleanName) {
    return { ok: false, error: "Select a CSV or Excel (.xlsx) file to upload." };
  }

  const lowerName = cleanName.toLowerCase();
  const dotIdx = lowerName.lastIndexOf(".");
  const ext = dotIdx >= 0 ? lowerName.slice(dotIdx) : "";

  if (ext !== ".csv" && ext !== ".xlsx") {
    if (ext === ".xlsm" || ext === ".xlsb" || ext === ".xls") {
      return {
        ok: false,
        error: `Unsupported Excel format "${ext}". Export the spreadsheet as a standard macro-free .xlsx or .csv file.`,
      };
    }
    return {
      ok: false,
      error: `Unsupported file type "${ext || "unknown"}". Only .csv and .xlsx files are accepted.`,
    };
  }

  if (!Number.isFinite(params.byteLength) || params.byteLength <= 0) {
    return { ok: false, error: "The uploaded file is empty (0 bytes)." };
  }

  if (params.byteLength > MAX_IMPORT_FILE_BYTES) {
    const maxMb = (MAX_IMPORT_FILE_BYTES / (1024 * 1024)).toFixed(0);
    return {
      ok: false,
      error: `File exceeds the ${maxMb} MB safety limit. Split the export into smaller batches and retry.`,
    };
  }

  const normalizedMime = params.mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (
    DISALLOWED_MACRO_MIME_HINTS.some((hint) => normalizedMime.includes(hint))
  ) {
    return {
      ok: false,
      error: "Macro-enabled or executable files are not permitted.",
    };
  }

  const format: ImportFileFormat = ext === ".csv" ? "csv" : "xlsx";
  if (format === "csv" && !ALLOWED_CSV_MIME_TYPES.has(normalizedMime)) {
    return {
      ok: false,
      error: `Unexpected MIME type "${normalizedMime}" for a .csv file.`,
    };
  }

  if (format === "xlsx" && !ALLOWED_XLSX_MIME_TYPES.has(normalizedMime)) {
    return {
      ok: false,
      error: `Unexpected MIME type "${normalizedMime}" for a .xlsx file.`,
    };
  }

  return { ok: true, format };
}

/**
 * Strict RFC-4180 CSV parser handling UTF-8 BOM, CRLF/LF/CR, quoted fields,
 * escaped doubled quotes (""), multiline quoted values, and unclosed quote errors.
 */
export function parseCsvBuffer(
  buffer: Buffer,
): { ok: true; matrix: string[][] } | { ok: false; error: string } {
  if (buffer.includes(0x00)) {
    return {
      ok: false,
      error:
        "The .csv file contains binary NUL bytes and does not appear to be valid UTF-8 CSV text.",
    };
  }

  let text = buffer.toString("utf8");
  if (text.startsWith("\uFEFF")) {
    text = text.slice(1);
  }

  if (text.trim().length === 0) {
    return { ok: false, error: "The uploaded CSV file is empty." };
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let fieldStarted = false;
  let justClosedQuote = false;
  let lineNumber = 1;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          currentField += '"';
          i += 1;
        } else {
          inQuotes = false;
          justClosedQuote = true;
        }
      } else {
        if (ch === "\n") {
          lineNumber += 1;
        }
        currentField += ch;
      }
      continue;
    }

    if (justClosedQuote) {
      if (ch === ",") {
        currentRow.push(currentField);
        currentField = "";
        fieldStarted = false;
        justClosedQuote = false;
        continue;
      }
      if (ch === "\r" || ch === "\n") {
        if (ch === "\r" && text[i + 1] === "\n") {
          i += 1;
        }
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
        fieldStarted = false;
        justClosedQuote = false;
        lineNumber += 1;
        continue;
      }
      if (ch === " " || ch === "\t") {
        continue;
      }
      return {
        ok: false,
        error: `Malformed CSV near line ${lineNumber}: unexpected character "${ch}" after closing quote.`,
      };
    }

    if (ch === '"' && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
      continue;
    }

    if (ch === '"') {
      return {
        ok: false,
        error: `Malformed CSV near line ${lineNumber}: unescaped quotation mark inside an unquoted field.`,
      };
    }

    if (ch === ",") {
      currentRow.push(currentField);
      currentField = "";
      fieldStarted = false;
      continue;
    }

    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") {
        i += 1;
      }
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = "";
      fieldStarted = false;
      lineNumber += 1;
      continue;
    }

    currentField += ch;
    fieldStarted = true;
  }

  if (inQuotes) {
    return {
      ok: false,
      error: `Malformed CSV: unclosed quotation mark starting before line ${lineNumber}.`,
    };
  }

  if (fieldStarted || justClosedQuote || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return { ok: true, matrix: rows };
}

function normalizeSpreadsheetCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  return String(value).trim();
}

export function buildParsedSheetFromMatrix(
  sheetName: string,
  rawMatrix: unknown[][],
): { ok: true; sheet: ParsedImportSheet } | { ok: false; error: string } {
  const stringMatrix = rawMatrix.map((row) =>
    row.map((cell) => normalizeSpreadsheetCell(cell)),
  );

  const headerRowIdx = stringMatrix.findIndex((row) =>
    row.some((cell) => cell.length > 0),
  );

  if (headerRowIdx === -1) {
    return {
      ok: false,
      error: `Sheet "${sheetName}" contains no header row or registration data.`,
    };
  }

  const headerCells = stringMatrix[headerRowIdx] ?? [];
  let maxColumnCount = headerCells.length;
  for (let i = headerRowIdx + 1; i < stringMatrix.length; i += 1) {
    const row = stringMatrix[i] ?? [];
    for (let c = row.length - 1; c >= 0; c -= 1) {
      if (row[c] !== "") {
        if (c + 1 > maxColumnCount) {
          maxColumnCount = c + 1;
        }
        break;
      }
    }
  }

  // Trim trailing completely empty columns from header row if no data exists in them
  let effectiveColumnCount = 0;
  for (let c = 0; c < maxColumnCount; c += 1) {
    const hasHeader = (headerCells[c] ?? "").length > 0;
    let hasData = false;
    for (let r = headerRowIdx + 1; r < stringMatrix.length; r += 1) {
      if ((stringMatrix[r]?.[c] ?? "").length > 0) {
        hasData = true;
        break;
      }
    }
    if (hasHeader || hasData) {
      effectiveColumnCount = c + 1;
    }
  }

  if (effectiveColumnCount === 0) {
    return {
      ok: false,
      error: `Sheet "${sheetName}" has no usable columns.`,
    };
  }

  if (effectiveColumnCount > MAX_IMPORT_COLUMNS) {
    return {
      ok: false,
      error: `Detected ${effectiveColumnCount} columns, exceeding the ${MAX_IMPORT_COLUMNS}-column safety limit.`,
    };
  }

  const rawHeaderNames: string[] = [];
  const headerCounts = new Map<string, number>();
  for (let c = 0; c < effectiveColumnCount; c += 1) {
    const rawText = (headerCells[c] ?? "").replace(/\s+/g, " ").trim();
    const headerName = rawText.length > 0 ? rawText : `Untitled Column ${c + 1}`;
    rawHeaderNames.push(headerName);
    const norm = headerName.toLowerCase();
    headerCounts.set(norm, (headerCounts.get(norm) ?? 0) + 1);
  }

  const rows: ParsedDataRow[] = [];
  let skippedEmptyRowCount = 0;

  for (let r = headerRowIdx + 1; r < stringMatrix.length; r += 1) {
    const rawRow = stringMatrix[r] ?? [];
    const normalizedRow: string[] = [];
    let rowHasValue = false;

    for (let c = 0; c < effectiveColumnCount; c += 1) {
      const val = (rawRow[c] ?? "").trim();
      if (val.length > 0) {
        rowHasValue = true;
      }
      normalizedRow.push(val);
    }

    if (!rowHasValue) {
      skippedEmptyRowCount += 1;
      continue;
    }

    rows.push({
      rowNumber: r + 1,
      cells: normalizedRow,
    });

    if (rows.length > MAX_IMPORT_ROWS) {
      return {
        ok: false,
        error: `Sheet "${sheetName}" contains more than ${MAX_IMPORT_ROWS} non-empty rows. Split the export into smaller files.`,
      };
    }
  }

  if (rows.length === 0) {
    return {
      ok: false,
      error: `Sheet "${sheetName}" contains column headings only and has 0 non-empty data rows.`,
    };
  }

  const seenCounts = new Map<string, number>();
  const duplicateHeaderWarnings: string[] = [];
  const warnedDuplicateNorms = new Set<string>();

  const columns: DetectedColumn[] = rawHeaderNames.map((headerName, index) => {
    const norm = headerName.toLowerCase();
    const total = headerCounts.get(norm) ?? 1;
    const occurrence = (seenCounts.get(norm) ?? 0) + 1;
    seenCounts.set(norm, occurrence);

    const isDuplicateHeader = total > 1;
    if (isDuplicateHeader && !warnedDuplicateNorms.has(norm)) {
      warnedDuplicateNorms.add(norm);
      duplicateHeaderWarnings.push(
        `Duplicate column heading "${headerName}" detected (${total} columns). Both columns are preserved separately so you can map the intended column.`,
      );
    }

    let nonEmptyCount = 0;
    const sampleValues: string[] = [];
    for (const row of rows) {
      const val = row.cells[index] ?? "";
      if (val.length > 0) {
        nonEmptyCount += 1;
        if (sampleValues.length < 3 && !sampleValues.includes(val)) {
          sampleValues.push(val);
        }
      }
    }

    return {
      key: `col_${index}`,
      index,
      headerName,
      displayLabel: isDuplicateHeader
        ? `${headerName} (Col ${index + 1} · ${occurrence}/${total})`
        : headerName,
      isDuplicateHeader,
      duplicateOccurrence: occurrence,
      duplicateTotal: total,
      nonEmptyCount,
      sampleValues,
    };
  });

  const warnings: string[] = [...duplicateHeaderWarnings];
  if (skippedEmptyRowCount > 0) {
    warnings.push(
      `Skipped ${skippedEmptyRowCount} blank ${skippedEmptyRowCount === 1 ? "row" : "rows"} while preserving original spreadsheet row numbers.`,
    );
  }
  if (headerRowIdx > 0) {
    warnings.push(
      `Detected header row on spreadsheet line ${headerRowIdx + 1} (skipped ${headerRowIdx} leading blank ${headerRowIdx === 1 ? "line" : "lines"}).`,
    );
  }

  return {
    ok: true,
    sheet: {
      sheetName,
      columns,
      rows,
      totalRawRows: stringMatrix.length - (headerRowIdx + 1),
      skippedEmptyRowCount,
      warnings,
    },
  };
}

function hasZipSignature(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    ((buffer[2] === 0x03 && buffer[3] === 0x04) ||
      (buffer[2] === 0x05 && buffer[3] === 0x06))
  );
}

function containsMacroPayload(buffer: Buffer): boolean {
  // .xlsm files (or .xlsm renamed to .xlsx) embed xl/vbaProject.bin in the ZIP archive.
  return buffer.toString("latin1").toLowerCase().includes("vbaproject.bin");
}

export async function parseRegistrationFileBuffer(params: {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  requestedSheetName?: string | null;
}): Promise<ParseUploadResult> {
  const metaCheck = validateImportUploadMeta({
    fileName: params.fileName,
    mimeType: params.mimeType,
    byteLength: params.buffer.length,
  });

  if (!metaCheck.ok) {
    return metaCheck;
  }

  if (metaCheck.format === "csv") {
    const csvParsed = parseCsvBuffer(params.buffer);
    if (!csvParsed.ok) return csvParsed;

    const sheetResult = buildParsedSheetFromMatrix("CSV Data", csvParsed.matrix);
    if (!sheetResult.ok) return sheetResult;

    return {
      ok: true,
      workbook: {
        fileName: params.fileName.trim(),
        fileFormat: "csv",
        fileSizeBytes: params.buffer.length,
        sheetNames: ["CSV Data"],
        selectedSheetName: "CSV Data",
        sheet: sheetResult.sheet,
      },
    };
  }

  if (!hasZipSignature(params.buffer)) {
    return {
      ok: false,
      error:
        "The uploaded .xlsx file is malformed or corrupted (missing standard OpenXML ZIP header).",
    };
  }

  if (containsMacroPayload(params.buffer)) {
    return {
      ok: false,
      error:
        "This workbook contains embedded VBA macros (vbaProject.bin). Macro-enabled workbooks are blocked; save as a clean macro-free .xlsx or .csv file.",
    };
  }

  try {
    const sheets = await readXlsxFile(params.buffer);
    if (!sheets || sheets.length === 0) {
      return {
        ok: false,
        error: "The uploaded .xlsx workbook does not contain any worksheets.",
      };
    }

    const sheetNames = sheets.map((s) => s.sheet);
    let targetSheet = sheets[0];

    if (params.requestedSheetName?.trim()) {
      const match = sheets.find(
        (s) => s.sheet === params.requestedSheetName?.trim(),
      );
      if (!match) {
        return {
          ok: false,
          error: `Worksheet "${params.requestedSheetName}" was not found in the workbook.`,
        };
      }
      targetSheet = match;
    } else {
      const firstNonEmpty = sheets.find((s) =>
        s.data.some((row) => row.some((cell) => normalizeSpreadsheetCell(cell) !== "")),
      );
      if (firstNonEmpty) {
        targetSheet = firstNonEmpty;
      }
    }

    const sheetResult = buildParsedSheetFromMatrix(
      targetSheet.sheet,
      targetSheet.data,
    );
    if (!sheetResult.ok) return sheetResult;

    return {
      ok: true,
      workbook: {
        fileName: params.fileName.trim(),
        fileFormat: "xlsx",
        fileSizeBytes: params.buffer.length,
        sheetNames,
        selectedSheetName: targetSheet.sheet,
        sheet: sheetResult.sheet,
      },
    };
  } catch (err) {
    const detail =
      err instanceof Error && err.message
        ? err.message
        : "Unable to read the .xlsx spreadsheet.";
    return {
      ok: false,
      error: `Malformed .xlsx workbook: ${detail}`,
    };
  }
}
