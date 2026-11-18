/**
 * RFC 4180 compliant CSV parser for Virtuoso CMS registration imports.
 * Handles quoted fields, commas, escapes, multi-line values, and UTF-8 BOM.
 */

export interface ParsedCsvResult {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
}

export function parseCsv(text: string): ParsedCsvResult {
  // Strip UTF-8 BOM if present
  let input = text;
  if (input.charCodeAt(0) === 0xfeff) {
    input = input.slice(1);
  }

  const rawRows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let insideQuotes = false;
  let i = 0;
  const len = input.length;

  while (i < len) {
    const char = input[i];

    if (insideQuotes) {
      if (char === '"') {
        // Check for escaped quote: ""
        if (i + 1 < len && input[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          insideQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
        i++;
        continue;
      } else if (char === ",") {
        currentRow.push(currentField.trim());
        currentField = "";
        i++;
        continue;
      } else if (char === "\r") {
        // Handle CRLF or standalone CR
        if (i + 1 < len && input[i + 1] === "\n") {
          i++;
        }
        currentRow.push(currentField.trim());
        currentField = "";
        // Only push non-empty row
        if (currentRow.some((f) => f.length > 0)) {
          rawRows.push(currentRow);
        }
        currentRow = [];
        i++;
        continue;
      } else if (char === "\n") {
        currentRow.push(currentField.trim());
        currentField = "";
        if (currentRow.some((f) => f.length > 0)) {
          rawRows.push(currentRow);
        }
        currentRow = [];
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  // Final field & row if not empty
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      rawRows.push(currentRow);
    }
  }

  if (rawRows.length === 0) {
    return { headers: [], rows: [], totalRows: 0 };
  }

  // Header row
  const rawHeaders = rawRows[0];
  const headers = rawHeaders.map((h, idx) => {
    const trimmed = h.trim();
    return trimmed.length > 0 ? trimmed : `Column_${idx + 1}`;
  });

  const rows: Record<string, string>[] = [];
  for (let r = 1; r < rawRows.length; r++) {
    const rowValues = rawRows[r];
    const rowObj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const header = headers[c];
      rowObj[header] = c < rowValues.length ? rowValues[c] : "";
    }
    rows.push(rowObj);
  }

  return {
    headers,
    rows,
    totalRows: rows.length,
  };
}
