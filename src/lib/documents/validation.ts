import { validateUuid, type ValidationResult } from "@/lib/competition/validation";

export const COMPETITION_DOCUMENTS_BUCKET = "competition-documents";
export const MAX_COMPETITION_DOCUMENT_BYTES = 25 * 1024 * 1024; // 25 MiB
export const ALLOWED_COMPETITION_DOCUMENT_MIME = "application/pdf";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STRICT_STORAGE_PATH_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/;

const CONTROL_CHARS_REGEX = /[\u0000-\u001f\u007f]/;

export function validateDocumentTitle(
  rawTitle: string | null | undefined,
): ValidationResult<string> {
  const raw = rawTitle ?? "";
  if (CONTROL_CHARS_REGEX.test(raw)) {
    return {
      ok: false,
      error: "Document title contains invalid control characters.",
    };
  }

  const normalized = raw.trim().replace(/\s+/g, " ");
  if (normalized.length < 2 || normalized.length > 160) {
    return {
      ok: false,
      error: "Document title must be between 2 and 160 characters.",
    };
  }

  return { ok: true, value: normalized };
}

export function validateSafePdfFilename(
  rawFilename: string | null | undefined,
): ValidationResult<string> {
  const raw = rawFilename ?? "";
  if (CONTROL_CHARS_REGEX.test(raw)) {
    return {
      ok: false,
      error: "Filename contains invalid control characters.",
    };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Select a PDF file to upload." };
  }

  if (
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.includes("..") ||
    trimmed.startsWith(".")
  ) {
    return {
      ok: false,
      error:
        "Filename contains unsafe path characters. Rename the file and try again.",
    };
  }

  if (trimmed.length < 5 || trimmed.length > 255) {
    return {
      ok: false,
      error: "Filename must be between 5 and 255 characters.",
    };
  }

  if (!trimmed.toLowerCase().endsWith(".pdf")) {
    return {
      ok: false,
      error: "Only PDF files with a .pdf extension are allowed.",
    };
  }

  return { ok: true, value: trimmed };
}

export function validatePdfBufferHeader(
  bytes: Uint8Array | ArrayBuffer,
): ValidationResult<null> {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (view.byteLength < 5) {
    return {
      ok: false,
      error: "Uploaded file is too small to be a valid PDF document.",
    };
  }

  // Standard PDF header signature: %PDF- (0x25 0x50 0x44 0x46 0x2D)
  if (
    view[0] !== 0x25 ||
    view[1] !== 0x50 ||
    view[2] !== 0x44 ||
    view[3] !== 0x46 ||
    view[4] !== 0x2d
  ) {
    return {
      ok: false,
      error: "File contents do not match a valid PDF document signature.",
    };
  }

  return { ok: true, value: null };
}

export interface ValidatedPdfUpload {
  title: string;
  originalFilename: string;
  mimeType: typeof ALLOWED_COMPETITION_DOCUMENT_MIME;
  fileSizeBytes: number;
}

export function validatePdfUploadInput(raw: {
  title: string | null | undefined;
  fileName: string | null | undefined;
  mimeType: string | null | undefined;
  fileSizeBytes: number;
  headerBytes: Uint8Array | ArrayBuffer;
}): ValidationResult<ValidatedPdfUpload> {
  const titleCheck = validateDocumentTitle(raw.title);
  if (!titleCheck.ok) {
    return titleCheck;
  }

  const filenameCheck = validateSafePdfFilename(raw.fileName);
  if (!filenameCheck.ok) {
    return filenameCheck;
  }

  const normalizedMime = (raw.mimeType ?? "").trim().toLowerCase();
  if (normalizedMime !== ALLOWED_COMPETITION_DOCUMENT_MIME) {
    return {
      ok: false,
      error: "Only PDF files (application/pdf) are accepted.",
    };
  }

  if (
    !Number.isInteger(raw.fileSizeBytes) ||
    raw.fileSizeBytes <= 0
  ) {
    return {
      ok: false,
      error: "Uploaded PDF file cannot be empty.",
    };
  }

  if (raw.fileSizeBytes > MAX_COMPETITION_DOCUMENT_BYTES) {
    return {
      ok: false,
      error: "PDF file exceeds the maximum allowed size of 25 MB.",
    };
  }

  const headerCheck = validatePdfBufferHeader(raw.headerBytes);
  if (!headerCheck.ok) {
    return headerCheck;
  }

  return {
    ok: true,
    value: {
      title: titleCheck.value,
      originalFilename: filenameCheck.value,
      mimeType: ALLOWED_COMPETITION_DOCUMENT_MIME,
      fileSizeBytes: raw.fileSizeBytes,
    },
  };
}

export function buildCompetitionDocumentStoragePath(
  eventId: string,
  roundId: string,
  objectUuid: string,
): ValidationResult<string> {
  const eventCheck = validateUuid(eventId, "Event");
  if (!eventCheck.ok) return eventCheck;

  const roundCheck = validateUuid(roundId, "Round");
  if (!roundCheck.ok) return roundCheck;

  const objTrimmed = objectUuid.trim().toLowerCase();
  if (!UUID_REGEX.test(objTrimmed)) {
    return { ok: false, error: "Storage object identifier is invalid." };
  }

  return {
    ok: true,
    value: `${eventCheck.value.toLowerCase()}/${roundCheck.value.toLowerCase()}/${objTrimmed}.pdf`,
  };
}

export function isSafeCompetitionDocumentStoragePath(
  objectPath: string | null | undefined,
  expectedEventId: string,
  expectedRoundId: string,
): boolean {
  if (!objectPath) return false;
  const trimmed = objectPath.trim();
  if (
    trimmed !== objectPath ||
    trimmed.startsWith("/") ||
    trimmed.includes("..") ||
    trimmed.includes("\\")
  ) {
    return false;
  }

  if (!STRICT_STORAGE_PATH_REGEX.test(trimmed)) {
    return false;
  }

  const expectedPrefix = `${expectedEventId.trim().toLowerCase()}/${expectedRoundId.trim().toLowerCase()}/`;
  return trimmed.startsWith(expectedPrefix);
}

export function formatFileSizeBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export function classifyCompetitionDocumentsLoadError(
  error: { code?: string; message?: string } | null | undefined,
): "none" | "migration_missing" | "load_error" {
  if (!error) return "none";

  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  if (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("competition_documents")
  ) {
    return "migration_missing";
  }

  return "load_error";
}
