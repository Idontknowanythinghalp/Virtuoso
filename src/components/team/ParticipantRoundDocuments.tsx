"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { viewParticipantRoundDocumentAction } from "@/app/actions/team-documents";
import { PdfDocumentViewer } from "@/components/team/PdfDocumentViewer";
import { formatFileSizeBytes } from "@/lib/documents/validation";
import type {
  ParticipantDocumentViewResult,
  ParticipantRoundDocumentItem,
} from "@/types/competition";

interface ParticipantRoundDocumentsProps {
  eventCode: string;
  roundNumber: number;
  roundName: string;
  documents: ParticipantRoundDocumentItem[];
  loadError: string | null;
}

interface ActiveViewerState {
  documentId: string;
  title: string;
  viewUrl: string;
  expiresInSeconds: number;
}

export function ParticipantRoundDocuments({
  eventCode,
  roundNumber,
  roundName,
  documents,
  loadError,
}: ParticipantRoundDocumentsProps) {
  const [openingDocId, setOpeningDocId] = useState<string | null>(null);
  const [viewError, setViewError] = useState<string | null>(null);
  const [activeViewer, setActiveViewer] = useState<ActiveViewerState | null>(
    null,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (activeViewer) {
      wasOpenRef.current = true;
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      closeButtonRef.current?.focus();

      function handleKeyDown(event: KeyboardEvent) {
        if (event.key === "Escape") {
          setActiveViewer(null);
          return;
        }

        if (event.key === "Tab" && dialogRef.current) {
          const focusable = Array.from(
            dialogRef.current.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          );
          if (focusable.length === 0) return;

          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          const activeEl = document.activeElement;

          if (event.shiftKey && activeEl === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && activeEl === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }

      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = previousOverflow;
        window.removeEventListener("keydown", handleKeyDown);
      };
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      lastTriggerRef.current?.focus();
    }
  }, [activeViewer]);

  async function openDocument(
    docId: string,
    isRefresh = false,
    triggerElement?: HTMLButtonElement | null,
  ) {
    if (triggerElement) {
      lastTriggerRef.current = triggerElement;
    }
    setViewError(null);
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setOpeningDocId(docId);
    }

    try {
      const result: ParticipantDocumentViewResult =
        await viewParticipantRoundDocumentAction(docId);

      if (!result.ok) {
        if (isRefresh) {
          setActiveViewer(null);
        }
        setViewError(result.message);
        return;
      }

      setActiveViewer({
        documentId: result.documentId,
        title: result.title,
        viewUrl: result.viewUrl,
        expiresInSeconds: result.expiresInSeconds,
      });
    } catch {
      if (isRefresh) {
        setActiveViewer(null);
      }
      setViewError("Unable to open this document right now. Please try again.");
    } finally {
      setOpeningDocId(null);
      setIsRefreshing(false);
    }
  }

  return (
    <div className="border-t border-[#542525] pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-[#F5F0EC]">
          Round Documents
        </h3>
        {!loadError && documents.length > 0 ? (
          <span className="font-mono text-xs tabular-nums text-[#B9AAA5]">
            {documents.length} {documents.length === 1 ? "file" : "files"}
          </span>
        ) : null}
      </div>

      {viewError ? (
        <div
          role="alert"
          className="mt-2.5 flex items-start gap-2 rounded-md border border-red-400/45 bg-[#350A0A] px-3 py-2.5 text-xs text-red-200"
        >
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-300"
            aria-hidden="true"
          />
          <span>{viewError}</span>
        </div>
      ) : null}

      {loadError ? (
        <div
          role="alert"
          className="mt-2.5 flex items-start gap-2 rounded-md border border-amber-400/45 bg-[#350A0A] px-3 py-2.5 text-xs text-amber-200"
        >
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300"
            aria-hidden="true"
          />
          <span>{loadError}</span>
        </div>
      ) : documents.length === 0 ? (
        <p className="mt-2.5 rounded-md border border-[#542525] bg-[#350A0A] px-3 py-2.5 text-xs text-[#B9AAA5]">
          No documents have been attached to this round yet.
        </p>
      ) : (
        <ul className="mt-2.5 space-y-2">
          {documents.map((doc) => {
            const isOpening = openingDocId === doc.id;
            return (
              <li
                key={doc.id}
                className="flex flex-col gap-2.5 rounded-md border border-[#542525] bg-[#350A0A] px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-2.5">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[#542525] bg-[#2B0808] text-[#D9AD61]">
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#F5F0EC]">
                      {doc.title}
                    </p>
                    <p className="font-mono text-[11px] tabular-nums text-[#B9AAA5]">
                      {formatFileSizeBytes(doc.fileSizeBytes)}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isOpening || openingDocId !== null}
                  onClick={(event) =>
                    openDocument(doc.id, false, event.currentTarget)
                  }
                  className="inline-flex min-h-10 w-full shrink-0 items-center justify-center gap-1.5 rounded-md border border-[#D9AD61]/60 bg-[#401010] px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap text-[#F5F0EC] transition-colors hover:border-[#D9AD61] hover:bg-[#D9AD61] hover:text-[#200000] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9AD61] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {isOpening ? (
                    <>
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden="true"
                      />
                      <span>Opening...</span>
                    </>
                  ) : (
                    <span>View Document</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {activeViewer ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`viewer-title-${activeViewer.documentId}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setActiveViewer(null);
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#140000]/85 p-2 backdrop-blur-[2px] sm:p-5"
        >
          <div
            ref={dialogRef}
            className="flex h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-[#542525] bg-[#2B0808] shadow-2xl sm:h-[90dvh]"
          >
            <div className="flex flex-col gap-3 border-b border-[#542525] bg-[#200000] px-4 py-3 text-[#F5F0EC] sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="min-w-0">
                <p className="truncate font-mono text-[11px] font-medium tracking-wide text-[#D9AD61]">
                  {eventCode} · Round {roundNumber} · {roundName}
                </p>
                <h4
                  id={`viewer-title-${activeViewer.documentId}`}
                  className="truncate font-display text-base font-bold text-[#F5F0EC]"
                >
                  {activeViewer.title}
                </h4>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isRefreshing}
                  onClick={() => openDocument(activeViewer.documentId, true)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[#542525] bg-[#350A0A] px-3 py-1.5 text-xs font-medium whitespace-nowrap text-[#F5F0EC] transition-colors hover:border-[#D9AD61] hover:bg-[#401010] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9AD61] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 shrink-0 ${isRefreshing ? "animate-spin" : ""}`}
                    aria-hidden="true"
                  />
                  <span>{isRefreshing ? "Refreshing..." : "Refresh Link"}</span>
                </button>

                <a
                  href={activeViewer.viewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[#542525] bg-[#350A0A] px-3 py-1.5 text-xs font-medium whitespace-nowrap text-[#F5F0EC] transition-colors hover:border-[#D9AD61] hover:bg-[#401010] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9AD61]"
                >
                  <ExternalLink
                    className="h-3.5 w-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  <span>Open in New Tab</span>
                </a>

                <button
                  ref={closeButtonRef}
                  type="button"
                  aria-label="Close document viewer"
                  onClick={() => setActiveViewer(null)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-[#D9AD61] px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap text-[#200000] transition-colors hover:bg-[#E4BC77] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9AD61] focus-visible:ring-offset-2 focus-visible:ring-offset-[#200000]"
                >
                  <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Close</span>
                </button>
              </div>
            </div>

            <div className="border-b border-[#542525] bg-[#350A0A] px-4 py-2 text-xs leading-relaxed text-[#B9AAA5] sm:px-5">
              Temporary secure view link expires after{" "}
              <span className="font-mono font-semibold text-[#D9AD61]">
                {activeViewer.expiresInSeconds} seconds
              </span>
              . Pages render directly below across mobile and desktop. Use{" "}
              <span className="font-semibold text-[#F5F0EC]">Refresh Link</span>{" "}
              if the link expires, or{" "}
              <span className="font-semibold text-[#F5F0EC]">
                Open in New Tab
              </span>{" "}
              to open externally.
            </div>

            <div className="min-h-0 flex-1 bg-[#200000] p-1.5 sm:p-3">
              <PdfDocumentViewer
                key={activeViewer.viewUrl}
                viewUrl={activeViewer.viewUrl}
                title={activeViewer.title}
                expiresInSeconds={activeViewer.expiresInSeconds}
                isRefreshingLink={isRefreshing}
                onRefreshLink={() =>
                  openDocument(activeViewer.documentId, true)
                }
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
