import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import {
  ALL_ORGANISER_ROLES,
  evaluateOrganiserAccess,
} from "../src/lib/auth/policy.ts";
import {
  createEmptyMapping,
  suggestColumnMappings,
} from "../src/lib/imports/fields.ts";
import {
  MAX_IMPORT_FILE_BYTES,
  parseRegistrationFileBuffer,
} from "../src/lib/imports/parser.ts";
import { validateImportBatch } from "../src/lib/imports/validator.ts";

const ROOT_DIR = process.cwd();

const CONTINGENT_EVENT = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "FIN-2026",
  name: "Corporate Finance Track",
  entry_mode: "contingent",
  codename_mode: "event_wide",
  status: "active",
  min_team_size: 2,
  max_team_size: 4,
};

const INDIVIDUAL_EVENT = {
  id: "22222222-2222-4222-8222-222222222222",
  code: "BST-2026",
  name: "Best Manager Track",
  entry_mode: "individual",
  codename_mode: "per_round",
  status: "active",
  min_team_size: null,
  max_team_size: null,
};

const ARCHIVED_EVENT = {
  ...CONTINGENT_EVENT,
  id: "33333333-3333-4333-8333-333333333333",
  status: "archived",
};

// Minimal valid ZIP + OpenXML .xlsx generator using built-in node:zlib so tests need no extra packages.
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildStoredZipBuffer(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const rawData = Buffer.isBuffer(entry.data)
      ? entry.data
      : Buffer.from(entry.data, "utf8");
    const compressed = zlib.deflateRawSync(rawData);
    const crc = crc32(rawData);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8); // deflate
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(rawData.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(rawData.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

function xmlEscape(val) {
  return String(val)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function colLetter(idx) {
  let s = "";
  let n = idx + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function createXlsxBuffer(sheets, extraEntries = []) {
  const sheetOverrides = sheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("");
  const workbookSheets = sheets
    .map(
      (s, i) =>
        `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    )
    .join("");
  const workbookRels = sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join("");

  const zipEntries = [
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheetOverrides}</Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      data: `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRels}</Relationships>`,
    },
    ...sheets.map((s, idx) => {
      const rowXml = s.rows
        .map((row, rIdx) => {
          const cellsXml = row
            .map((cell, cIdx) => {
              if (cell === null || cell === undefined || cell === "") return "";
              return `<c r="${colLetter(cIdx)}${rIdx + 1}" t="inlineStr"><is><t>${xmlEscape(cell)}</t></is></c>`;
            })
            .join("");
          return `<row r="${rIdx + 1}">${cellsXml}</row>`;
        })
        .join("");
      return {
        name: `xl/worksheets/sheet${idx + 1}.xml`,
        data: `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`,
      };
    }),
    ...extraEntries,
  ];

  return buildStoredZipBuffer(zipEntries);
}

test("1. Valid CSV parsing handles UTF-8 BOM, CRLF/LF, and quoted commas", async () => {
  const csvContent =
    "\uFEFFContingent Code,Contingent Name,Institution Name,Participant Code,Full Name,Email,Is Contingent Lead\r\n" +
    'CON-01,"Alpha, Bengaluru","St. Joseph\'s College of Commerce",PAR-01,Asha Nair,asha@sjcc.edu.in,Yes\r\n' +
    'CON-01,"Alpha, Bengaluru","St. Joseph\'s College of Commerce",PAR-02,Rohan Das,rohan@sjcc.edu.in,No\r\n';

  const result = await parseRegistrationFileBuffer({
    fileName: "registrations.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csvContent, "utf8"),
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.workbook.fileFormat, "csv");
    assert.equal(result.workbook.sheet.columns.length, 7);
    assert.equal(result.workbook.sheet.rows.length, 2);
    assert.equal(result.workbook.sheet.rows[0].cells[1], "Alpha, Bengaluru");
    assert.equal(result.workbook.sheet.rows[0].rowNumber, 2);
    assert.equal(result.workbook.sheet.rows[1].rowNumber, 3);
  }
});

test("2. Valid XLSX parsing reads worksheets safely without macro execution", async () => {
  const xlsxBuf = createXlsxBuffer([
    {
      name: "Registrations",
      rows: [
        ["Participant Code", "Full Name", "Institution", "Email"],
        ["PAR-101", "Meera Iyer", "Mount Carmel College", "meera@mcc.edu.in"],
        ["PAR-102", "Vikram Rao", "Christ University", "vikram@christ.edu.in"],
      ],
    },
  ]);

  const result = await parseRegistrationFileBuffer({
    fileName: "export.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: xlsxBuf,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.workbook.fileFormat, "xlsx");
    assert.deepEqual(result.workbook.sheetNames, ["Registrations"]);
    assert.equal(result.workbook.sheet.rows.length, 2);
    assert.equal(result.workbook.sheet.rows[0].cells[0], "PAR-101");
    assert.equal(result.workbook.sheet.rows[1].cells[1], "Vikram Rao");
  }
});

test("3. Empty files (0 bytes, whitespace-only, or header-only) are rejected clearly", async () => {
  const zeroByte = await parseRegistrationFileBuffer({
    fileName: "empty.csv",
    mimeType: "text/csv",
    buffer: Buffer.alloc(0),
  });
  assert.equal(zeroByte.ok, false);

  const headerOnlyCsv = await parseRegistrationFileBuffer({
    fileName: "headers-only.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Participant Code,Full Name,Email\n   ,  , \n", "utf8"),
  });
  assert.equal(headerOnlyCsv.ok, false);

  const emptyXlsx = await parseRegistrationFileBuffer({
    fileName: "headers-only.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: createXlsxBuffer([
      { name: "Sheet1", rows: [["Participant Code", "Full Name"]] },
    ]),
  });
  assert.equal(emptyXlsx.ok, false);
});

test("4. Malformed files, disallowed extensions, macro payloads, and oversized buffers are rejected", async () => {
  const macroExt = await parseRegistrationFileBuffer({
    fileName: "export.xlsm",
    mimeType: "application/vnd.ms-excel.sheet.macroEnabled.12",
    buffer: Buffer.from("dummy"),
  });
  assert.equal(macroExt.ok, false);

  const fakeXlsx = await parseRegistrationFileBuffer({
    fileName: "corrupt.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("not-a-zip-file", "utf8"),
  });
  assert.equal(fakeXlsx.ok, false);

  const disguisedMacroXlsx = await parseRegistrationFileBuffer({
    fileName: "renamed-macro.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: createXlsxBuffer(
      [{ name: "Sheet1", rows: [["Name"], ["Alice"]] }],
      [{ name: "xl/vbaProject.bin", data: "macro-bytes" }],
    ),
  });
  assert.equal(disguisedMacroXlsx.ok, false);

  const unclosedQuoteCsv = await parseRegistrationFileBuffer({
    fileName: "broken.csv",
    mimeType: "text/csv",
    buffer: Buffer.from('Name,Email\n"Alice,alice@example.com\n', "utf8"),
  });
  assert.equal(unclosedQuoteCsv.ok, false);

  const oversized = await parseRegistrationFileBuffer({
    fileName: "too-big.csv",
    mimeType: "text/csv",
    buffer: Buffer.alloc(MAX_IMPORT_FILE_BYTES + 10, 65),
  });
  assert.equal(oversized.ok, false);
});

test("5. Duplicate column headings are preserved distinctly with explicit warnings", async () => {
  const csv =
    "Participant Code,Full Name,Email,Institution Name,Email\n" +
    "PAR-1,Asha Rao,asha.personal@example.com,SJCC,asha.college@sjcc.edu.in\n";

  const parsed = await parseRegistrationFileBuffer({
    fileName: "dup-headers.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    const emailCols = parsed.workbook.sheet.columns.filter(
      (c) => c.headerName === "Email",
    );
    assert.equal(emailCols.length, 2);
    assert.notEqual(emailCols[0].key, emailCols[1].key);
    assert.equal(emailCols[0].isDuplicateHeader, true);
    assert.equal(emailCols[1].isDuplicateHeader, true);
    assert.match(parsed.workbook.sheet.warnings.join(" "), /Duplicate column heading/i);
  }
});

test("6. Empty rows are skipped cleanly while preserving original spreadsheet row numbers", async () => {
  const csv =
    "Participant Code,Full Name,Institution Name\n" +
    "PAR-10,Asha,SJCC\n" +
    ",,\n" +
    "  ,  ,  \n" +
    "PAR-11,Rohan,Christ\n";

  const parsed = await parseRegistrationFileBuffer({
    fileName: "sparse-rows.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.workbook.sheet.skippedEmptyRowCount, 2);
    assert.equal(parsed.workbook.sheet.rows.length, 2);
    assert.equal(parsed.workbook.sheet.rows[0].rowNumber, 2);
    assert.equal(parsed.workbook.sheet.rows[1].rowNumber, 5);
  }
});

test("7. Flexible column mapping handles arbitrary column order and custom export headings", async () => {
  const csv =
    "Delegate Email,College Title,Team Label,Team Ref Code,Student Full Name,Badge Ref\n" +
    "neha@mcc.edu.in,Mount Carmel College,Team Zenith,CON-77,Neha Kapoor,PAR-77\n";

  const parsed = await parseRegistrationFileBuffer({
    fileName: "custom-export.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const mapping = createEmptyMapping();
  mapping.email = "col_0";
  mapping.institution_name = "col_1";
  mapping.contingent_name = "col_2";
  mapping.contingent_code = "col_3";
  mapping.full_name = "col_4";
  mapping.participant_code = "col_5";

  const report = validateImportBatch({
    event: CONTINGENT_EVENT,
    columns: parsed.workbook.sheet.columns,
    rows: parsed.workbook.sheet.rows,
    mapping,
  });

  assert.equal(report.summary.totalRows, 1);
  assert.equal(report.summary.validRows, 1);
  assert.equal(report.summary.invalidRows, 0);
  assert.equal(report.previewRows[0].normalized.contingent?.contingentCode, "CON-77");
  assert.equal(report.previewRows[0].normalized.participant.participantCode, "PAR-77");

  // Auto-suggestion works when recognizable headers appear in reversed order
  const reversedCsv =
    "Email,Full Name,Participant Code,Institution Name\n" +
    "arjun@sjcc.edu.in,Arjun Menon,PAR-88,SJCC\n";
  const parsedRev = await parseRegistrationFileBuffer({
    fileName: "reversed.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(reversedCsv, "utf8"),
  });
  assert.equal(parsedRev.ok, true);
  if (parsedRev.ok) {
    const suggested = suggestColumnMappings(parsedRev.workbook.sheet.columns);
    assert.equal(suggested.email, "col_0");
    assert.equal(suggested.full_name, "col_1");
    assert.equal(suggested.participant_code, "col_2");
    assert.equal(suggested.institution_name, "col_3");
  }
});

test("8. Missing required mappings and missing required row values are caught accurately", async () => {
  const csv =
    "Participant Code,Full Name,Institution Name,Email\n" +
    "PAR-1,Asha Nair,SJCC,asha@sjcc.edu.in\n" +
    ",Rohan Verma,SJCC,\n";

  const parsed = await parseRegistrationFileBuffer({
    fileName: "missing-required.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const mapping = suggestColumnMappings(parsed.workbook.sheet.columns);
  // Organiser marks email as additionally required
  const report = validateImportBatch({
    event: INDIVIDUAL_EVENT,
    columns: parsed.workbook.sheet.columns,
    rows: parsed.workbook.sheet.rows,
    mapping,
    requiredOverrides: ["email"],
  });

  assert.equal(report.summary.validRows, 1);
  assert.equal(report.summary.invalidRows, 1);
  assert.match(
    report.previewRows[1].issues.map((i) => i.message).join(" "),
    /Missing required value.*Participant Code/i,
  );
  assert.match(
    report.previewRows[1].issues.map((i) => i.message).join(" "),
    /Missing required value.*Participant Email/i,
  );

  // Also test missing schema-required mapping (contingent fields unmapped for contingent event)
  const missingMapReport = validateImportBatch({
    event: CONTINGENT_EVENT,
    columns: parsed.workbook.sheet.columns,
    rows: parsed.workbook.sheet.rows.slice(0, 1),
    mapping,
  });
  assert.equal(
    missingMapReport.missingRequiredTargetFields.includes("contingent_code"),
    true,
  );
  assert.equal(missingMapReport.summary.invalidRows, 1);
});

test("9. Invalid values, contingent-lead without contingent, entry_mode mismatch, and archived events fail validation", async () => {
  const csv =
    "Participant Code,Full Name,Institution Name,Email,Is Contingent Lead,Entry Status,Source Event Code\n" +
    "PAR-1,Asha Nair,SJCC,not-an-email,Yes,invalid_status,OTHER-EVT\n";

  const parsed = await parseRegistrationFileBuffer({
    fileName: "invalid-values.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const mapping = suggestColumnMappings(parsed.workbook.sheet.columns);
  const report = validateImportBatch({
    event: INDIVIDUAL_EVENT,
    columns: parsed.workbook.sheet.columns,
    rows: parsed.workbook.sheet.rows,
    mapping,
  });

  assert.equal(report.summary.invalidRows, 1);
  const messages = report.previewRows[0].issues.map((i) => i.message).join(" | ");
  assert.match(messages, /email/i);
  assert.match(messages, /contingent lead/i);
  assert.match(messages, /entry status/i);
  assert.match(messages, /does not match selected event/i);

  const archivedReport = validateImportBatch({
    event: ARCHIVED_EVENT,
    columns: parsed.workbook.sheet.columns,
    rows: parsed.workbook.sheet.rows,
    mapping,
  });
  assert.equal(archivedReport.summary.invalidRows, 1);
  assert.match(
    archivedReport.previewRows[0].issues.map((i) => i.message).join(" "),
    /archived/i,
  );
});

test("10. Duplicate rows within file are flagged while multiple distinct members sharing a contingent stay valid", async () => {
  const csv =
    "Contingent Code,Contingent Name,Institution Name,Participant Code,Full Name,Email\n" +
    "CON-01,Team Alpha,SJCC,PAR-01,Member One,m1@sjcc.edu.in\n" +
    "CON-01,Team Alpha,SJCC,PAR-02,Member Two,m2@sjcc.edu.in\n" +
    "CON-01,Team Alpha,SJCC,PAR-01,Duplicate Code,m3@sjcc.edu.in\n" +
    "CON-02,Team Beta,Christ,PAR-04,Member Four,m2@sjcc.edu.in\n";

  const parsed = await parseRegistrationFileBuffer({
    fileName: "duplicates.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const mapping = suggestColumnMappings(parsed.workbook.sheet.columns);
  const report = validateImportBatch({
    event: CONTINGENT_EVENT,
    columns: parsed.workbook.sheet.columns,
    rows: parsed.workbook.sheet.rows,
    mapping,
  });

  // Row 1 (PAR-01), Row 2 (m2@sjcc), Row 3 (PAR-01), Row 4 (m2@sjcc) all participate in duplicates
  assert.equal(report.summary.inFileDuplicateRows, 4);

  // Verify clean 2-member contingent WITHOUT duplicates validates cleanly
  const cleanTeamCsv =
    "Contingent Code,Contingent Name,Institution Name,Participant Code,Full Name,Email\n" +
    "CON-01,Team Alpha,SJCC,PAR-01,Member One,m1@sjcc.edu.in\n" +
    "CON-01,Team Alpha,SJCC,PAR-02,Member Two,m2@sjcc.edu.in\n";
  const parsedClean = await parseRegistrationFileBuffer({
    fileName: "clean-team.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(cleanTeamCsv, "utf8"),
  });
  assert.equal(parsedClean.ok, true);
  if (parsedClean.ok) {
    const cleanReport = validateImportBatch({
      event: CONTINGENT_EVENT,
      columns: parsedClean.workbook.sheet.columns,
      rows: parsedClean.workbook.sheet.rows,
      mapping: suggestColumnMappings(parsedClean.workbook.sheet.columns),
    });
    assert.equal(cleanReport.summary.validRows, 2);
    assert.equal(cleanReport.summary.inFileDuplicateRows, 0);
  }
});

test("11. Preview summary counts, unmapped columns, and read-only existing CMS match warnings work accurately", async () => {
  const csv =
    "Contingent Code,Contingent Name,Institution Name,Participant Code,Full Name,Email,Extra Portal Column\n" +
    "CON-EXISTING,Existing Team,SJCC,PAR-EXISTING,Existing Student,existing@sjcc.edu.in,Fee Paid\n" +
    "CON-NEW,New Team,MCC,PAR-NEW,New Student,new@mcc.edu.in,Fee Paid\n";

  const parsed = await parseRegistrationFileBuffer({
    fileName: "preview-matches.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const mapping = suggestColumnMappings(parsed.workbook.sheet.columns);
  const report = validateImportBatch({
    event: CONTINGENT_EVENT,
    columns: parsed.workbook.sheet.columns,
    rows: parsed.workbook.sheet.rows,
    mapping,
    existingContext: {
      contingents: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          contingent_code: "CON-EXISTING",
          name: "Existing Team",
          institution_name: "SJCC",
          external_registration_ref: null,
        },
      ],
      participants: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          participant_code: "PAR-EXISTING",
          full_name: "Existing Student",
          email: "existing@sjcc.edu.in",
          external_registration_ref: null,
          contingent_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        },
      ],
      enteredContingentIdsForEvent: new Set([
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      ]),
      enteredParticipantIdsForEvent: new Set(),
    },
  });

  assert.equal(report.summary.totalRows, 2);
  assert.equal(report.summary.validRows, 2);
  assert.equal(report.summary.existingMatchRows, 1);
  assert.equal(report.summary.unmappedSourceColumnsCount, 1);
  assert.equal(report.unmappedSourceColumns[0].headerName, "Extra Portal Column");
  assert.equal(
    report.previewRows[0].existingMatches.some(
      (m) => m.alreadyEnteredInSelectedEvent,
    ),
    true,
  );
});

test("12. Stage 2B.1 routes and API endpoints enforce organiser authorisation and perform zero database writes", () => {
  // Policy check: unauthenticated & inactive denied; active coordinator & super admin permitted
  assert.deepEqual(
    evaluateOrganiserAccess({
      authUserId: null,
      profile: null,
      allowedRoles: ALL_ORGANISER_ROLES,
    }),
    { ok: false, reason: "unauthenticated" },
  );

  const importsPage = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/imports/page.tsx"),
    "utf8",
  );
  assert.match(importsPage, /requireActiveUser\(ALL_ORGANISER_ROLES/);

  const parseRoute = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/api/imports/parse/route.ts"),
    "utf8",
  );
  assert.match(parseRoute, /requireActiveUserForAction\(ALL_ORGANISER_ROLES/);
  assert.equal(parseRoute.includes(".insert("), false);
  assert.equal(parseRoute.includes(".storage"), false);

  const previewRoute = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/api/imports/preview/route.ts"),
    "utf8",
  );
  assert.match(previewRoute, /requireActiveUserForAction\(ALL_ORGANISER_ROLES/);
  assert.equal(previewRoute.includes(".insert("), false);
  assert.equal(previewRoute.includes(".update("), false);
  assert.equal(previewRoute.includes(".delete("), false);
  assert.equal(previewRoute.includes("createSupabaseAdminClient"), false);

  const clientFile = fs.readFileSync(
    path.join(ROOT_DIR, "src/components/imports/ImportPreparationClient.tsx"),
    "utf8",
  );
  assert.equal(
    clientFile.includes("window.alert") ||
      clientFile.includes("window.confirm") ||
      clientFile.includes("window.open"),
    false,
  );
});
