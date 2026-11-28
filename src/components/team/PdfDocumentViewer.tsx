"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  RefreshCw,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  PDF_PREVIEW_DEFAULT_ZOOM,
  PDF_PREVIEW_MAX_ZOOM,
  PDF_PREVIEW_MIN_ZOOM,
  PDF_PREVIEW_ZOOM_STEP,
  clampPdfZoom,
  classifyPdfFetchFailure,
  computePdfPageLayout,
  hasPdfMagicHeader,
  type PdfPreviewFailureClassification,
} from "@/lib/documents/pdf-preview";

interface PdfDocumentViewerProps {
  viewUrl: string;
  title: string;
  expiresInSeconds: number;
  isRefreshingLink: boolean;
  onRefreshLink: () => void;
}

interface PdfPageSheetProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  totalPages: number;
  availableWidth: number;
  zoomMultiplier: number;
  defaultAspectRatio: number;
  scrollRoot: HTMLDivElement | null;
  onVisibilityChange: (pageNumber: number, ratio: number) => void;
}

function isRenderCancelledError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String((err as { name?: unknown }).name ?? "") : "";
  return name === "RenderingCancelledException";
}

function PdfPageSheet({
  pdfDoc,
  pageNumber,
  totalPages,
  availableWidth,
  zoomMultiplier,
  defaultAspectRatio,
  scrollRoot,
  onVisibilityChange,
}: PdfPageSheetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [shouldRender, setShouldRender] = useState(
    () => pageNumber <= 2 || typeof IntersectionObserver === "undefined",
  );
  const [pageSize, setPageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  // Lazy-activate pages near the scroll viewport so multi-page PDFs remain responsive on mobile
  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShouldRender(true);
          }
        }
      },
      {
        root: scrollRoot,
        rootMargin: "700px 0px",
        threshold: 0,
      },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [scrollRoot]);

  // Track visible intersection ratio for the Page X of N indicator
  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          onVisibilityChange(
            pageNumber,
            entry.isIntersecting ? entry.intersectionRatio : 0,
          );
        }
      },
      {
        root: scrollRoot,
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    observer.observe(node);
    return () => {
      onVisibilityChange(pageNumber, 0);
      observer.disconnect();
    };
  }, [onVisibilityChange, pageNumber, scrollRoot]);

  // Render the PDF page onto its canvas without re-downloading the PDF bytes
  useEffect(() => {
    if (!shouldRender) return;

    let cancelled = false;
    let activeRenderTask: RenderTask | null = null;

    async function renderPage() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      setIsRendering(true);
      setPageError(null);

      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        setPageSize((prev) =>
          prev &&
          prev.width === baseViewport.width &&
          prev.height === baseViewport.height
            ? prev
            : { width: baseViewport.width, height: baseViewport.height },
        );

        const layout = computePdfPageLayout({
          pageWidth: baseViewport.width,
          pageHeight: baseViewport.height,
          containerWidth: availableWidth,
          zoomMultiplier,
          devicePixelRatio:
            typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
        });

        canvas.width = layout.pixelWidth;
        canvas.height = layout.pixelHeight;
        canvas.style.width = `${layout.cssWidth}px`;
        canvas.style.height = `${layout.cssHeight}px`;

        const renderViewport = page.getViewport({ scale: layout.renderScale });
        const transform =
          layout.dpr !== 1
            ? [layout.dpr, 0, 0, layout.dpr, 0, 0]
            : undefined;

        activeRenderTask = page.render({
          canvas,
          viewport: renderViewport,
          transform,
        });

        await activeRenderTask.promise;
      } catch (err) {
        if (!cancelled && !isRenderCancelledError(err)) {
          setPageError(`Unable to render page ${pageNumber}.`);
        }
      } finally {
        if (!cancelled) {
          setIsRendering(false);
        }
      }
    }

    void renderPage();

    return () => {
      cancelled = true;
      if (activeRenderTask) {
        try {
          activeRenderTask.cancel();
        } catch {
          // Ignore cancellation cleanup errors.
        }
      }
    };
  }, [availableWidth, pageNumber, pdfDoc, shouldRender, zoomMultiplier]);

  const referenceWidth = pageSize?.width ?? 595;
  const referenceHeight =
    pageSize?.height ?? Math.round(595 * defaultAspectRatio);

  const placeholderLayout = computePdfPageLayout({
    pageWidth: referenceWidth,
    pageHeight: referenceHeight,
    containerWidth: availableWidth,
    zoomMultiplier,
    devicePixelRatio: 1,
  });

  return (
    <div
      ref={containerRef}
      data-pdf-page={pageNumber}
      className="flex flex-col items-center gap-1.5"
    >
      <div
        className="relative overflow-hidden rounded-sm border border-[#542525]/70 bg-white shadow-lg"
        style={{
          width: `${placeholderLayout.cssWidth}px`,
          minHeight: `${placeholderLayout.cssHeight}px`,
        }}
      >
        <canvas
          ref={canvasRef}
          aria-label={`Page ${pageNumber} of ${totalPages}`}
          className="block bg-white"
        />

        {isRendering && !pageError ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/75"
          >
            <Loader2 className="h-5 w-5 animate-spin text-[#4A0D0D]" />
          </div>
        ) : null}

        {pageError ? (
          <div
            role="alert"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#2B0808] p-4 text-center text-xs text-red-200"
          >
            <AlertTriangle
              className="h-4 w-4 text-red-300"
              aria-hidden="true"
            />
            <span>{pageError}</span>
          </div>
        ) : null}
      </div>

      {totalPages > 1 ? (
        <span className="font-mono text-[11px] tabular-nums text-[#B9AAA5]">
          Page {pageNumber} of {totalPages}
        </span>
      ) : null}
    </div>
  );
}

export function PdfDocumentViewer({
  viewUrl,
  title,
  expiresInSeconds,
  isRefreshingLink,
  onRefreshLink,
}: PdfDocumentViewerProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const visibilityMapRef = useRef<Map<number, number>>(new Map());
  const [scrollRootEl, setScrollRootEl] = useState<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(320);
  const [zoomMultiplier, setZoomMultiplier] = useState<number>(
    PDF_PREVIEW_DEFAULT_ZOOM,
  );
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [defaultAspectRatio, setDefaultAspectRatio] = useState<number>(1.414);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isLoadingDoc, setIsLoadingDoc] = useState<boolean>(true);
  const [loadFailure, setLoadFailure] =
    useState<PdfPreviewFailureClassification | null>(null);
  const [retryNonce, setRetryNonce] = useState<number>(0);

  const assignScrollRef = useCallback((node: HTMLDivElement | null) => {
    scrollContainerRef.current = node;
    setScrollRootEl(node);
  }, []);

  // Measure the available stage width once and respond smoothly to screen rotation / resize
  useEffect(() => {
    const node = scrollContainerRef.current;
    if (!node) return;

    function measureWidth() {
      if (!node) return;
      const horizontalPadding = window.innerWidth < 640 ? 16 : 32;
      const measured = Math.max(220, node.clientWidth - horizontalPadding);
      setContainerWidth((prev) =>
        Math.abs(prev - measured) >= 4 ? measured : prev,
      );
    }

    measureWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measureWidth);
      return () => window.removeEventListener("resize", measureWidth);
    }

    const observer = new ResizeObserver(() => {
      measureWidth();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Fetch PDF bytes once per signed viewUrl and open via PDF.js without re-downloading on zoom/resize
  useEffect(() => {
    let cancelled = false;
    const abortController = new AbortController();
    let loadingTask: { destroy: () => Promise<void> } | null = null;

    async function loadPdfDocument() {
      setIsLoadingDoc(true);
      setLoadFailure(null);
      setPdfDoc(null);
      setNumPages(0);
      setCurrentPage(1);
      visibilityMapRef.current.clear();

      try {
        const response = await fetch(viewUrl, {
          signal: abortController.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          const errorSnippet = await response
            .text()
            .then((txt) => txt.slice(0, 512))
            .catch(() => "");
          if (cancelled) return;
          setLoadFailure(
            classifyPdfFetchFailure({
              status: response.status,
              bodyText: errorSnippet,
            }),
          );
          setIsLoadingDoc(false);
          return;
        }

        const buffer = await response.arrayBuffer();
        if (cancelled) return;

        const bytes = new Uint8Array(buffer);
        if (!hasPdfMagicHeader(bytes)) {
          const fallbackSnippet = new TextDecoder().decode(
            bytes.slice(0, 256),
          );
          setLoadFailure(
            classifyPdfFetchFailure({
              bodyText: fallbackSnippet,
              error: { name: "InvalidPDFException", message: "Invalid PDF header" },
            }),
          );
          setIsLoadingDoc(false);
          return;
        }

        const pdfjsLib = await import("pdfjs-dist");
        if (cancelled) return;

        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
            "pdfjs-dist/build/pdf.worker.min.mjs",
            import.meta.url,
          ).toString();
        }

        const task = pdfjsLib.getDocument({ data: bytes });
        loadingTask = task;

        const doc = await task.promise;
        if (cancelled) {
          await task.destroy().catch(() => {});
          return;
        }

        try {
          const firstPage = await doc.getPage(1);
          if (!cancelled) {
            const firstViewport = firstPage.getViewport({ scale: 1 });
            if (firstViewport.width > 0 && firstViewport.height > 0) {
              setDefaultAspectRatio(firstViewport.height / firstViewport.width);
            }
          }
        } catch {
          // Retain A4 aspect ratio fallback if metadata inspection throws.
        }

        if (!cancelled) {
          setNumPages(doc.numPages);
          setPdfDoc(doc);
          setIsLoadingDoc(false);
        }
      } catch (err) {
        if (cancelled || abortController.signal.aborted) {
          return;
        }
        setLoadFailure(classifyPdfFetchFailure({ error: err }));
        setIsLoadingDoc(false);
      }
    }

    void loadPdfDocument();

    return () => {
      cancelled = true;
      abortController.abort();
      if (loadingTask) {
        void loadingTask.destroy().catch(() => {});
      }
    };
  }, [viewUrl, retryNonce]);

  const handleVisibilityChange = useCallback(
    (pageNumber: number, ratio: number) => {
      if (ratio <= 0) {
        visibilityMapRef.current.delete(pageNumber);
      } else {
        visibilityMapRef.current.set(pageNumber, ratio);
      }

      let bestPage = 1;
      let bestRatio = -1;
      for (const [page, pageRatio] of visibilityMapRef.current.entries()) {
        if (
          pageRatio > bestRatio ||
          (pageRatio === bestRatio && page < bestPage)
        ) {
          bestRatio = pageRatio;
          bestPage = page;
        }
      }

      if (bestRatio > 0) {
        setCurrentPage(bestPage);
      }
    },
    [],
  );

  const zoomPercent = Math.round(zoomMultiplier * 100);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded border border-[#542525] bg-[#190303]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#542525] bg-[#2B0808] px-3 py-2 text-xs text-[#F5F0EC]">
        <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums">
          {pdfDoc && numPages > 0 ? (
            <span className="rounded border border-[#542525] bg-[#200000] px-2 py-1 text-[#D9AD61]">
              Page {currentPage} of {numPages}
            </span>
          ) : (
            <span className="text-[#B9AAA5]">
              {isLoadingDoc ? "Preparing preview..." : "Preview status"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Zoom out"
            disabled={
              !pdfDoc || zoomMultiplier <= PDF_PREVIEW_MIN_ZOOM
            }
            onClick={() =>
              setZoomMultiplier((prev) =>
                clampPdfZoom(prev - PDF_PREVIEW_ZOOM_STEP),
              )
            }
            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded border border-[#542525] bg-[#350A0A] px-2 text-[#F5F0EC] transition-colors hover:border-[#D9AD61] hover:bg-[#401010] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9AD61] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          <button
            type="button"
            aria-label="Reset zoom to fit width"
            disabled={!pdfDoc}
            onClick={() => setZoomMultiplier(PDF_PREVIEW_DEFAULT_ZOOM)}
            className="inline-flex min-h-9 items-center justify-center rounded border border-[#542525] bg-[#200000] px-2.5 font-mono text-[11px] tabular-nums text-[#F5F0EC] transition-colors hover:border-[#D9AD61] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9AD61] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {zoomPercent === 100 ? "Fit Width" : `${zoomPercent}%`}
          </button>

          <button
            type="button"
            aria-label="Zoom in"
            disabled={
              !pdfDoc || zoomMultiplier >= PDF_PREVIEW_MAX_ZOOM
            }
            onClick={() =>
              setZoomMultiplier((prev) =>
                clampPdfZoom(prev + PDF_PREVIEW_ZOOM_STEP),
              )
            }
            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded border border-[#542525] bg-[#350A0A] px-2 text-[#F5F0EC] transition-colors hover:border-[#D9AD61] hover:bg-[#401010] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9AD61] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        ref={assignScrollRef}
        aria-label={`PDF preview for ${title}`}
        className="min-h-0 flex-1 overflow-auto p-2 sm:p-4"
      >
        {isLoadingDoc ? (
          <div
            role="status"
            aria-live="polite"
            className="flex h-full min-h-[260px] flex-col items-center justify-center gap-3 text-center"
          >
            <Loader2
              className="h-7 w-7 animate-spin text-[#D9AD61]"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <p className="text-sm font-medium text-[#F5F0EC]">
                Rendering PDF pages...
              </p>
              <p className="text-xs text-[#B9AAA5]">
                Secure link valid for {expiresInSeconds} seconds.
              </p>
            </div>
          </div>
        ) : loadFailure ? (
          <div
            role="alert"
            className="mx-auto my-6 flex max-w-md flex-col items-center gap-4 rounded-lg border border-red-400/45 bg-[#2B0808] p-5 text-center text-[#F5F0EC]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-red-400/40 bg-[#350A0A] text-red-300">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>

            <div className="space-y-1.5">
              <h5 className="font-display text-sm font-semibold text-[#F5F0EC]">
                {loadFailure.kind === "expired_or_invalid_url"
                  ? "Secure Document Link Expired"
                  : "Unable to Display PDF Preview"}
              </h5>
              <p className="text-xs leading-relaxed text-[#B9AAA5]">
                {loadFailure.message}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              {loadFailure.canRefreshLink ? (
                <button
                  type="button"
                  disabled={isRefreshingLink}
                  onClick={onRefreshLink}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-[#D9AD61] px-3.5 py-1.5 text-xs font-semibold text-[#200000] transition-colors hover:bg-[#E4BC77] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9AD61] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isRefreshingLink ? "animate-spin" : ""}`}
                    aria-hidden="true"
                  />
                  <span>
                    {isRefreshingLink ? "Refreshing..." : "Refresh Link"}
                  </span>
                </button>
              ) : null}

              {loadFailure.kind !== "expired_or_invalid_url" ? (
                <button
                  type="button"
                  onClick={() => setRetryNonce((prev) => prev + 1)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[#542525] bg-[#350A0A] px-3.5 py-1.5 text-xs font-medium text-[#F5F0EC] transition-colors hover:border-[#D9AD61] hover:bg-[#401010] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9AD61]"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Retry Preview</span>
                </button>
              ) : null}

              <a
                href={viewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[#542525] bg-[#350A0A] px-3.5 py-1.5 text-xs font-medium text-[#F5F0EC] transition-colors hover:border-[#D9AD61] hover:bg-[#401010] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9AD61]"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Open in New Tab</span>
              </a>
            </div>
          </div>
        ) : pdfDoc && numPages > 0 ? (
          <div className="flex min-w-full w-max flex-col items-center gap-4 pb-2">
            {Array.from({ length: numPages }, (_, index) => index + 1).map(
              (pageNumber) => (
                <PdfPageSheet
                  key={`${viewUrl}-page-${pageNumber}`}
                  pdfDoc={pdfDoc}
                  pageNumber={pageNumber}
                  totalPages={numPages}
                  availableWidth={containerWidth}
                  zoomMultiplier={zoomMultiplier}
                  defaultAspectRatio={defaultAspectRatio}
                  scrollRoot={scrollRootEl}
                  onVisibilityChange={handleVisibilityChange}
                />
              ),
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
