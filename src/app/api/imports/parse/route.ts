import { NextRequest, NextResponse } from "next/server";
import {
  OrganiserAuthError,
  requireActiveUserForAction,
} from "@/lib/auth/guards";
import { ALL_ORGANISER_ROLES } from "@/lib/auth/policy";
import {
  MAX_IMPORT_FILE_BYTES,
  parseRegistrationFileBuffer,
} from "@/lib/imports/parser";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await requireActiveUserForAction(ALL_ORGANISER_ROLES, {
      actionName: "import.parse_file",
    });

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "Expected a multipart/form-data upload containing a CSV or .xlsx file.",
        },
        { status: 400 },
      );
    }

    const uploaded = formData.get("file");
    if (!uploaded || typeof uploaded === "string") {
      return NextResponse.json(
        { ok: false, error: "Select a CSV or Excel (.xlsx) file to upload." },
        { status: 400 },
      );
    }

    if (uploaded.size > MAX_IMPORT_FILE_BYTES) {
      const maxMb = (MAX_IMPORT_FILE_BYTES / (1024 * 1024)).toFixed(0);
      return NextResponse.json(
        {
          ok: false,
          error: `File exceeds the ${maxMb} MB safety limit. Split the export into smaller files and retry.`,
        },
        { status: 400 },
      );
    }

    const requestedSheetRaw = formData.get("sheetName");
    const requestedSheetName =
      typeof requestedSheetRaw === "string" && requestedSheetRaw.trim()
        ? requestedSheetRaw.trim()
        : null;

    const arrayBuffer = await uploaded.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const parsed = await parseRegistrationFileBuffer({
      fileName: uploaded.name,
      mimeType: uploaded.type,
      buffer,
      requestedSheetName,
    });

    if (!parsed.ok) {
      return NextResponse.json(
        { ok: false, error: parsed.error },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      workbook: parsed.workbook,
    });
  } catch (err) {
    if (err instanceof OrganiserAuthError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Unexpected server error while reading the uploaded file." },
      { status: 500 },
    );
  }
}
