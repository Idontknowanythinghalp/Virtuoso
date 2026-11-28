import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  PDF_PREVIEW_MAX_DPR,
  PDF_PREVIEW_MAX_ZOOM,
  PDF_PREVIEW_MIN_ZOOM,
  clampPdfZoom,
  classifyPdfFetchFailure,
  computePdfPageLayout,
  hasPdfMagicHeader,
} from "../src/lib/documents/pdf-preview.ts";

const ROOT_DIR = process.cwd();

test("Stage 4.6 (1) [Unit Test]: hasPdfMagicHeader validates real PDF payloads and rejects HTML/JSON/empty responses", () => {
  const validPdf = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");
  assert.equal(hasPdfMagicHeader(validPdf), true);

  const validWithWhitespacePrefix = new TextEncoder().encode(
    "\r\n  %PDF-1.4\n%",
  );
  assert.equal(hasPdfMagicHeader(validWithWhitespacePrefix), true);

  const htmlError = new TextEncoder().encode("<html><body>403 Forbidden</body></html>");
  assert.equal(hasPdfMagicHeader(htmlError), false);

  const jsonError = new TextEncoder().encode(
    '{"statusCode":"400","error":"InvalidJWT","message":"exp claim timestamp check failed"}',
  );
  assert.equal(hasPdfMagicHeader(jsonError), false);

  assert.equal(hasPdfMagicHeader(new Uint8Array(0)), false);
  assert.equal(hasPdfMagicHeader(new TextEncoder().encode("%PDF")), false);
});

test("Stage 4.6 (2) [Unit Test]: classifyPdfFetchFailure detects expired/invalid signed URLs, corrupt PDFs, and network errors safely", () => {
  for (const status of [400, 401, 403, 404]) {
    const res = classifyPdfFetchFailure({
      status,
      bodyText: '{"error":"InvalidJWT","message":"exp claim timestamp check failed"}',
    });
    assert.equal(res.kind, "expired_or_invalid_url");
    assert.equal(res.canRefreshLink, true);
    assert.equal(res.message.includes("InvalidJWT"), false);
    assert.match(res.message, /Refresh Link/);
  }

  const objectMissing = classifyPdfFetchFailure({
    bodyText: '{"error":"not_found","message":"Object not found"}',
  });
  assert.equal(objectMissing.kind, "expired_or_invalid_url");
  assert.equal(objectMissing.canRefreshLink, true);

  const invalidPdf = classifyPdfFetchFailure({
    error: { name: "InvalidPDFException", message: "Invalid PDF structure." },
  });
  assert.equal(invalidPdf.kind, "corrupt_pdf");
  assert.equal(invalidPdf.canRefreshLink, true);

  const passwordPdf = classifyPdfFetchFailure({
    error: { name: "PasswordException", message: "No password given" },
  });
  assert.equal(passwordPdf.kind, "corrupt_pdf");
  assert.equal(passwordPdf.canRefreshLink, true);

  const networkFail = classifyPdfFetchFailure({
    error: new TypeError("Failed to fetch"),
  });
  assert.equal(networkFail.kind, "network");
  assert.equal(networkFail.canRefreshLink, true);
});

test("Stage 4.6 (3) [Unit Test]: computePdfPageLayout fits narrow mobile viewports cleanly and caps DPR without overflow", () => {
  assert.equal(clampPdfZoom(0.2), PDF_PREVIEW_MIN_ZOOM);
  assert.equal(clampPdfZoom(5), PDF_PREVIEW_MAX_ZOOM);
  assert.equal(clampPdfZoom(Number.NaN), 1);

  // Narrow mobile viewport (e.g., 360px screen -> ~320px inner stage width, 3x phone DPR)
  const mobileLayout = computePdfPageLayout({
    pageWidth: 595,
    pageHeight: 842,
    containerWidth: 320,
    zoomMultiplier: 1.0,
    devicePixelRatio: 3,
  });
  assert.equal(mobileLayout.cssWidth, 320);
  assert.equal(mobileLayout.cssHeight, 453);
  assert.equal(mobileLayout.dpr, PDF_PREVIEW_MAX_DPR);
  assert.equal(
    mobileLayout.pixelWidth,
    Math.round(320 * PDF_PREVIEW_MAX_DPR),
  );

  // Desktop viewport (caps fit width cleanly at 960px max)
  const desktopLayout = computePdfPageLayout({
    pageWidth: 612,
    pageHeight: 792,
    containerWidth: 1200,
    zoomMultiplier: 1.0,
    devicePixelRatio: 1,
  });
  assert.equal(desktopLayout.cssWidth, 960);
  assert.equal(desktopLayout.dpr, 1);

  // Zoomed-in mobile view scales CSS and canvas cleanly
  const zoomedLayout = computePdfPageLayout({
    pageWidth: 595,
    pageHeight: 842,
    containerWidth: 320,
    zoomMultiplier: 1.5,
    devicePixelRatio: 2,
  });
  assert.equal(zoomedLayout.cssWidth, 480);
  assert.equal(zoomedLayout.pixelWidth, 960);
});

test("Stage 4.6 (4) [Static & Security Audit]: Mobile PDF.js viewer preserves private storage, avoids 3P viewers, avoids redundant reloads, and renders pages directly", () => {
  const viewerSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/components/team/PdfDocumentViewer.tsx"),
    "utf8",
  );
  const modalSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/components/team/ParticipantRoundDocuments.tsx"),
    "utf8",
  );
  const storageSource = fs.readFileSync(
    path.join(ROOT_DIR, "src/lib/documents/storage.ts"),
    "utf8",
  );

  // Browser-only client component with dynamic pdfjs-dist import (SSR safe) & local worker
  assert.match(viewerSource, /^"use client";/m);
  assert.match(viewerSource, /await import\("pdfjs-dist"\)/);
  assert.match(
    viewerSource,
    /new URL\(\s*"pdfjs-dist\/build\/pdf\.worker\.min\.mjs",\s*import\.meta\.url,?\s*\)/,
  );
  assert.match(viewerSource, /GlobalWorkerOptions\.workerSrc/);
  assert.match(viewerSource, /pdfjsLib\.getDocument\(\{\s*data:\s*bytes\s*\}\)/);
  assert.match(viewerSource, /loadingTask\.destroy\(\)/);
  assert.match(viewerSource, /AbortController/);

  // Single fetch per viewUrl (must NOT depend on containerWidth or zoomMultiplier)
  assert.match(viewerSource, /\},\s*\[viewUrl,\s*retryNonce\]\);/);

  // Multi-page rendering, responsive ResizeObserver, zoom & recovery controls
  assert.match(viewerSource, /ResizeObserver/);
  assert.match(viewerSource, /IntersectionObserver/);
  assert.match(viewerSource, /Page \{currentPage\} of \{numPages\}/);
  assert.match(viewerSource, /onRefreshLink/);
  assert.match(viewerSource, /Retry Preview/);
  assert.match(viewerSource, /Open in New Tab/);

  // Strict security: zero 3rd-party document viewers, zero iframes, zero service-role or public bucket access
  for (const forbidden of [
    "<iframe",
    "docs.google.com",
    "view.officeapps.live.com",
    "mozilla.github.io",
    "unpkg.com",
    "jsdelivr",
    "cdnjs",
    "window.open",
    "window.alert",
    "SUPABASE_SERVICE_ROLE_KEY",
    "supabase/admin",
    "getPublicUrl",
  ]) {
    assert.equal(
      viewerSource.includes(forbidden),
      false,
      `PdfDocumentViewer must not contain ${forbidden}`,
    );
    assert.equal(
      modalSource.includes(forbidden),
      false,
      `ParticipantRoundDocuments must not contain ${forbidden}`,
    );
  }

  // Modal preserves accessibility & existing signed URL workflow
  assert.match(modalSource, /role="dialog"/);
  assert.match(modalSource, /aria-modal="true"/);
  assert.match(modalSource, /event\.key === "Escape"/);
  assert.match(modalSource, /event\.key === "Tab"/);
  assert.match(modalSource, /lastTriggerRef\.current\?\.focus\(\)/);
  assert.match(modalSource, /href=\{activeViewer\.viewUrl\}/);
  assert.match(storageSource, /createCompetitionDocumentSignedViewUrl/);
});
