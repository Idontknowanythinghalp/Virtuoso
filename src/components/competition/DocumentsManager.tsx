"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileArchive,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  Lock,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  deleteDocumentAction,
  getDocumentSignedUrlAction,
  uploadDocumentAction,
} from "@/app/actions/documents";
import type { CompetitionDocumentView } from "@/types/data-operations";
import type { EventRecord, RoundRecord } from "@/types/competition";

interface DocumentsManagerProps {
  event: EventRecord;
  round?: RoundRecord | null;
  availableRounds?: RoundRecord[];
  initialDocuments: CompetitionDocumentView[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileIcon(fileName: string, mimeType: string) {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "pdf" || mimeType.includes("pdf")) {
    return <FileText className="h-4 w-4 text-red-600" />;
  }
  if (ext === "xlsx" || ext === "xls" || ext === "csv" || mimeType.includes("spreadsheet") || mimeType.includes("csv")) {
    return <FileSpreadsheet className="h-4 w-4 text-emerald-600" />;
  }
  if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "webp" || mimeType.includes("image")) {
    return <FileImage className="h-4 w-4 text-blue-600" />;
  }
  if (ext === "zip") {
    return <FileArchive className="h-4 w-4 text-amber-600" />;
  }
  return <FileCode className="h-4 w-4 text-slate-600" />;
}

export function DocumentsManager({
  event,
  round,
  availableRounds = [],
  initialDocuments,
}: DocumentsManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [documents, setDocuments] =
    useState<CompetitionDocumentView[]>(initialDocuments);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [selectedRoundId, setSelectedRoundId] = useState<string>(
    round?.id ?? "",
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Delete modal state
  const [confirmDeleteDoc, setConfirmDeleteDoc] =
    useState<CompetitionDocumentView | null>(null);

  // Downloading signed URL state
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setFeedback({ type: "error", message: "Please choose a file to upload." });
      return;
    }

    setFeedback(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("eventId", event.id);
      if (selectedRoundId) {
        fd.append("roundId", selectedRoundId);
      }
      fd.append("title", uploadTitle.trim());
      fd.append("description", uploadDescription.trim());
      fd.append("file", selectedFile);

      const res = await uploadDocumentAction(fd);

      if (!res.ok) {
        setFeedback({ type: "error", message: res.message });
      } else {
        setFeedback({ type: "success", message: res.message });
        setShowUploadModal(false);
        setUploadTitle("");
        setUploadDescription("");
        setSelectedFile(null);
        router.refresh();
      }
    });
  };

  const handleDownload = async (doc: CompetitionDocumentView) => {
    setDownloadingDocId(doc.id);
    setFeedback(null);

    try {
      const res = await getDocumentSignedUrlAction(event.id, doc.id);
      if (!res.ok || !res.signedUrl) {
        setFeedback({
          type: "error",
          message: res.message ?? "Could not generate download link.",
        });
      } else {
        // Open signed URL in new tab / download
        window.open(res.signedUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      setFeedback({
        type: "error",
        message: "Failed to obtain signed URL for document.",
      });
    } finally {
      setDownloadingDocId(null);
    }
  };

  const handleDelete = () => {
    if (!confirmDeleteDoc) return;

    setFeedback(null);
    startTransition(async () => {
      const res = await deleteDocumentAction(event.id, confirmDeleteDoc.id);

      if (!res.ok) {
        setFeedback({ type: "error", message: res.message });
      } else {
        setFeedback({ type: "success", message: res.message });
        setConfirmDeleteDoc(null);
        router.refresh();
      }
    });
  };

  return (
    <section
      aria-labelledby="documents-heading"
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-[#4B0507]" />
            <h2
              id="documents-heading"
              className="font-display text-lg font-bold text-slate-900"
            >
              Private Competition Documents
            </h2>
            <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-700">
              Private Bucket
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Secure storage for case briefs, round prompts, rubric guidelines, and event materials. Only accessible by authenticated committee members via short-lived signed URLs.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-1.5 rounded-md bg-[#4B0507] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#380405] transition-colors cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Upload Document</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-md p-3 text-xs ${
            feedback.type === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {documents.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-500">
          No documents attached to this {round ? "round" : "event"} yet. Click &quot;Upload Document&quot; to add private competition materials.
        </div>
      ) : (
        <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex flex-wrap items-center justify-between gap-3 p-3.5 hover:bg-slate-50/50 transition-colors"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="mt-0.5 shrink-0">
                  {getFileIcon(doc.file_name, doc.mime_type)}
                </div>
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-slate-900 truncate">
                      {doc.title}
                    </span>
                    {doc.round_id ? (
                      <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-800">
                        Round {doc.round?.round_number ?? "Specific"}
                      </span>
                    ) : (
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">
                        Event-Wide
                      </span>
                    )}
                  </div>
                  <p className="font-mono text-[11px] text-slate-500 truncate">
                    {doc.file_name} · {formatBytes(doc.file_size_bytes)}
                  </p>
                  {doc.description && (
                    <p className="text-[11px] text-slate-600 line-clamp-1">
                      {doc.description}
                    </p>
                  )}
                  <p className="text-[10px] text-slate-400">
                    Uploaded {new Date(doc.created_at).toLocaleDateString()}
                    {doc.uploaded_by_profile
                      ? ` by ${doc.uploaded_by_profile.full_name}`
                      : ""}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownload(doc)}
                  disabled={downloadingDocId === doc.id}
                  className="flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {downloadingDocId === doc.id ? (
                    <RefreshCw className="h-3 w-3 animate-spin text-[#4B0507]" />
                  ) : (
                    <Download className="h-3 w-3 text-slate-600" />
                  )}
                  <span>Access Document</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteDoc(doc)}
                  className="flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
                  title="Delete Document"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-[#4B0507]" />
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Upload Private Document
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-3 text-xs">
              <div>
                <label
                  htmlFor="doc-title-input"
                  className="block font-semibold text-slate-700"
                >
                  Document Title *
                </label>
                <input
                  id="doc-title-input"
                  type="text"
                  required
                  placeholder="e.g. Round 1 Case Brief & Guidelines"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-[#4B0507] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="doc-desc-input"
                  className="block font-semibold text-slate-700"
                >
                  Description (Optional)
                </label>
                <textarea
                  id="doc-desc-input"
                  rows={2}
                  placeholder="Brief note or instructions regarding this document"
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-[#4B0507] focus:outline-none"
                />
              </div>

              {!round && availableRounds.length > 0 && (
                <div>
                  <label
                    htmlFor="doc-round-select"
                    className="block font-semibold text-slate-700"
                  >
                    Attach to Scope
                  </label>
                  <select
                    id="doc-round-select"
                    value={selectedRoundId}
                    onChange={(e) => setSelectedRoundId(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-[#4B0507] focus:outline-none"
                  >
                    <option value="">Event-Wide (Applies across all rounds)</option>
                    {availableRounds.map((r) => (
                      <option key={r.id} value={r.id}>
                        Round {r.round_number}: {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label
                  htmlFor="doc-file-input"
                  className="block font-semibold text-slate-700"
                >
                  File (PDF, Word, Excel, PPT, Text, CSV, Images, ZIP up to 25 MB) *
                </label>
                <input
                  id="doc-file-input"
                  type="file"
                  required
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.webp,.zip"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setSelectedFile(e.target.files[0]);
                      if (!uploadTitle) {
                        // Default title from filename
                        const raw = e.target.files[0].name.replace(/\.[^.]+$/, "");
                        setUploadTitle(raw.replace(/[-_]/g, " "));
                      }
                    }
                  }}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900 file:mr-2 file:rounded file:border-0 file:bg-[#4B0507] file:px-2 file:py-1 file:text-xs file:font-semibold file:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || !selectedFile || !uploadTitle.trim()}
                  className="flex items-center gap-1.5 rounded-md bg-[#4B0507] px-3 py-1.5 font-semibold text-white hover:bg-[#380405] disabled:opacity-50 cursor-pointer"
                >
                  {isPending ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-3.5 w-3.5" />
                      <span>Upload Securely</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 shadow-lg space-y-4">
            <div className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              <h3 className="font-display text-sm font-bold text-slate-900">
                Delete Competition Document?
              </h3>
            </div>
            <p className="text-xs text-slate-600">
              Are you sure you want to permanently delete{" "}
              <strong>&quot;{confirmDeleteDoc.title}&quot;</strong> ({confirmDeleteDoc.file_name})? This action will remove the file from storage and cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setConfirmDeleteDoc(null)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer"
              >
                {isPending ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
