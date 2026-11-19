import { inflateRawSync } from "node:zlib";

export interface ParsedExcelResult {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
}

interface ZipEntry {
  fileName: string;
  compressionMethod: number;
  compressedData: Buffer;
  uncompressedSize: number;
}

/**
 * Parses Central Directory from a ZIP buffer to extract files.
 * Handles both standard and data-descriptor ZIPs.
 */
function extractZipEntries(buffer: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();

  // Find End of Central Directory Record (EOCD): signature 0x06054b50
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (
      buffer[i] === 0x50 &&
      buffer[i + 1] === 0x4b &&
      buffer[i + 2] === 0x05 &&
      buffer[i + 3] === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    // Try simple local header scanning if EOCD not found
    return extractZipLocalHeaders(buffer);
  }

  const cdTotalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);

  let currentCdOffset = cdOffset;
  for (let entryIdx = 0; entryIdx < cdTotalEntries; entryIdx++) {
    if (
      currentCdOffset + 46 > buffer.length ||
      buffer.readUInt32LE(currentCdOffset) !== 0x02014b50
    ) {
      break;
    }

    const compressionMethod = buffer.readUInt16LE(currentCdOffset + 10);
    const compressedSize = buffer.readUInt32LE(currentCdOffset + 20);
    const uncompressedSize = buffer.readUInt32LE(currentCdOffset + 24);
    const fileNameLength = buffer.readUInt16LE(currentCdOffset + 28);
    const extraFieldLength = buffer.readUInt16LE(currentCdOffset + 30);
    const fileCommentLength = buffer.readUInt16LE(currentCdOffset + 32);
    const localHeaderOffset = buffer.readUInt32LE(currentCdOffset + 42);

    const fileName = buffer.toString(
      "utf8",
      currentCdOffset + 46,
      currentCdOffset + 46 + fileNameLength,
    );

    // Read local header to get data offset
    if (
      localHeaderOffset + 30 <= buffer.length &&
      buffer.readUInt32LE(localHeaderOffset) === 0x04034b50
    ) {
      const localFileNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localFileNameLen + localExtraLen;

      if (dataOffset + compressedSize <= buffer.length) {
        const compressedSlice = buffer.subarray(
          dataOffset,
          dataOffset + compressedSize,
        );

        let fileBuffer: Buffer;
        if (compressionMethod === 0) {
          fileBuffer = Buffer.from(compressedSlice);
        } else if (compressionMethod === 8) {
          try {
            fileBuffer = inflateRawSync(compressedSlice);
          } catch {
            fileBuffer = Buffer.alloc(0);
          }
        } else {
          fileBuffer = Buffer.alloc(0);
        }

        if (fileBuffer.length > 0) {
          entries.set(fileName.replace(/\\/g, "/"), fileBuffer);
        }
      }
    }

    currentCdOffset +=
      46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  return entries;
}

function extractZipLocalHeaders(buffer: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  let offset = 0;

  while (offset + 30 <= buffer.length) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) {
      break;
    }

    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);

    const fileName = buffer.toString(
      "utf8",
      offset + 30,
      offset + 30 + fileNameLength,
    );
    const dataOffset = offset + 30 + fileNameLength + extraLength;

    if (compressedSize > 0 && dataOffset + compressedSize <= buffer.length) {
      const compressedData = buffer.subarray(
        dataOffset,
        dataOffset + compressedSize,
      );
      try {
        let decompressed: Buffer;
        if (compressionMethod === 0) {
          decompressed = Buffer.from(compressedData);
        } else if (compressionMethod === 8) {
          decompressed = inflateRawSync(compressedData);
        } else {
          decompressed = Buffer.alloc(0);
        }
        if (decompressed.length > 0) {
          entries.set(fileName.replace(/\\/g, "/"), decompressed);
        }
      } catch {
        // Skip unreadable entry
      }
      offset = dataOffset + compressedSize;
    } else {
      offset = dataOffset;
    }
  }

  return entries;
}

function columnLetterToIndex(colStr: string): number {
  let index = 0;
  for (let i = 0; i < colStr.length; i++) {
    index = index * 26 + (colStr.charCodeAt(i) - 64);
  }
  return index - 1;
}

/**
 * Decodes XML entities into standard characters.
 */
function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
      String.fromCharCode(parseInt(code, 16)),
    );
}

/**
 * Parses shared strings table from xl/sharedStrings.xml.
 */
function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/gi;
  let siMatch: RegExpExecArray | null;

  while ((siMatch = siRegex.exec(xml)) !== null) {
    const siContent = siMatch[1];
    // Gather all text inside <t> or <t ...> tags
    const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/gi;
    let tMatch: RegExpExecArray | null;
    let combinedText = "";

    while ((tMatch = tRegex.exec(siContent)) !== null) {
      combinedText += tMatch[1];
    }

    strings.push(decodeXmlEntities(combinedText));
  }

  return strings;
}

/**
 * Parses an Excel OpenXML worksheet into a 2D array of string cells.
 */
function parseSheetXml(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];
  const rowRegex = /<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(xml)) !== null) {
    const rowNum = parseInt(rowMatch[1], 10);
    const rowContent = rowMatch[2];
    const cells: string[] = [];

    const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/gi;
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      const cellAttrs = cellMatch[1];
      const cellBody = cellMatch[2];

      const rMatch = /\br="([A-Z]+)\d+"/i.exec(cellAttrs);
      const colLetters = rMatch ? rMatch[1].toUpperCase() : null;
      const colIdx = colLetters ? columnLetterToIndex(colLetters) : cells.length;

      const tMatch = /\bt="([a-zA-Z_]+)"/i.exec(cellAttrs);
      const cellType = tMatch ? tMatch[1] : null;

      let value = "";
      if (cellType === "s") {
        const vMatch = /<v>([\s\S]*?)<\/v>/i.exec(cellBody);
        if (vMatch) {
          const stringIndex = parseInt(vMatch[1].trim(), 10);
          value = sharedStrings[stringIndex] ?? "";
        }
      } else if (cellType === "inlineStr") {
        const isMatch = /<is>[\s\S]*?<t\b[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/i.exec(
          cellBody,
        );
        value = isMatch ? decodeXmlEntities(isMatch[1]) : "";
      } else if (cellType === "b") {
        const vMatch = /<v>([\s\S]*?)<\/v>/i.exec(cellBody);
        value = vMatch ? (vMatch[1].trim() === "1" ? "TRUE" : "FALSE") : "";
      } else {
        const vMatch = /<v>([\s\S]*?)<\/v>/i.exec(cellBody);
        value = vMatch ? decodeXmlEntities(vMatch[1].trim()) : "";
      }

      while (cells.length < colIdx) {
        cells.push("");
      }
      cells[colIdx] = value.trim();
    }

    if (cells.some((c) => c.length > 0)) {
      while (rows.length < rowNum - 1) {
        rows.push([]);
      }
      rows.push(cells);
    }
  }

  return rows.filter((r) => r.length > 0);
}

/**
 * Handles legacy XML Spreadsheet 2003 (files starting with <?xml containing <Workbook>).
 */
function parseXmlSpreadsheet2003(xml: string): ParsedExcelResult {
  const rowRegex = /<Row\b[^>]*>([\s\S]*?)<\/Row>/gi;
  const rawRows: string[][] = [];
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(xml)) !== null) {
    const rowContent = rowMatch[1];
    const cells: string[] = [];
    const cellRegex = /<Cell\b[^>]*>[\s\S]*?<Data\b[^>]*>([\s\S]*?)<\/Data>[\s\S]*?<\/Cell>/gi;
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      cells.push(decodeXmlEntities(cellMatch[1].trim()));
    }

    if (cells.some((c) => c.length > 0)) {
      rawRows.push(cells);
    }
  }

  if (rawRows.length === 0) {
    return { headers: [], rows: [], totalRows: 0 };
  }

  const headers = rawRows[0].map((h, i) => h || `Column_${i + 1}`);
  const rows: Record<string, string>[] = [];

  for (let r = 1; r < rawRows.length; r++) {
    const rowVals = rawRows[r];
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = c < rowVals.length ? rowVals[c] : "";
    }
    rows.push(obj);
  }

  return { headers, rows, totalRows: rows.length };
}

/**
 * Main entry point: Parses an Excel buffer (.xlsx or XML spreadsheet).
 */
export function parseExcel(buffer: Buffer): ParsedExcelResult {
  if (!buffer || buffer.length === 0) {
    return { headers: [], rows: [], totalRows: 0 };
  }

  // Check if XML Spreadsheet 2003
  const preamble = buffer.subarray(0, 100).toString("utf8");
  if (preamble.includes("<?xml") && preamble.includes("Workbook")) {
    return parseXmlSpreadsheet2003(buffer.toString("utf8"));
  }

  // OpenXML XLSX ZIP extraction
  const entries = extractZipEntries(buffer);
  if (entries.size === 0) {
    throw new Error(
      "The uploaded file is not a valid Excel (.xlsx) file or is corrupted.",
    );
  }

  // Find shared strings
  let sharedStrings: string[] = [];
  for (const [name, buf] of entries.entries()) {
    if (name.toLowerCase().endsWith("sharedstrings.xml")) {
      sharedStrings = parseSharedStrings(buf.toString("utf8"));
      break;
    }
  }

  // Find first worksheet
  let sheetXml = "";
  for (const [name, buf] of entries.entries()) {
    if (
      name.toLowerCase().includes("worksheets/sheet") &&
      name.toLowerCase().endsWith(".xml")
    ) {
      sheetXml = buf.toString("utf8");
      break;
    }
  }

  if (!sheetXml) {
    throw new Error("No worksheet data found in the Excel workbook.");
  }

  const rawRows = parseSheetXml(sheetXml, sharedStrings);
  if (rawRows.length === 0) {
    return { headers: [], rows: [], totalRows: 0 };
  }

  const rawHeaders = rawRows[0];
  const headers = rawHeaders.map((h, idx) => {
    const trimmed = h.trim();
    return trimmed.length > 0 ? trimmed : `Column_${idx + 1}`;
  });

  const rows: Record<string, string>[] = [];
  for (let r = 1; r < rawRows.length; r++) {
    const rowVals = rawRows[r];
    const rowObj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const header = headers[c];
      rowObj[header] = c < rowVals.length ? (rowVals[c] ?? "") : "";
    }
    rows.push(rowObj);
  }

  return {
    headers,
    rows,
    totalRows: rows.length,
  };
}
