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
    <div className="mt-4 border-t border-slate-100 pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Round Documents
        </h3>
        {!loadError && documents.length > 0 ? (
          <span className="font-mono text-xs tabular-nums text-slate-500">
            {documents.length} {documents.length === 1 ? "file" : "files"}
          </span>
        ) : null}
      </div>

      {viewError ? (
        <div
          role="alert"
          className="mt-2.5 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-900"
        >
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-700"
            aria-hidden="true"
          />
          <span>{viewError}</span>
        </div>
      ) : null}

      {loadError ? (
        <div
          role="alert"
          className="mt-2.5 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900"
        >
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700"
            aria-hidden="true"
          />
          <span>{loadError}</span>
        </div>
      ) : documents.length === 0 ? (
        <p className="mt-2.5 rounded-md border border-slate-100 bg-slate-50/70 px-3 py-2.5 text-xs text-slate-500">
          No documents have been attached to this round yet.
        </p>
      ) : (
        <ul className="mt-2.5 space-y-2">
          {documents.map((doc) => {
            const isOpening = openingDocId === doc.id;
            return (
              <li
                key={doc.id}
                className="flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-2.5">
                  <FileText
                    className="mt-0.5 h-4 w-4 shrink-0 text-[#4B0507]"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {doc.title}
                    </p>
                    <p className="font-mono text-[11px] tabular-nums text-slate-500">
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
                  className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition-colors hover:border-[#4B0507] hover:text-[#4B0507] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507] disabled:cursor-not-allowed disabled:opacity-60"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 sm:p-6"
        >
          <div className="flex h-[90dvh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-[#4B0507]">
                  {eventCode} · Round {roundNumber} · {roundName}
                </p>
                <h4
                  id={`viewer-title-${activeViewer.documentId}`}
                  className="truncate font-display text-base font-bold text-slate-900"
                >
                  {activeViewer.title}
                </h4>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isRefreshing}
                  onClick={() => openDocument(activeViewer.documentId, true)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
                    aria-hidden="true"
                  />
                  <span>{isRefreshing ? "Refreshing..." : "Refresh Link"}</span>
                </button>

                <a
                  href={activeViewer.viewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Open in New Tab</span>
                </a>

                <button
                  ref={closeButtonRef}
                  type="button"
                  aria-label="Close document viewer"
                  onClick={() => setActiveViewer(null)}
                  className="inline-flex min-h-9 items-center gap-1 rounded-md bg-[#4B0507] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#380305] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Close</span>
                </button>
              </div>
            </div>

            <div className="border-b border-slate-200 bg-amber-50/70 px-4 py-2 text-xs text-slate-700 sm:px-5">
              Temporary secure view link expires after{" "}
              <span className="font-semibold">
                {activeViewer.expiresInSeconds} seconds
              </span>
              . Select <span className="font-medium">Refresh Link</span> if
              needed, or{" "}
              <span className="font-medium">Open in New Tab</span> on mobile
              browsers that show only the first page inline.
            </div>

            <div className="flex-1 bg-slate-100 p-2 sm:p-3">
              <iframe
                key={activeViewer.viewUrl}
                src={activeViewer.viewUrl}
                title={activeViewer.title}
                className="h-full w-full rounded border border-slate-200 bg-white"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
