"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Edit3,
  FileText,
  Lock,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import {
  finalizeRoundDocumentReplacementAction,
  finalizeRoundDocumentUploadAction,
  removeRoundDocumentAction,
  requestRoundDocumentReplaceIntentAction,
  requestRoundDocumentUploadIntentAction,
  updateRoundDocumentTitleAction,
} from "@/app/actions/documents";
import { formatIstTimestamp } from "@/lib/date-time";
import { uploadPdfDirectToStorage } from "@/lib/documents/client-upload";
import {
  formatFileSizeBytes,
  MAX_COMPETITION_DOCUMENT_BYTES,
} from "@/lib/documents/validation";
import type {
  AdminRoundDocumentItem,
  DirectUploadStage,
  DocumentOperationResult,
} from "@/types/competition";

interface RoundDocumentsPanelProps {
  eventId: string;
  roundId: string;
  canManageDocuments: boolean;
  documents: AdminRoundDocumentItem[];
  documentsMigrationMissing: boolean;
  documentsLoadError: string | null;
}

function getStageButtonLabel(
  stage: DirectUploadStage,
  mode: "upload" | "replace",
): string {
  switch (stage) {
    case "requesting_permission":
      return "Requesting permission...";
    case "uploading_storage":
      return mode === "replace" ? "Uploading replacement..." : "Uploading PDF...";
    case "finalising":
      return "Verifying & saving...";
  }
}

export function RoundDocumentsPanel({
  eventId,
  roundId,
  canManageDocuments,
  documents,
  documentsMigrationMissing,
  documentsLoadError,
}: RoundDocumentsPanelProps) {
  const router = useRouter();
  const uploadFormRef = useRef<HTMLFormElement>(null);
  const isMountedRef = useRef(true);
  const [isPending, startTransition] = useTransition();
  const [uploadState, setUploadState] =
    useState<DocumentOperationResult | null>(null);
  const [uploadStage, setUploadStage] = useState<DirectUploadStage | null>(
    null,
  );
  const [replaceStage, setReplaceStage] = useState<DirectUploadStage | null>(
    null,
  );
  const [actionFeedback, setActionFeedback] =
    useState<DocumentOperationResult | null>(null);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [replacingDocId, setReplacingDocId] = useState<string | null>(null);
  const [confirmRemoveDocId, setConfirmRemoveDocId] = useState<string | null>(
    null,
  );

  const isUploading = uploadStage !== null;
  const isReplacingUpload = replaceStage !== null;
  const isBusy = isPending || isUploading || isReplacingUpload;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isUploading && !isReplacingUpload) {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isUploading, isReplacingUpload]);

  async function handleUploadSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBusy) return;

    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") ?? "");
    const rawFile = formData.get("file");

    setActionFeedback(null);

    if (!(rawFile instanceof File) || rawFile.size <= 0) {
      setUploadState({
        ok: false,
        message: "Select a non-empty PDF file to upload.",
      });
      return;
    }

    if (rawFile.size > MAX_COMPETITION_DOCUMENT_BYTES) {
      setUploadState({
        ok: false,
        message: "PDF file exceeds the maximum allowed size of 25 MB.",
      });
      return;
    }

    setUploadState(null);
    setUploadStage("requesting_permission");

    try {
      const result = await uploadPdfDirectToStorage({
        title,
        file: rawFile,
        requestIntent: (params) =>
          requestRoundDocumentUploadIntentAction({
            eventId,
            roundId,
            ...params,
          }),
        finalizeUpload: (params) =>
          finalizeRoundDocumentUploadAction({
            eventId,
            roundId,
            ...params,
          }),
        onStageChange(stage) {
          if (isMountedRef.current) {
            setUploadStage(stage);
          }
        },
      });

      if (!isMountedRef.current) return;
      setUploadState(result);
      if (result.ok) {
        uploadFormRef.current?.reset();
        router.refresh();
      }
    } finally {
      if (isMountedRef.current) {
        setUploadStage(null);
      }
    }
  }

  function handleRenameSubmit(formData: FormData) {
    if (isBusy) return;
    setActionFeedback(null);
    startTransition(async () => {
      const result = await updateRoundDocumentTitleAction(formData);
      setActionFeedback(result);
      if (result.ok) {
        setEditingDocId(null);
        router.refresh();
      }
    });
  }

  async function handleReplaceSubmit(
    event: React.FormEvent<HTMLFormElement>,
    documentId: string,
  ) {
    event.preventDefault();
    if (isBusy) return;

    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") ?? "");
    const rawFile = formData.get("file");

    if (!(rawFile instanceof File) || rawFile.size <= 0) {
      setActionFeedback({
        ok: false,
        message: "Select a non-empty replacement PDF file to upload.",
      });
      return;
    }

    if (rawFile.size > MAX_COMPETITION_DOCUMENT_BYTES) {
      setActionFeedback({
        ok: false,
        message: "PDF file exceeds the maximum allowed size of 25 MB.",
      });
      return;
    }

    setActionFeedback(null);
    setReplaceStage("requesting_permission");

    try {
      const result = await uploadPdfDirectToStorage({
        title,
        file: rawFile,
        requestIntent: (params) =>
          requestRoundDocumentReplaceIntentAction({
            eventId,
            roundId,
            documentId,
            ...params,
          }),
        finalizeUpload: (params) =>
          finalizeRoundDocumentReplacementAction({
            eventId,
            roundId,
            documentId,
            title: params.title,
            originalFilename: params.originalFilename,
            newStorageObjectPath: params.storageObjectPath,
          }),
        onStageChange(stage) {
          if (isMountedRef.current) {
            setReplaceStage(stage);
          }
        },
      });

      if (!isMountedRef.current) return;
      setActionFeedback(result);
      if (result.ok) {
        setReplacingDocId(null);
        router.refresh();
      }
    } finally {
      if (isMountedRef.current) {
        setReplaceStage(null);
      }
    }
  }

  function handleRemoveConfirm(documentId: string) {
    if (isBusy) return;
    setActionFeedback(null);
    startTransition(async () => {
      const result = await removeRoundDocumentAction(
        eventId,
        roundId,
        documentId,
      );
      setActionFeedback(result);
      setConfirmRemoveDocId(null);
      if (result.ok) {
        router.refresh();
      }
    });
  }

  const blockedByInfra =
    documentsMigrationMissing || Boolean(documentsLoadError);

  return (
    <section
      aria-labelledby="round-documents-heading"
      className="rounded-lg border border-slate-200 bg-white p-6 space-y-5"
    >
      <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2
            id="round-documents-heading"
            className="font-display text-lg font-semibold text-slate-900"
          >
            Round PDF Documents
          </h2>
          <p className="text-sm text-slate-600">
            Attach, label, replace, or remove private PDF briefs and prompts
            for this round. Files are stored in a private bucket and managed
            exclusively by Super Administrators.
          </p>
        </div>

        {canManageDocuments && !blockedByInfra ? (
          <div className="inline-flex shrink-0 items-center gap-1.5 self-start rounded border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs font-medium text-slate-700">
            <ShieldCheck
              className="h-3.5 w-3.5 text-[#4B0507]"
              aria-hidden="true"
            />
            <span>
              {documents.length} {documents.length === 1 ? "PDF" : "PDFs"}
            </span>
          </div>
        ) : null}
      </div>

      {!canManageDocuments ? (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
        >
          <Lock
            className="mt-0.5 h-4 w-4 shrink-0 text-slate-500"
            aria-hidden="true"
          />
          <span>
            Round PDF management is restricted to active Super Administrators.
          </span>
        </div>
      ) : documentsMigrationMissing ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"
            aria-hidden="true"
          />
          <span>
            Round document database migration{" "}
            <span className="font-mono text-xs">
              202611260011_stage43a_competition_documents.sql
            </span>{" "}
            has not been applied yet. Apply it in Supabase before managing round
            PDFs.
          </span>
        </div>
      ) : documentsLoadError ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-red-700"
            aria-hidden="true"
          />
          <span>{documentsLoadError}</span>
        </div>
      ) : (
        <>
          {actionFeedback ? (
            <div className="space-y-2">
              <div
                role={actionFeedback.ok ? "status" : "alert"}
                aria-live="polite"
                className={`rounded-md border px-3.5 py-2.5 text-sm ${
                  actionFeedback.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-red-200 bg-red-50 text-red-900"
                }`}
              >
                {actionFeedback.message}
              </div>
              {actionFeedback.warning ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-950"
                >
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"
                    aria-hidden="true"
                  />
                  <span>{actionFeedback.warning}</span>
                </div>
              ) : null}
            </div>
          ) : null}

          {documents.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/70 px-4 py-6 text-center">
              <FileText
                className="mx-auto h-6 w-6 text-slate-400"
                aria-hidden="true"
              />
              <p className="mt-2 text-sm font-medium text-slate-800">
                No PDFs attached to this round yet
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Upload one or more private PDF documents below. Each file may be
                up to 25 MB.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
              {documents.map((doc) => {
                const isEditing = editingDocId === doc.id;
                const isReplacing = replacingDocId === doc.id;
                const isConfirmingRemove = confirmRemoveDocId === doc.id;

                return (
                  <li key={doc.id} className="p-4 space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-50 text-[#4B0507]">
                          <FileText className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div className="space-y-0.5">
                          <h3 className="text-sm font-semibold text-slate-900">
                            {doc.title}
                          </h3>
                          <p className="font-mono text-xs text-slate-600">
                            {doc.originalFilename}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatFileSizeBytes(doc.fileSizeBytes)} · Updated{" "}
                            {formatIstTimestamp(doc.updatedAt)}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {isConfirmingRemove ? (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleRemoveConfirm(doc.id)}
                              className="min-h-8 rounded border border-red-300 bg-red-50 px-3 py-1 text-xs font-medium text-red-800 hover:bg-red-100 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                            >
                              {isPending ? "Removing..." : "Confirm Remove"}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setConfirmRemoveDocId(null)}
                              className="min-h-8 rounded border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => {
                                setReplacingDocId(null);
                                setConfirmRemoveDocId(null);
                                setEditingDocId(isEditing ? null : doc.id);
                              }}
                              className="inline-flex min-h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                            >
                              <Edit3
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              <span>Edit Title</span>
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => {
                                setEditingDocId(null);
                                setConfirmRemoveDocId(null);
                                setReplacingDocId(isReplacing ? null : doc.id);
                              }}
                              className="inline-flex min-h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                            >
                              <RefreshCw
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              <span>Replace PDF</span>
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => {
                                setEditingDocId(null);
                                setReplacingDocId(null);
                                setConfirmRemoveDocId(doc.id);
                              }}
                              className="inline-flex min-h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-red-50 hover:text-red-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                            >
                              <Trash2
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              <span>Remove</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {isEditing ? (
                      <form
                        action={handleRenameSubmit}
                        className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-3"
                      >
                        <input type="hidden" name="eventId" value={eventId} />
                        <input type="hidden" name="roundId" value={roundId} />
                        <input
                          type="hidden"
                          name="documentId"
                          value={doc.id}
                        />
                        <div className="space-y-1">
                          <label
                            htmlFor={`rename-doc-${doc.id}`}
                            className="block text-xs font-medium text-slate-700"
                          >
                            Readable Document Title
                          </label>
                          <input
                            id={`rename-doc-${doc.id}`}
                            name="title"
                            type="text"
                            required
                            minLength={2}
                            maxLength={160}
                            defaultValue={doc.title}
                            className="min-h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                          />
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setEditingDocId(null)}
                            className="min-h-8 rounded border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={isBusy}
                            className="min-h-8 rounded bg-[#4B0507] px-3 py-1 text-xs font-medium text-white hover:bg-[#380305] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                          >
                            {isPending ? "Saving..." : "Save Title"}
                          </button>
                        </div>
                      </form>
                    ) : null}

                    {isReplacing ? (
                      <form
                        onSubmit={(e) => handleReplaceSubmit(e, doc.id)}
                        className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-3"
                      >
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <label
                              htmlFor={`replace-title-${doc.id}`}
                              className="block text-xs font-medium text-slate-700"
                            >
                              Document Title
                            </label>
                            <input
                              id={`replace-title-${doc.id}`}
                              name="title"
                              type="text"
                              required
                              minLength={2}
                              maxLength={160}
                              defaultValue={doc.title}
                              disabled={isReplacingUpload}
                              className="min-h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20 disabled:opacity-60"
                            />
                          </div>
                          <div className="space-y-1">
                            <label
                              htmlFor={`replace-file-${doc.id}`}
                              className="block text-xs font-medium text-slate-700"
                            >
                              Replacement PDF File (max 25 MB)
                            </label>
                            <input
                              id={`replace-file-${doc.id}`}
                              name="file"
                              type="file"
                              required
                              accept=".pdf,application/pdf"
                              disabled={isReplacingUpload}
                              className="block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 file:mr-2.5 file:rounded file:border-0 file:bg-slate-100 file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-slate-800 hover:file:bg-slate-200 disabled:opacity-60"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-slate-500">
                          The new PDF is uploaded directly to private storage
                          and verified before the previous file is deleted.
                        </p>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setReplacingDocId(null)}
                            className="min-h-8 rounded border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={isBusy}
                            className="min-h-8 rounded bg-[#4B0507] px-3 py-1 text-xs font-medium text-white hover:bg-[#380305] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                          >
                            {replaceStage
                              ? getStageButtonLabel(replaceStage, "replace")
                              : "Upload Replacement"}
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          {/* Upload New PDF Form */}
          <form
            ref={uploadFormRef}
            onSubmit={handleUploadSubmit}
            className="rounded-md border border-slate-200 bg-slate-50/70 p-4 space-y-4"
          >

            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Attach PDF to Round
              </h3>
              <p className="text-xs text-slate-600">
                PDF files only (`application/pdf`), up to 25 MB per file.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="new-document-title"
                  className="block text-xs font-medium text-slate-700"
                >
                  Readable Title
                </label>
                <input
                  id="new-document-title"
                  name="title"
                  type="text"
                  required
                  minLength={2}
                  maxLength={160}
                  disabled={isUploading}
                  placeholder="e.g., Round 1 Case Brief"
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20 disabled:opacity-60"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="new-document-file"
                  className="block text-xs font-medium text-slate-700"
                >
                  PDF File (max 25 MB)
                </label>
                <input
                  id="new-document-file"
                  name="file"
                  type="file"
                  required
                  accept=".pdf,application/pdf"
                  disabled={isUploading}
                  className="block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-800 hover:file:bg-slate-200 disabled:opacity-60"
                />
              </div>
            </div>

            {uploadState ? (
              <div className="space-y-2">
                <div
                  role={uploadState.ok ? "status" : "alert"}
                  aria-live="polite"
                  className={`rounded-md border px-3 py-2.5 text-sm ${
                    uploadState.ok
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-red-200 bg-red-50 text-red-900"
                  }`}
                >
                  {uploadState.message}
                </div>
                {uploadState.warning ? (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950"
                  >
                    <AlertTriangle
                      className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"
                      aria-hidden="true"
                    />
                    <span>{uploadState.warning}</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isBusy}
                className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#4B0507] px-4 py-2 text-sm font-medium whitespace-nowrap text-white hover:bg-[#380305] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
              >
                <Upload className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {uploadStage
                    ? getStageButtonLabel(uploadStage, "upload")
                    : "Upload PDF"}
                </span>
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
