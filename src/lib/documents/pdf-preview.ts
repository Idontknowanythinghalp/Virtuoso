export const PDF_PREVIEW_MIN_ZOOM = 0.75;
export const PDF_PREVIEW_MAX_ZOOM = 2.0;
export const PDF_PREVIEW_DEFAULT_ZOOM = 1.0;
export const PDF_PREVIEW_ZOOM_STEP = 0.25;
export const PDF_PREVIEW_MAX_DPR = 2.25;

export type PdfPreviewFailureKind =
  | "expired_or_invalid_url"
  | "corrupt_pdf"
  | "network"
  | "unknown";

export interface PdfPreviewFailureClassification {
  kind: PdfPreviewFailureKind;
  message: string;
  canRefreshLink: boolean;
}

export interface PdfPageLayoutResult {
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
  renderScale: number;
  dpr: number;
}

/**
 * Checks whether a fetched byte buffer contains a valid %PDF- signature within
 * the first 1024 bytes (matching PDF spec header tolerance).
 */
export function hasPdfMagicHeader(bytes: Uint8Array | ArrayBuffer): boolean {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (view.byteLength < 5) {
    return false;
  }

  const limit = Math.min(view.byteLength - 5, 1024);
  for (let i = 0; i <= limit; i += 1) {
    if (
      view[i] === 0x25 && // %
      view[i + 1] === 0x50 && // P
      view[i + 2] === 0x44 && // D
      view[i + 3] === 0x46 && // F
      view[i + 4] === 0x2d // -
    ) {
      return true;
    }
  }

  return false;
}

export function clampPdfZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) {
    return PDF_PREVIEW_DEFAULT_ZOOM;
  }
  return Math.min(
    Math.max(Math.round(zoom * 100) / 100, PDF_PREVIEW_MIN_ZOOM),
    PDF_PREVIEW_MAX_ZOOM,
  );
}

/**
 * Computes responsive CSS and backing-canvas dimensions for a PDF page so narrow
 * mobile screens fit cleanly at 100% width while remaining sharp on HiDPI displays
 * without exceeding mobile GPU canvas limits.
 */
export function computePdfPageLayout(params: {
  pageWidth: number;
  pageHeight: number;
  containerWidth: number;
  zoomMultiplier: number;
  devicePixelRatio: number;
}): PdfPageLayoutResult {
  const safePageWidth =
    Number.isFinite(params.pageWidth) && params.pageWidth > 0
      ? params.pageWidth
      : 595;
  const safePageHeight =
    Number.isFinite(params.pageHeight) && params.pageHeight > 0
      ? params.pageHeight
      : 842;

  const safeContainerWidth =
    Number.isFinite(params.containerWidth) && params.containerWidth > 0
      ? Math.max(220, Math.min(params.containerWidth, 960))
      : 320;

  const zoom = clampPdfZoom(params.zoomMultiplier);
  const cssWidth = Math.max(220, Math.round(safeContainerWidth * zoom));
  const renderScale = cssWidth / safePageWidth;
  const cssHeight = Math.max(1, Math.round(safePageHeight * renderScale));

  const rawDpr =
    Number.isFinite(params.devicePixelRatio) && params.devicePixelRatio > 0
      ? params.devicePixelRatio
      : 1;
  const dpr = Math.min(Math.max(rawDpr, 1), PDF_PREVIEW_MAX_DPR);

  return {
    cssWidth,
    cssHeight,
    pixelWidth: Math.max(1, Math.round(cssWidth * dpr)),
    pixelHeight: Math.max(1, Math.round(cssHeight * dpr)),
    renderScale,
    dpr,
  };
}

/**
 * Maps HTTP responses, Supabase Storage JWT/object errors, and PDF.js parse errors
 * into safe participant-facing recovery guidance without leaking internal tokens or URLs.
 */
export function classifyPdfFetchFailure(params: {
  status?: number;
  bodyText?: string;
  error?: unknown;
}): PdfPreviewFailureClassification {
  const status = params.status;
  const normalizedBody = (params.bodyText ?? "").toLowerCase();
  const errorName =
    params.error && typeof params.error === "object" && "name" in params.error
      ? String((params.error as { name?: unknown }).name ?? "")
      : "";
  const errorMessage =
    params.error instanceof Error
      ? params.error.message
      : typeof params.error === "string"
        ? params.error
        : "";
  const combined = `${normalizedBody} ${errorMessage.toLowerCase()}`;

  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 404 ||
    combined.includes("invalidjwt") ||
    combined.includes("exp claim") ||
    combined.includes("jwt expired") ||
    combined.includes("signature") ||
    combined.includes("expired") ||
    combined.includes("object not found") ||
    combined.includes("status 400") ||
    combined.includes("status 401") ||
    combined.includes("status 403") ||
    combined.includes("status 404")
  ) {
    return {
      kind: "expired_or_invalid_url",
      message:
        "This temporary secure link has expired or is no longer valid. Select Refresh Link to load a fresh secure copy.",
      canRefreshLink: true,
    };
  }

  if (errorName === "PasswordException") {
    return {
      kind: "corrupt_pdf",
      message:
        "This PDF requires a password and cannot be previewed inline. Try Refresh Link or Open in New Tab.",
      canRefreshLink: true,
    };
  }

  if (
    errorName === "InvalidPDFException" ||
    combined.includes("invalid pdf") ||
    combined.includes("missing pdf") ||
    combined.includes("formaterror")
  ) {
    return {
      kind: "corrupt_pdf",
      message:
        "The document preview could not be parsed cleanly. Select Refresh Link or use Open in New Tab.",
      canRefreshLink: true,
    };
  }

  if (
    errorName === "TypeError" ||
    combined.includes("network") ||
    combined.includes("failed to fetch") ||
    combined.includes("load failed") ||
    combined.includes("abort")
  ) {
    return {
      kind: "network",
      message:
        "Unable to download the document preview over the current connection. Retry or Refresh Link below.",
      canRefreshLink: true,
    };
  }

  return {
    kind: "unknown",
    message:
      "Unable to render the in-app PDF preview right now. Try Refresh Link or Open in New Tab.",
    canRefreshLink: true,
  };
}
