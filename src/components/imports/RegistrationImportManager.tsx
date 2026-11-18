"use client";

import React, { useState, useTransition } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  History,
  Layers,
  RefreshCw,
  Search,
  Upload,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import {
  commitRegistrationImportAction,
  parseRegistrationFileAction,
  previewRegistrationImportAction,
} from "@/app/actions/registration-import";
import {
  TARGET_FIELD_DEFINITIONS,
} from "@/lib/import/column-mapper";
import type {
  CmsTargetField,
  ColumnMappingItem,
  ImportExecutionResult,
  ImportPreviewResult,
  RegistrationImportRecord,
} from "@/types/data-operations";

interface RegistrationImportManagerProps {
  initialHistory: RegistrationImportRecord[];
}

type ImportStep = "upload" | "mapping" | "preview" | "complete";

export function RegistrationImportManager({
  initialHistory,
}: RegistrationImportManagerProps) {
  const [step, setStep] = useState<ImportStep>("upload");
  const [isPending, startTransition] = useTransition();

  // Step 1: Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Step 2: Mapping state
  const [fileName, setFileName] = useState("");
  const [fileSizeBytes, setFileSizeBytes] = useState(0);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mappings, setMappings] = useState<ColumnMappingItem[]>([]);

  // Step 3: Preview state
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [applyUpdates, setApplyUpdates] = useState<boolean>(true);
  const [previewTab, setPreviewTab] = useState<
    "overview" | "new" | "errors" | "missing" | "duplicates"
  >("overview");

  // Step 4: Results
  const [executionResult, setExecutionResult] =
    useState<ImportExecutionResult | null>(null);
  const [history, setHistory] =
    useState<RegistrationImportRecord[]>(initialHistory);
  const [activeTab, setActiveTab] = useState<"import" | "history">("import");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError("Please select a file to upload.");
      return;
    }

    setUploadError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("file", selectedFile);
      const res = await parseRegistrationFileAction(fd);

      if (!res.ok) {
        setUploadError(res.message);
        return;
      }

      setFileName(res.fileName ?? selectedFile.name);
      setFileSizeBytes(res.fileSizeBytes ?? selectedFile.size);
      setHeaders(res.headers ?? []);
      setRawRows(res.rows ?? []);
      setMappings(res.mappings ?? []);
      setStep("mapping");
    });
  };

  const handleMappingChange = (sourceColumn: string, newTarget: CmsTargetField) => {
    setMappings((prev) =>
      prev.map((m) =>
        m.sourceColumn === sourceColumn ? { ...m, targetField: newTarget } : m,
      ),
    );
  };

  const handleProceedToPreview = () => {
    startTransition(async () => {
      const res = await previewRegistrationImportAction({
        fileName,
        fileSizeBytes,
        rows: rawRows,
        mappings,
      });

      if (!res.ok || !res.preview) {
        setUploadError(res.message);
        return;
      }

      setPreview(res.preview);
      setStep("preview");
    });
  };

  const handleExecuteImport = () => {
    if (!preview) return;

    startTransition(async () => {
      const res = await commitRegistrationImportAction({
        preview,
        applyUpdatesToExisting: applyUpdates,
      });

      setExecutionResult(res);
      setStep("complete");
    });
  };

  const handleReset = () => {
    setSelectedFile(null);
    setUploadError(null);
    setFileName("");
    setHeaders([]);
    setRawRows([]);
    setMappings([]);
    setPreview(null);
    setExecutionResult(null);
    setStep("upload");
  };

  return (
    <div className="space-y-6">
      {/* Top Navigation Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab("import")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
            activeTab === "import"
              ? "border-[#4B0507] text-[#4B0507]"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <Upload className="h-4 w-4" />
          <span>Import Registration Data</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
            activeTab === "history"
              ? "border-[#4B0507] text-[#4B0507]"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <History className="h-4 w-4" />
          <span>Import History ({history.length})</span>
        </button>
      </div>

      {activeTab === "history" ? (
        /* History View */
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white shadow-xs">
            <div className="border-b border-slate-200 p-4">
              <h2 className="font-display text-lg font-bold text-slate-900">
                Registration Import Audit History
              </h2>
              <p className="text-xs text-slate-500">
                Log of all previous CSV and Excel registration imports.
              </p>
            </div>
            {history.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No import history recorded yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {history.map((record) => (
                  <div key={record.id} className="p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 text-[#4B0507]" />
                        <span className="font-mono text-sm font-semibold text-slate-900">
                          {record.file_name}
                        </span>
                        <span className="text-xs text-slate-500">
                          ({(record.file_size_bytes / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{new Date(record.created_at).toLocaleString()}</span>
                        <span>· By {record.imported_by_email || "Organiser"}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                      <div className="rounded-md bg-slate-50 p-2 text-center">
                        <span className="block font-medium text-slate-500">Rows</span>
                        <span className="font-bold text-slate-800">{record.total_rows}</span>
                      </div>
                      <div className="rounded-md bg-emerald-50 p-2 text-center">
                        <span className="block font-medium text-emerald-700">Contingents</span>
                        <span className="font-bold text-emerald-900">
                          +{record.created_contingents_count} / ~{record.updated_contingents_count}
                        </span>
                      </div>
                      <div className="rounded-md bg-emerald-50 p-2 text-center">
                        <span className="block font-medium text-emerald-700">Participants</span>
                        <span className="font-bold text-emerald-900">
                          +{record.created_participants_count} / ~{record.updated_participants_count}
                        </span>
                      </div>
                      <div className="rounded-md bg-blue-50 p-2 text-center">
                        <span className="block font-medium text-blue-700">Event Entries</span>
                        <span className="font-bold text-blue-900">
                          +{record.created_entries_count}
                        </span>
                      </div>
                      <div className="rounded-md bg-amber-50 p-2 text-center">
                        <span className="block font-medium text-amber-700">Skipped/Errors</span>
                        <span className="font-bold text-amber-900">
                          {record.skipped_records_count} / {record.rejected_records_count}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Import Wizard */
        <div className="space-y-6">
          {/* Progress Indicator */}
          <div className="grid grid-cols-4 gap-2 text-center text-xs font-semibold">
            <div
              className={`rounded-md p-2 border ${
                step === "upload"
                  ? "border-[#4B0507] bg-[#4B0507] text-white"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              1. File Upload
            </div>
            <div
              className={`rounded-md p-2 border ${
                step === "mapping"
                  ? "border-[#4B0507] bg-[#4B0507] text-white"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              2. Column Mapping
            </div>
            <div
              className={`rounded-md p-2 border ${
                step === "preview"
                  ? "border-[#4B0507] bg-[#4B0507] text-white"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              3. Validation Preview
            </div>
            <div
              className={`rounded-md p-2 border ${
                step === "complete"
                  ? "border-[#4B0507] bg-[#4B0507] text-white"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              4. Complete
            </div>
          </div>

          {/* STEP 1: FILE UPLOAD */}
          {step === "upload" && (
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-xs">
              <h2 className="font-display text-lg font-bold text-slate-900">
                Upload Registration File
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Select an exported CSV or Excel (.xlsx) file containing institutional contingents, student participants, or event entries.
              </p>

              <form onSubmit={handleUploadSubmit} className="mt-6 space-y-4">
                <div className="rounded-lg border-2 border-dashed border-slate-300 p-8 text-center hover:border-slate-400 transition-colors">
                  <FileSpreadsheet className="mx-auto h-12 w-12 text-slate-400" />
                  <label
                    htmlFor="registration-file-input"
                    className="mt-3 block text-sm font-semibold text-[#4B0507] hover:underline cursor-pointer"
                  >
                    Click to browse or drag and drop your file here
                  </label>
                  <input
                    id="registration-file-input"
                    type="file"
                    accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Supports .CSV and .XLSX (up to 10 MB). Safe passive parsing; macros are never executed.
                  </p>
                  {selectedFile && (
                    <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800">
                      <FileText className="h-4 w-4 text-[#4B0507]" />
                      <span>{selectedFile.name}</span>
                      <span className="text-slate-500">
                        ({(selectedFile.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                  )}
                </div>

                {uploadError && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{uploadError}</span>
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={!selectedFile || isPending}
                    className="flex items-center gap-2 rounded-md bg-[#4B0507] px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-[#380405] disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {isPending ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>Parsing File...</span>
                      </>
                    ) : (
                      <>
                        <span>Continue to Mapping</span>
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* STEP 2: FLEXIBLE COLUMN MAPPING */}
          {step === "mapping" && (
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-xs space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-4">
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    Map Source Columns to CMS Fields
                  </h2>
                  <p className="text-xs text-slate-500">
                    File: <span className="font-semibold text-slate-800">{fileName}</span> ({rawRows.length} rows detected). Verify auto-detected matches below.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Choose Different File
                </button>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-12 gap-3 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 bg-slate-50 rounded-md">
                  <div className="col-span-4">Source File Column</div>
                  <div className="col-span-3">Sample Values</div>
                  <div className="col-span-5">Maps to Virtuoso Field</div>
                </div>

                <div className="divide-y divide-slate-100">
                  {mappings.map((item) => (
                    <div
                      key={item.sourceColumn}
                      className="grid grid-cols-12 gap-3 items-center py-2.5 px-3 hover:bg-slate-50/50 rounded-md text-xs"
                    >
                      <div className="col-span-4 font-mono font-semibold text-slate-900 truncate">
                        {item.sourceColumn}
                      </div>
                      <div className="col-span-3 text-slate-500 truncate">
                        {item.sampleValues.join(", ") || "(empty)"}
                      </div>
                      <div className="col-span-5">
                        <select
                          value={item.targetField}
                          onChange={(e) =>
                            handleMappingChange(
                              item.sourceColumn,
                              e.target.value as CmsTargetField,
                            )
                          }
                          className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#4B0507] focus:outline-none"
                        >
                          <optgroup label="Common Fields">
                            <option value="ignore">-- Ignore this column --</option>
                          </optgroup>
                          <optgroup label="Contingent Fields">
                            {TARGET_FIELD_DEFINITIONS.filter(
                              (f) => f.category === "Contingent",
                            ).map((f) => (
                              <option key={f.field} value={f.field}>
                                {f.label}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Participant Fields">
                            {TARGET_FIELD_DEFINITIONS.filter(
                              (f) => f.category === "Participant",
                            ).map((f) => (
                              <option key={f.field} value={f.field}>
                                {f.label}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Event Entry Fields">
                            {TARGET_FIELD_DEFINITIONS.filter(
                              (f) => f.category === "Event Entry",
                            ).map((f) => (
                              <option key={f.field} value={f.field}>
                                {f.label}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setStep("upload")}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleProceedToPreview}
                  disabled={isPending}
                  className="flex items-center gap-2 rounded-md bg-[#4B0507] px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-[#380405] disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Validating Preview...</span>
                    </>
                  ) : (
                    <>
                      <span>Proceed to Preview</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: PREVIEW & NON-DESTRUCTIVE REVIEW */}
          {step === "preview" && preview && (
            <div className="space-y-6">
              {/* Stat Summary Cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>Valid Records</span>
                  </div>
                  <p className="mt-2 text-2xl font-bold text-slate-900">
                    {preview.validRowsCount}{" "}
                    <span className="text-xs font-normal text-slate-500">
                      / {preview.totalRows}
                    </span>
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <span>Invalid / Errors</span>
                  </div>
                  <p className="mt-2 text-2xl font-bold text-red-600">
                    {preview.invalidRowsCount}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <Users className="h-4 w-4 text-blue-600" />
                    <span>New Contingents</span>
                  </div>
                  <p className="mt-2 text-2xl font-bold text-blue-600">
                    +{preview.newContingents.length}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <UserCheck className="h-4 w-4 text-indigo-600" />
                    <span>New Participants</span>
                  </div>
                  <p className="mt-2 text-2xl font-bold text-indigo-600">
                    +{preview.newParticipants.length}
                  </p>
                </div>
              </div>

              {/* Sub-Tabs */}
              <div className="rounded-lg border border-slate-200 bg-white shadow-xs">
                <div className="flex flex-wrap border-b border-slate-200 px-4">
                  <button
                    type="button"
                    onClick={() => setPreviewTab("overview")}
                    className={`border-b-2 py-3 px-3 text-xs font-semibold transition-colors ${
                      previewTab === "overview"
                        ? "border-[#4B0507] text-[#4B0507]"
                        : "border-transparent text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Overview &amp; Diffs ({preview.differences.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab("new")}
                    className={`border-b-2 py-3 px-3 text-xs font-semibold transition-colors ${
                      previewTab === "new"
                        ? "border-[#4B0507] text-[#4B0507]"
                        : "border-transparent text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    New Records (+{preview.newContingents.length + preview.newParticipants.length + preview.newEntries.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab("errors")}
                    className={`border-b-2 py-3 px-3 text-xs font-semibold transition-colors ${
                      previewTab === "errors"
                        ? "border-[#4B0507] text-[#4B0507]"
                        : "border-transparent text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Validation Errors ({preview.errors.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab("missing")}
                    className={`border-b-2 py-3 px-3 text-xs font-semibold transition-colors ${
                      previewTab === "missing"
                        ? "border-[#4B0507] text-[#4B0507]"
                        : "border-transparent text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Missing from Import ({preview.missingFromImport.length})
                  </button>
                </div>

                <div className="p-4">
                  {/* OVERVIEW & DIFFS */}
                  {previewTab === "overview" && (
                    <div className="space-y-4">
                      {preview.differences.length > 0 ? (
                        <div className="space-y-3">
                          <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                            <div>
                              <p className="font-semibold">
                                Changes detected in {preview.differences.length} existing record field(s).
                              </p>
                              <p className="mt-0.5">
                                Re-importing never overwrites without confirmation. You can choose whether to apply these permitted field updates below.
                              </p>
                            </div>
                          </div>

                          <label className="flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={applyUpdates}
                              onChange={(e) => setApplyUpdates(e.target.checked)}
                              className="rounded border-slate-300 text-[#4B0507] focus:ring-[#4B0507]"
                            />
                            <span>
                              Apply permitted updates to existing records (e.g. updated phone numbers, emails, or institution cities).
                            </span>
                          </label>

                          <div className="overflow-x-auto rounded-md border border-slate-200">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                                <tr>
                                  <th className="p-2.5">Type</th>
                                  <th className="p-2.5">Identifier</th>
                                  <th className="p-2.5">Record Name</th>
                                  <th className="p-2.5">Field Changed</th>
                                  <th className="p-2.5">Existing Value in DB</th>
                                  <th className="p-2.5">Incoming File Value</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {preview.differences.map((diff, dIdx) => (
                                  <tr key={dIdx} className="hover:bg-slate-50/50">
                                    <td className="p-2.5 font-medium capitalize text-slate-700">
                                      {diff.entityType}
                                    </td>
                                    <td className="p-2.5 font-mono text-slate-900">
                                      {diff.identifier}
                                    </td>
                                    <td className="p-2.5 text-slate-800">{diff.name}</td>
                                    <td className="p-2.5 font-semibold text-[#4B0507]">
                                      {diff.field}
                                    </td>
                                    <td className="p-2.5 text-slate-500 line-through">
                                      {diff.oldValue || "(empty)"}
                                    </td>
                                    <td className="p-2.5 font-semibold text-emerald-700">
                                      {diff.newValue || "(empty)"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">
                          No differences detected in existing records. All matched existing records match database values.
                        </p>
                      )}
                    </div>
                  )}

                  {/* NEW RECORDS */}
                  {previewTab === "new" && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold uppercase text-slate-500">
                          New Contingents ({preview.newContingents.length})
                        </h4>
                        {preview.newContingents.length === 0 ? (
                          <p className="text-xs text-slate-500">No new contingents to create.</p>
                        ) : (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {preview.newContingents.map((c) => (
                              <div
                                key={c.code}
                                className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs"
                              >
                                <span className="font-mono font-bold text-[#4B0507]">
                                  {c.code}
                                </span>{" "}
                                · <span className="font-semibold text-slate-900">{c.name}</span>
                                <p className="text-slate-500">{c.institutionName}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        <h4 className="text-xs font-bold uppercase text-slate-500">
                          New Participants ({preview.newParticipants.length})
                        </h4>
                        {preview.newParticipants.length === 0 ? (
                          <p className="text-xs text-slate-500">No new participants to create.</p>
                        ) : (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {preview.newParticipants.map((p) => (
                              <div
                                key={p.code}
                                className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs"
                              >
                                <span className="font-mono font-bold text-[#4B0507]">
                                  {p.code}
                                </span>{" "}
                                · <span className="font-semibold text-slate-900">{p.fullName}</span>
                                <p className="text-slate-500">
                                  {p.institutionName}
                                  {p.contingentCode ? ` (Team: ${p.contingentCode})` : ""}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ERRORS */}
                  {previewTab === "errors" && (
                    <div className="space-y-3">
                      {preview.errors.length === 0 ? (
                        <p className="text-xs text-emerald-700 font-semibold flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>No validation errors found! All rows passed format checks.</span>
                        </p>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {preview.errors.map((err, eIdx) => (
                            <div key={eIdx} className="py-2 flex items-start gap-2 text-xs text-red-700">
                              <XCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
                              <div>
                                <span className="font-bold">Row {err.rowNumber}:</span>{" "}
                                <span>{err.message}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* MISSING RECORDS (Critical Non-Destructive Flag) */}
                  {previewTab === "missing" && (
                    <div className="space-y-3">
                      <div className="rounded-md bg-blue-50 p-3 text-xs text-blue-900 flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
                        <div>
                          <p className="font-semibold">
                            {preview.missingFromImport.length} active database record(s) were not found in this incoming file.
                          </p>
                          <p className="mt-0.5">
                            Virtuoso CMS follows strict non-destructive principles. These records will be <strong>safely preserved</strong>; none will be automatically deleted, withdrawn, or altered.
                          </p>
                        </div>
                      </div>

                      {preview.missingFromImport.length > 0 && (
                        <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 rounded-md border border-slate-200">
                          {preview.missingFromImport.map((m, mIdx) => (
                            <div key={mIdx} className="p-2 text-xs flex items-center justify-between">
                              <div>
                                <span className="font-mono font-semibold text-slate-800">
                                  {m.code}
                                </span>{" "}
                                · <span>{m.name}</span>
                                <span className="text-slate-500"> ({m.institutionName})</span>
                              </div>
                              <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 uppercase">
                                {m.entityType}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-between border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setStep("mapping")}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Back to Mapping
                </button>
                <button
                  type="button"
                  onClick={handleExecuteImport}
                  disabled={isPending}
                  className="flex items-center gap-2 rounded-md bg-[#4B0507] px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-[#380405] disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Executing Safe Import...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Confirm &amp; Execute Import</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: EXECUTION RESULTS */}
          {step === "complete" && executionResult && (
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-xs text-center space-y-4">
              {executionResult.ok ? (
                <>
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <h3 className="font-display text-xl font-bold text-slate-900">
                    Registration Import Complete!
                  </h3>
                  <p className="max-w-md mx-auto text-sm text-slate-600">
                    {executionResult.message}
                  </p>
                  {executionResult.stats && (
                    <div className="max-w-md mx-auto grid grid-cols-3 gap-2 text-xs pt-4 border-t border-slate-100">
                      <div className="rounded bg-slate-50 p-2 text-center">
                        <span className="block text-slate-500">Contingents</span>
                        <span className="font-bold text-emerald-800">
                          +{executionResult.stats.createdContingents}
                        </span>
                      </div>
                      <div className="rounded bg-slate-50 p-2 text-center">
                        <span className="block text-slate-500">Participants</span>
                        <span className="font-bold text-emerald-800">
                          +{executionResult.stats.createdParticipants}
                        </span>
                      </div>
                      <div className="rounded bg-slate-50 p-2 text-center">
                        <span className="block text-slate-500">Event Entries</span>
                        <span className="font-bold text-blue-800">
                          +{executionResult.stats.createdEntries}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
                    <XCircle className="h-8 w-8" />
                  </div>
                  <h3 className="font-display text-xl font-bold text-slate-900">
                    Import Failed
                  </h3>
                  <p className="max-w-md mx-auto text-sm text-red-600">
                    {executionResult.message}
                  </p>
                </>
              )}

              <div className="pt-4 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Import Another File
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("history")}
                  className="rounded-md bg-[#4B0507] px-4 py-2 text-sm font-semibold text-white hover:bg-[#380405] transition-colors"
                >
                  View Import History
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
