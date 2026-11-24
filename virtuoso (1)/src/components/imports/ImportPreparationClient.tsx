"use client";

import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  History,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Upload,
  XCircle,
} from "lucide-react";
import {
  ALL_TARGET_FIELD_KEYS,
  IMPORT_FIELD_BY_KEY,
  IMPORT_FIELD_DEFINITIONS,
  createEmptyMapping,
  getSchemaBaselineRequiredFields,
  suggestColumnMappings,
} from "@/lib/imports/fields";
import {
  CODENAME_MODE_LABELS,
  ENTRY_MODE_LABELS,
  ENTRY_STATUS_LABELS,
  EVENT_STATUS_LABELS,
} from "@/types/competition";
import type {
  ColumnMappingState,
  EntityResolutionChoice,
  ExistingMatchResolutionAction,
  IdentityConflictNotice,
  ImportEventOption,
  ImportExecutionResult,
  ImportResolutionContext,
  ImportTargetEntity,
  ImportTargetFieldKey,
  ImportValidationReport,
  ParsedImportWorkbook,
  RegistrationImportHistoryItem,
} from "@/types/imports";

interface ImportPreparationClientProps {
  events: ImportEventOption[];
  migrationMissing?: boolean;
  initialEventId?: string;
  initialHistory?: RegistrationImportHistoryItem[];
  historyMigrationMissing?: boolean;
}

type WorkflowStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
type PreviewFilter =
  | "all"
  | "valid"
  | "invalid"
  | "conflicts"
  | "duplicates"
  | "existing_matches"
  | "skipped";

const STEP_LABELS: Array<{ step: WorkflowStep; title: string }> = [
  { step: 1, title: "Select Event" },
  { step: 2, title: "Upload File" },
  { step: 3, title: "Inspect Columns" },
  { step: 4, title: "Map Columns" },
  { step: 5, title: "Validate" },
  { step: 6, title: "Preview & Resolve" },
  { step: 7, title: "Confirm & Execute" },
  { step: 8, title: "Summary & History" },
];

const ENTITY_SECTION_META: Array<{
  entity: ImportTargetEntity;
  heading: string;
  description: string;
}> = [
  {
    entity: "contingent",
    heading: "Contingent & Institution Fields",
    description:
      "Maps to public.contingents (and shares institution_name with participants).",
  },
  {
    entity: "participant",
    heading: "Participant Fields",
    description:
      "Maps to public.participants. Contingent members share a contingent code across rows.",
  },
  {
    entity: "event_entry",
    heading: "Event Entry & Cross-Check Fields",
    description:
      "Maps to public.event_entries or cross-checks source event references against the selected event.",
  },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTimestamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function generateIdempotencyKey(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return `imp-${globalThis.crypto.randomUUID()}`;
  }
  return `imp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function buildDefaultResolutions(
  context: ImportResolutionContext | null,
): Record<string, EntityResolutionChoice> {
  const out: Record<string, EntityResolutionChoice> = {};
  if (!context) return out;
  for (const item of context.matchedRecords) {
    out[item.matchKey] = {
      action: "reuse",
      approvedFields: [],
    };
  }
  return out;
}

export function ImportPreparationClient({
  events,
  migrationMissing = false,
  initialEventId,
  initialHistory = [],
  historyMigrationMissing: initialHistoryMigrationMissing = false,
}: ImportPreparationClientProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [step, setStep] = useState<WorkflowStep>(1);
  const [selectedEventId, setSelectedEventId] = useState<string>(
    initialEventId ??
      events.find((e) => e.status !== "archived")?.id ??
      events[0]?.id ??
      "",
  );

  const [workbook, setWorkbook] = useState<ParsedImportWorkbook | null>(null);
  const [mapping, setMapping] = useState<ColumnMappingState>(() =>
    createEmptyMapping(),
  );
  const [organiserRequiredFields, setOrganiserRequiredFields] = useState<
    ImportTargetFieldKey[]
  >([]);
  const [report, setReport] = useState<ImportValidationReport | null>(null);
  const [resolutionContext, setResolutionContext] =
    useState<ImportResolutionContext | null>(null);
  const [entityResolutions, setEntityResolutions] = useState<
    Record<string, EntityResolutionChoice>
  >({});
  const [skippedRowNumbers, setSkippedRowNumbers] = useState<number[]>([]);

  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    generateIdempotencyKey(),
  );
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [executionResult, setExecutionResult] =
    useState<ImportExecutionResult | null>(null);

  const [historyItems, setHistoryItems] =
    useState<RegistrationImportHistoryItem[]>(initialHistory);
  const [historyMigrationMissing, setHistoryMigrationMissing] = useState(
    initialHistoryMigrationMissing,
  );
  const [historyBusy, setHistoryBusy] = useState(false);

  const [parseBusy, setParseBusy] = useState(false);
  const [validateBusy, setValidateBusy] = useState(false);
  const [executeBusy, setExecuteBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewFilter, setPreviewFilter] = useState<PreviewFilter>("all");

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  const baselineRequiredSet = useMemo(() => {
    if (!selectedEvent) return new Set<ImportTargetFieldKey>();
    return new Set(getSchemaBaselineRequiredFields(selectedEvent.entry_mode));
  }, [selectedEvent]);

  const effectiveRequiredSet = useMemo(() => {
    const merged = new Set<ImportTargetFieldKey>(baselineRequiredSet);
    for (const key of organiserRequiredFields) {
      merged.add(key);
    }
    return merged;
  }, [baselineRequiredSet, organiserRequiredFields]);

  const mappedColumnKeys = useMemo(() => {
    const set = new Set<string>();
    for (const key of ALL_TARGET_FIELD_KEYS) {
      const colKey = mapping[key];
      if (colKey) set.add(colKey);
    }
    return set;
  }, [mapping]);

  const unmappedSourceColumns = useMemo(() => {
    if (!workbook) return [];
    return workbook.sheet.columns.filter((col) => !mappedColumnKeys.has(col.key));
  }, [workbook, mappedColumnKeys]);

  const missingRequiredBeforeValidate = useMemo(() => {
    if (!workbook) return [...effectiveRequiredSet];
    const validKeys = new Set(workbook.sheet.columns.map((c) => c.key));
    return ALL_TARGET_FIELD_KEYS.filter(
      (key) =>
        effectiveRequiredSet.has(key) &&
        (!mapping[key] || !validKeys.has(mapping[key]!)),
    );
  }, [workbook, effectiveRequiredSet, mapping]);

  const skippedRowSet = useMemo(
    () => new Set<number>(skippedRowNumbers),
    [skippedRowNumbers],
  );

  // Rows skipped either explicitly or via entity "skip" choice
  const entitySkippedRowSet = useMemo(() => {
    const set = new Set<number>();
    if (!resolutionContext) return set;
    for (const matched of resolutionContext.matchedRecords) {
      const choice = entityResolutions[matched.matchKey];
      if (choice?.action === "skip") {
        for (const r of matched.rowNumbers) {
          set.add(r);
        }
      }
    }
    return set;
  }, [resolutionContext, entityResolutions]);

  const effectiveSkippedRowSet = useMemo(() => {
    const combined = new Set<number>(skippedRowSet);
    for (const r of entitySkippedRowSet) {
      combined.add(r);
    }
    return combined;
  }, [skippedRowSet, entitySkippedRowSet]);

  const conflictRowMap = useMemo(() => {
    const map = new Map<number, IdentityConflictNotice[]>();
    if (!resolutionContext) return map;
    for (const conflict of resolutionContext.identityConflicts ?? []) {
      const existing = map.get(conflict.rowNumber);
      if (existing) {
        existing.push(conflict);
      } else {
        map.set(conflict.rowNumber, [conflict]);
      }
    }
    return map;
  }, [resolutionContext]);

  const readinessCheck = useMemo(() => {
    if (!report || !resolutionContext) {
      return {
        canProceed: false,
        activeRowCount: 0,
        validActiveCount: 0,
        skippedRowCount: 0,
        remainingInvalidCount: 0,
        remainingConflictCount: 0,
        incompleteUpdateLabels: [] as string[],
        inactiveConflictLabels: [] as string[],
        reason: "Run server validation before proceeding.",
      };
    }

    const activeRows = report.previewRows.filter(
      (r) => !effectiveSkippedRowSet.has(r.rowNumber),
    );
    const remainingInvalid = activeRows.filter((r) => r.status === "invalid");
    const remainingConflicts = activeRows.filter((r) =>
      conflictRowMap.has(r.rowNumber),
    );
    const validActiveCount = activeRows.filter(
      (r) => r.status === "valid" && !conflictRowMap.has(r.rowNumber),
    ).length;

    const incompleteUpdateLabels: string[] = [];
    const inactiveConflictLabels: string[] = [];

    for (const matched of resolutionContext.matchedRecords) {
      const choice = entityResolutions[matched.matchKey];
      if (!choice) continue;
      if (choice.action === "update" && choice.approvedFields.length === 0) {
        incompleteUpdateLabels.push(matched.existingLabel);
      }
      if (!matched.existingIsActive && choice.action !== "skip") {
        // Inactive contingent in contingent row or inactive participant in individual row
        const touchesDirectEntry = activeRows.some((r) => {
          if (!matched.rowNumbers.includes(r.rowNumber)) return false;
          if (matched.entity === "contingent") {
            return r.resolvedEntryType === "contingent";
          }
          return r.resolvedEntryType === "individual";
        });
        if (touchesDirectEntry) {
          inactiveConflictLabels.push(matched.existingLabel);
        }
      }
    }

    let reason: string | null = null;
    if (report.event.status === "archived") {
      reason = `Event ${report.event.code} is archived and cannot accept imports.`;
    } else if (remainingConflicts.length > 0) {
      reason = `${remainingConflicts.length} unskipped row(s) have unresolved identity conflicts between existing CMS identifiers. Correct your source file or mapping and revalidate, or skip the affected row(s).`;
    } else if (remainingInvalid.length > 0) {
      reason = `${remainingInvalid.length} unskipped invalid row(s) remain. Fix your file/mapping or mark those rows as skipped.`;
    } else if (activeRows.length === 0) {
      reason = "At least one non-skipped valid row is required to execute an import.";
    } else if (incompleteUpdateLabels.length > 0) {
      reason = `Select at least one field to update for: ${incompleteUpdateLabels[0]}.`;
    } else if (inactiveConflictLabels.length > 0) {
      reason = `Inactive CMS record cannot enter this event unless skipped or reactivated: ${inactiveConflictLabels[0]}.`;
    }

    return {
      canProceed: reason === null,
      activeRowCount: activeRows.length,
      validActiveCount,
      skippedRowCount: effectiveSkippedRowSet.size,
      remainingInvalidCount: remainingInvalid.length,
      remainingConflictCount: remainingConflicts.length,
      incompleteUpdateLabels,
      inactiveConflictLabels,
      reason,
    };
  }, [
    report,
    resolutionContext,
    effectiveSkippedRowSet,
    entityResolutions,
    conflictRowMap,
  ]);

  const approvedUpdatePreviewList = useMemo(() => {
    if (!resolutionContext) return [];
    const items: Array<{ label: string; fields: string[] }> = [];
    for (const matched of resolutionContext.matchedRecords) {
      const choice = entityResolutions[matched.matchKey];
      if (choice?.action === "update" && choice.approvedFields.length > 0) {
        items.push({
          label: matched.existingLabel,
          fields: choice.approvedFields,
        });
      }
    }
    return items;
  }, [resolutionContext, entityResolutions]);

  const maxUnlockedStep: WorkflowStep = executionResult
    ? 8
    : report && readinessCheck.canProceed
      ? 7
      : report
        ? 6
        : workbook
          ? 5
          : selectedEvent
            ? 2
            : 1;

  async function refreshHistoryForEvent(eventId: string) {
    if (!eventId) {
      setHistoryItems([]);
      return;
    }
    setHistoryBusy(true);
    try {
      const response = await fetch(
        `/api/imports/history?eventId=${encodeURIComponent(eventId)}`,
      );
      const payload = (await response.json()) as {
        ok: boolean;
        history?: RegistrationImportHistoryItem[];
        migrationMissing?: boolean;
      };
      if (response.ok && payload.ok) {
        setHistoryItems(payload.history ?? []);
        setHistoryMigrationMissing(Boolean(payload.migrationMissing));
      }
    } catch {
      // Keep previous history intact on transient network failure
    } finally {
      setHistoryBusy(false);
    }
  }

  function resetPreparationOutputs() {
    setReport(null);
    setResolutionContext(null);
    setEntityResolutions({});
    setSkippedRowNumbers([]);
    setConfirmChecked(false);
    setExecutionResult(null);
    setIdempotencyKey(generateIdempotencyKey());
  }

  function handleSelectEvent(nextEventId: string) {
    setSelectedEventId(nextEventId);
    resetPreparationOutputs();
    setErrorMessage(null);
    void refreshHistoryForEvent(nextEventId);
  }

  async function parseUploadedFile(file: File, requestedSheetName?: string) {
    setParseBusy(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (requestedSheetName) {
        formData.append("sheetName", requestedSheetName);
      }

      const response = await fetch("/api/imports/parse", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        workbook?: ParsedImportWorkbook;
      };

      if (!response.ok || !payload.ok || !payload.workbook) {
        setErrorMessage(
          payload.error ?? "Unable to read the uploaded registration file.",
        );
        return;
      }

      setWorkbook(payload.workbook);
      setMapping(suggestColumnMappings(payload.workbook.sheet.columns));
      resetPreparationOutputs();
      setStep(3);
    } catch {
      setErrorMessage(
        "Network error while uploading the file for inspection. Please retry.",
      );
    } finally {
      setParseBusy(false);
    }
  }

  async function handleFileInputChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    setSelectedFile(file);
    await parseUploadedFile(file);
  }

  async function handleSheetChange(nextSheet: string) {
    if (!selectedFile) return;
    await parseUploadedFile(selectedFile, nextSheet);
  }

  function handleTargetMappingChange(
    targetKey: ImportTargetFieldKey,
    columnKey: string,
  ) {
    resetPreparationOutputs();
    setMapping((prev) => ({
      ...prev,
      [targetKey]: columnKey || null,
    }));
  }

  function handleToggleOrganiserRequired(targetKey: ImportTargetFieldKey) {
    if (baselineRequiredSet.has(targetKey)) return;
    resetPreparationOutputs();
    setOrganiserRequiredFields((prev) =>
      prev.includes(targetKey)
        ? prev.filter((item) => item !== targetKey)
        : [...prev, targetKey],
    );
  }

  function handleAutoSuggestMappings() {
    if (!workbook) return;
    resetPreparationOutputs();
    setMapping(suggestColumnMappings(workbook.sheet.columns));
  }

  function handleClearMappings() {
    resetPreparationOutputs();
    setMapping(createEmptyMapping());
  }

  async function handleRunServerValidation() {
    if (!selectedEvent || !workbook) return;
    setValidateBusy(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/imports/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: selectedEvent.id,
          columns: workbook.sheet.columns,
          rows: workbook.sheet.rows,
          mapping,
          requiredFields: organiserRequiredFields,
        }),
      });

      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        report?: ImportValidationReport;
        resolutionContext?: ImportResolutionContext;
      };

      if (!response.ok || !payload.ok || !payload.report) {
        setErrorMessage(
          payload.error ?? "Server validation failed. Check your column mappings.",
        );
        return;
      }

      const nextContext = payload.resolutionContext ?? {
        matchedRecords: [],
        identityConflicts: [],
        missingFromFileEntries: [],
      };
      setReport(payload.report);
      setResolutionContext(nextContext);
      setEntityResolutions(buildDefaultResolutions(nextContext));
      setSkippedRowNumbers([]);
      setConfirmChecked(false);
      setExecutionResult(null);
      setIdempotencyKey(generateIdempotencyKey());
      setPreviewFilter("all");
      setStep(6);
    } catch {
      setErrorMessage(
        "Network error while running server-side import validation. Please retry.",
      );
    } finally {
      setValidateBusy(false);
    }
  }

  function handleToggleSkipRow(rowNumber: number) {
    setConfirmChecked(false);
    setExecutionResult(null);
    setIdempotencyKey(generateIdempotencyKey());
    setSkippedRowNumbers((prev) =>
      prev.includes(rowNumber)
        ? prev.filter((n) => n !== rowNumber)
        : [...prev, rowNumber],
    );
  }

  function handleSkipAllInvalidRows() {
    if (!report) return;
    const invalidNums = report.previewRows
      .filter((r) => r.status === "invalid")
      .map((r) => r.rowNumber);
    setConfirmChecked(false);
    setExecutionResult(null);
    setIdempotencyKey(generateIdempotencyKey());
    setSkippedRowNumbers((prev) =>
      Array.from(new Set([...prev, ...invalidNums])),
    );
  }

  function handleSetEntityAction(
    matchKey: string,
    action: ExistingMatchResolutionAction,
  ) {
    setConfirmChecked(false);
    setExecutionResult(null);
    setIdempotencyKey(generateIdempotencyKey());
    setEntityResolutions((prev) => {
      const current = prev[matchKey] ?? { action: "reuse", approvedFields: [] };
      return {
        ...prev,
        [matchKey]: {
          action,
          approvedFields: action === "update" ? current.approvedFields : [],
        },
      };
    });
  }

  function handleToggleApprovedField(matchKey: string, field: string) {
    setConfirmChecked(false);
    setExecutionResult(null);
    setIdempotencyKey(generateIdempotencyKey());
    setEntityResolutions((prev) => {
      const current = prev[matchKey] ?? { action: "update", approvedFields: [] };
      const exists = current.approvedFields.includes(field);
      const nextFields = exists
        ? current.approvedFields.filter((f) => f !== field)
        : [...current.approvedFields, field];
      return {
        ...prev,
        [matchKey]: {
          action: "update",
          approvedFields: nextFields,
        },
      };
    });
  }

  async function handleExecuteImport() {
    if (!selectedEvent || !workbook || !report || !readinessCheck.canProceed) {
      return;
    }
    if (!confirmChecked) {
      setErrorMessage(
        "Confirm the execution acknowledgement checkbox before running the import.",
      );
      return;
    }

    setExecuteBusy(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/imports/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: selectedEvent.id,
          idempotencyKey,
          sourceFilename: workbook.fileName,
          fileFormat: workbook.fileFormat,
          columns: workbook.sheet.columns,
          rows: workbook.sheet.rows,
          mapping,
          requiredFields: organiserRequiredFields,
          resolutions: {
            entityResolutions,
            skippedRowNumbers,
          },
        }),
      });

      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        rolledBack?: boolean;
        executionResult?: ImportExecutionResult;
      };

      if (!response.ok || !payload.ok || !payload.executionResult) {
        setErrorMessage(
          payload.error ??
            "Import execution failed and was rolled back cleanly. No records were modified.",
        );
        // Generate a fresh key on rollback failure if user fixes or retries
        if (response.status === 409) {
          setIdempotencyKey(generateIdempotencyKey());
        }
        void refreshHistoryForEvent(selectedEvent.id);
        return;
      }

      setExecutionResult(payload.executionResult);
      setStep(8);
      void refreshHistoryForEvent(selectedEvent.id);
    } catch {
      setErrorMessage(
        "Network error while executing the import. Re-try with the same confirmation to safely check idempotency.",
      );
    } finally {
      setExecuteBusy(false);
    }
  }

  const filteredPreviewRows = useMemo(() => {
    if (!report) return [];
    switch (previewFilter) {
      case "valid":
        return report.previewRows.filter(
          (r) =>
            r.status === "valid" &&
            !conflictRowMap.has(r.rowNumber) &&
            !effectiveSkippedRowSet.has(r.rowNumber),
        );
      case "invalid":
        return report.previewRows.filter(
          (r) => r.status === "invalid" && !effectiveSkippedRowSet.has(r.rowNumber),
        );
      case "conflicts":
        return report.previewRows.filter(
          (r) =>
            conflictRowMap.has(r.rowNumber) &&
            !effectiveSkippedRowSet.has(r.rowNumber),
        );
      case "duplicates":
        return report.previewRows.filter((r) => r.inFileDuplicates.length > 0);
      case "existing_matches":
        return report.previewRows.filter((r) => r.existingMatches.length > 0);
      case "skipped":
        return report.previewRows.filter((r) =>
          effectiveSkippedRowSet.has(r.rowNumber),
        );
      default:
        return report.previewRows;
    }
  }, [report, previewFilter, effectiveSkippedRowSet, conflictRowMap]);

  return (
    <div className="space-y-6">
      {migrationMissing ? (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          Stage 2A competition tables are not available yet. Apply migration{" "}
          <code className="font-mono text-xs">
            supabase/migrations/202611160003_stage2a_competition_structure.sql
          </code>{" "}
          before preparing registration imports.
        </div>
      ) : null}

      {historyMigrationMissing ? (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          Stage 2B.2 execution tables are not applied yet. Apply migration{" "}
          <code className="font-mono text-xs">
            supabase/migrations/202611170004_stage2b2_registration_imports.sql
          </code>{" "}
          before executing imports into PostgreSQL.
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
        <div className="flex items-start gap-3">
          <ShieldCheck
            className="mt-0.5 h-4 w-4 shrink-0 text-[#4B0507]"
            aria-hidden="true"
          />
          <p className="leading-relaxed">
            <span className="font-semibold text-slate-900">
              Atomic Non-Destructive Import:
            </span>{" "}
            All imports execute in a single database transaction per event.
            Existing CMS records are never overwritten without explicit field
            approval, and existing event entries missing from a file are
            preserved untouched.
          </p>
        </div>
      </div>

      {/* 8-Step Progress Bar */}
      <nav aria-label="Registration import workflow steps">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {STEP_LABELS.map((item) => {
            const isCurrent = step === item.step;
            const isReachable = item.step <= maxUnlockedStep;
            const isCompleted = item.step < step;
            return (
              <li key={item.step}>
                <button
                  type="button"
                  disabled={!isReachable}
                  onClick={() => {
                    if (isReachable) {
                      setErrorMessage(null);
                      setStep(item.step);
                    }
                  }}
                  className={`flex w-full items-center gap-1.5 rounded-md border px-2.5 py-2.5 text-left text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507] ${
                    isCurrent
                      ? "border-[#4B0507] bg-[#4B0507] text-white"
                      : isReachable
                        ? "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                        : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                  }`}
                >
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      isCurrent
                        ? "text-white/90"
                        : isCompleted
                          ? "text-emerald-700"
                          : "text-slate-400"
                    }`}
                  >
                    {item.step}.
                  </span>
                  <span className="truncate">{item.title}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {errorMessage ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      {/* STEP 1: Select Event */}
      {step === 1 ? (
        <section
          aria-labelledby="step-1-heading"
          className="space-y-5 rounded-lg border border-slate-200 bg-white p-6"
        >
          <div className="space-y-1 border-b border-slate-100 pb-4">
            <h2
              id="step-1-heading"
              className="font-display text-lg font-semibold text-slate-900"
            >
              Step 1 · Select Target Event
            </h2>
            <p className="text-sm text-slate-600">
              Choose the Stage 2A competition event for which you are preparing
              and executing registration imports.
            </p>
          </div>

          {events.length === 0 ? (
            <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
              <p>No competition events have been configured yet.</p>
              <Link
                href="/events"
                className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#4B0507] px-4 py-2 text-sm font-medium text-white hover:bg-[#380305]"
              >
                <span>Go to Events &amp; Rounds</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label
                  htmlFor="import-event-select"
                  className="block text-xs font-medium text-slate-700"
                >
                  Target Competition Event
                </label>
                <select
                  id="import-event-select"
                  value={selectedEventId}
                  onChange={(e) => handleSelectEvent(e.target.value)}
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20"
                >
                  {events.map((evt) => (
                    <option key={evt.id} value={evt.id}>
                      {evt.code} — {evt.name} ({ENTRY_MODE_LABELS[evt.entry_mode]} ·{" "}
                      {EVENT_STATUS_LABELS[evt.status]})
                    </option>
                  ))}
                </select>
              </div>

              {selectedEvent ? (
                <div className="grid grid-cols-1 gap-4 rounded-md border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs text-slate-500">Event Code</p>
                    <p className="font-mono text-sm font-semibold text-slate-900">
                      {selectedEvent.code}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Entry Mode</p>
                    <p className="text-sm font-medium text-slate-900">
                      {ENTRY_MODE_LABELS[selectedEvent.entry_mode]}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Codename Mode</p>
                    <p className="text-sm font-medium text-slate-900">
                      {CODENAME_MODE_LABELS[selectedEvent.codename_mode]}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Event Status</p>
                    <p
                      className={`text-sm font-medium ${
                        selectedEvent.status === "archived"
                          ? "text-red-700"
                          : selectedEvent.status === "active"
                            ? "text-emerald-700"
                            : "text-slate-800"
                      }`}
                    >
                      {EVENT_STATUS_LABELS[selectedEvent.status]}
                    </p>
                  </div>
                </div>
              ) : null}

              {selectedEvent?.status === "archived" ? (
                <div
                  role="alert"
                  className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                >
                  This event is archived. Validation preview can still be
                  inspected, but execution into archived events is blocked.
                </div>
              ) : null}

              <div className="flex justify-end border-t border-slate-100 pt-4">
                <button
                  type="button"
                  disabled={!selectedEvent}
                  onClick={() => setStep(2)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#4B0507] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#380305] disabled:opacity-50"
                >
                  <span>Continue to File Upload</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </>
          )}
        </section>
      ) : null}

      {/* STEP 2: Upload CSV or .xlsx */}
      {step === 2 ? (
        <section
          aria-labelledby="step-2-heading"
          className="space-y-5 rounded-lg border border-slate-200 bg-white p-6"
        >
          <div className="space-y-1 border-b border-slate-100 pb-4">
            <h2
              id="step-2-heading"
              className="font-display text-lg font-semibold text-slate-900"
            >
              Step 2 · Upload Registration Export
            </h2>
            <p className="text-sm text-slate-600">
              Upload a macro-free <code className="font-mono text-xs">.csv</code>{" "}
              or <code className="font-mono text-xs">.xlsx</code> spreadsheet
              exported from the college registration portal (maximum 5 MB, up to
              5,000 rows).
            </p>
          </div>

          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <FileSpreadsheet
              className="mx-auto h-10 w-10 text-[#4B0507]"
              aria-hidden="true"
            />
            <p className="mt-3 text-sm font-medium text-slate-900">
              {selectedFile
                ? `Selected: ${selectedFile.name} (${formatFileSize(selectedFile.size)})`
                : "Choose a .csv or .xlsx registration file"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Macro-enabled workbooks (.xlsm, .xlsb, .xls) are blocked for
              safety. Duplicate headers and blank rows are handled cleanly.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleFileInputChange}
              aria-label="Upload CSV or Excel registration file"
              className="sr-only"
            />

            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                disabled={parseBusy}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#4B0507] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#380305] disabled:opacity-50"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                <span>
                  {parseBusy
                    ? "Parsing File..."
                    : workbook
                      ? "Upload a Different File"
                      : "Select File & Parse"}
                </span>
              </button>

              {workbook ? (
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  <span>Keep Current File &amp; Inspect Columns</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex justify-between border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Back to Event Selection</span>
            </button>
          </div>
        </section>
      ) : null}

      {/* STEP 3: Inspect Detected Columns */}
      {step === 3 && workbook ? (
        <section
          aria-labelledby="step-3-heading"
          className="space-y-5 rounded-lg border border-slate-200 bg-white p-6"
        >
          <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h2
                id="step-3-heading"
                className="font-display text-lg font-semibold text-slate-900"
              >
                Step 3 · Inspect Detected Columns
              </h2>
              <p className="text-sm text-slate-600">
                Parsed{" "}
                <span className="font-medium text-slate-900">
                  {workbook.fileName}
                </span>{" "}
                ({formatFileSize(workbook.fileSizeBytes)} ·{" "}
                <span className="tabular-nums">{workbook.sheet.rows.length}</span>{" "}
                data rows,{" "}
                <span className="tabular-nums">
                  {workbook.sheet.columns.length}
                </span>{" "}
                columns).
              </p>
            </div>

            {workbook.sheetNames.length > 1 && selectedFile ? (
              <div className="space-y-1">
                <label
                  htmlFor="xlsx-sheet-select"
                  className="block text-xs font-medium text-slate-700"
                >
                  Worksheet
                </label>
                <select
                  id="xlsx-sheet-select"
                  value={workbook.selectedSheetName}
                  disabled={parseBusy}
                  onChange={(e) => handleSheetChange(e.target.value)}
                  className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none"
                >
                  {workbook.sheetNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          {workbook.sheet.warnings.length > 0 ? (
            <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>File Structure Notices</span>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed">
                {workbook.sheet.warnings.map((warn, idx) => (
                  <li key={idx}>{warn}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-700">
                <tr>
                  <th className="px-4 py-3">Col #</th>
                  <th className="px-4 py-3">Source Column Heading</th>
                  <th className="px-4 py-3">Non-Empty Rows</th>
                  <th className="px-4 py-3">Sample Values</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {workbook.sheet.columns.map((col) => (
                  <tr key={col.key}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 tabular-nums">
                      {col.index + 1}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {col.headerName}
                      </div>
                      {col.isDuplicateHeader ? (
                        <p className="text-xs text-amber-700">
                          Duplicate heading ({col.duplicateOccurrence} of{" "}
                          {col.duplicateTotal})
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700 tabular-nums">
                      {col.nonEmptyCount} / {workbook.sheet.rows.length}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {col.sampleValues.length > 0 ? (
                        col.sampleValues.join(" · ")
                      ) : (
                        <span className="text-slate-400">All blank</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap justify-between gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Upload Different File</span>
            </button>
            <button
              type="button"
              onClick={() => setStep(4)}
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#4B0507] px-4 py-2 text-sm font-medium text-white hover:bg-[#380305]"
            >
              <span>Continue to Column Mapping</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </section>
      ) : null}

      {/* STEP 4: Flexible Column Mapping */}
      {step === 4 && workbook && selectedEvent ? (
        <section
          aria-labelledby="step-4-heading"
          className="space-y-6 rounded-lg border border-slate-200 bg-white p-6"
        >
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h2
                id="step-4-heading"
                className="font-display text-lg font-semibold text-slate-900"
              >
                Step 4 · Map Uploaded Columns to CMS Fields
              </h2>
              <p className="text-sm text-slate-600">
                Match your export&apos;s column names (in any order) to Stage 2A
                fields for{" "}
                <span className="font-medium text-slate-900">
                  {selectedEvent.code} ({ENTRY_MODE_LABELS[selectedEvent.entry_mode]})
                </span>
                .
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAutoSuggestMappings}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50"
              >
                <Sparkles className="h-3.5 w-3.5 text-[#4B0507]" aria-hidden="true" />
                <span>Auto-Suggest</span>
              </button>
              <button
                type="button"
                onClick={handleClearMappings}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Clear All</span>
              </button>
            </div>
          </div>

          {ENTITY_SECTION_META.map((section) => {
            const fields = IMPORT_FIELD_DEFINITIONS.filter(
              (f) => f.entity === section.entity,
            );
            return (
              <div key={section.entity} className="space-y-3">
                <div>
                  <h3 className="font-display text-base font-semibold text-slate-900">
                    {section.heading}
                  </h3>
                  <p className="text-xs text-slate-500">{section.description}</p>
                </div>

                <div className="divide-y divide-slate-200 rounded-md border border-slate-200">
                  {fields.map((field) => {
                    const isBaselineRequired = baselineRequiredSet.has(field.key);
                    const isRequired = effectiveRequiredSet.has(field.key);
                    const currentColKey = mapping[field.key] ?? "";

                    return (
                      <div
                        key={field.key}
                        className="grid grid-cols-1 gap-3 p-4 md:grid-cols-[1.2fr_1fr_auto] md:items-center"
                      >
                        <div className="space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <label
                              htmlFor={`map-${field.key}`}
                              className="text-sm font-medium text-slate-900"
                            >
                              {field.label}
                            </label>
                            {isRequired ? (
                              <span className="text-xs font-semibold text-[#4B0507]">
                                Required
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs text-slate-500">
                            {field.description}
                          </p>
                          <p className="font-mono text-[11px] text-slate-400">
                            {field.schemaColumn}
                          </p>
                        </div>

                        <div>
                          <select
                            id={`map-${field.key}`}
                            value={currentColKey}
                            onChange={(e) =>
                              handleTargetMappingChange(field.key, e.target.value)
                            }
                            className={`min-h-10 w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20 ${
                              isRequired && !currentColKey
                                ? "border-amber-400"
                                : "border-slate-300"
                            }`}
                          >
                            <option value="">— Not mapped —</option>
                            {workbook.sheet.columns.map((col) => (
                              <option key={col.key} value={col.key}>
                                {col.displayLabel}
                              </option>
                            ))}
                          </select>
                        </div>

                        <label className="flex items-center gap-2 text-xs text-slate-700 md:justify-end">
                          <input
                            type="checkbox"
                            checked={isRequired}
                            disabled={isBaselineRequired}
                            onChange={() =>
                              handleToggleOrganiserRequired(field.key)
                            }
                            className="h-4 w-4 rounded border-slate-300 accent-[#4B0507]"
                          />
                          <span>
                            {isBaselineRequired
                              ? "Schema required"
                              : "Mark required"}
                          </span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-900">
              Unmapped Uploaded Columns (
              <span className="tabular-nums">{unmappedSourceColumns.length}</span>)
            </h3>
            {unmappedSourceColumns.length === 0 ? (
              <p className="mt-1 text-xs text-slate-600">
                All uploaded spreadsheet columns are mapped to CMS fields.
              </p>
            ) : (
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                The following columns will be excluded from validation and import:{" "}
                <span className="font-medium text-slate-800">
                  {unmappedSourceColumns.map((c) => c.displayLabel).join(", ")}
                </span>
                .
              </p>
            )}
          </div>

          <div className="flex flex-wrap justify-between gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Back to Inspect Columns</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setErrorMessage(null);
                setStep(5);
              }}
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#4B0507] px-4 py-2 text-sm font-medium text-white hover:bg-[#380305]"
            >
              <span>Continue to Validation</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </section>
      ) : null}

      {/* STEP 5: Server-Side Validation Launch */}
      {step === 5 && workbook && selectedEvent ? (
        <section
          aria-labelledby="step-5-heading"
          className="space-y-5 rounded-lg border border-slate-200 bg-white p-6"
        >
          <div className="space-y-1 border-b border-slate-100 pb-4">
            <h2
              id="step-5-heading"
              className="font-display text-lg font-semibold text-slate-900"
            >
              Step 5 · Validate Records on the Server
            </h2>
            <p className="text-sm text-slate-600">
              Run authoritative server-side validation against Stage 2A rules
              and compare incoming rows with existing CMS records.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Target Event</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {selectedEvent.code} · {selectedEvent.name}
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Rows to Validate</p>
              <p className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
                {workbook.sheet.rows.length}
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Mapped CMS Fields</p>
              <p className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
                {ALL_TARGET_FIELD_KEYS.length -
                  ALL_TARGET_FIELD_KEYS.filter((k) => !mapping[k]).length}
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Missing Required Mappings</p>
              <p
                className={`mt-1 font-mono text-lg font-semibold tabular-nums ${
                  missingRequiredBeforeValidate.length > 0
                    ? "text-amber-700"
                    : "text-emerald-700"
                }`}
              >
                {missingRequiredBeforeValidate.length}
              </p>
            </div>
          </div>

          {missingRequiredBeforeValidate.length > 0 ? (
            <div
              role="alert"
              className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              The following required fields are not mapped yet:{" "}
              <span className="font-semibold">
                {missingRequiredBeforeValidate
                  .map((k) => IMPORT_FIELD_BY_KEY[k].label)
                  .join(", ")}
              </span>
              . You can return to Step 4 to map them or run validation now to
              inspect affected rows.
            </div>
          ) : null}

          <div className="flex flex-wrap justify-between gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setStep(4)}
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Back to Column Mapping</span>
            </button>
            <button
              type="button"
              disabled={validateBusy}
              onClick={handleRunServerValidation}
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#4B0507] px-5 py-2 text-sm font-medium text-white hover:bg-[#380305] disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <span>
                {validateBusy
                  ? "Validating on Server..."
                  : "Run Server Validation & Build Preview"}
              </span>
            </button>
          </div>
        </section>
      ) : null}

      {/* STEP 6: Review Preview & Resolve Differences */}
      {step === 6 && report && resolutionContext ? (
        <section
          aria-labelledby="step-6-heading"
          className="space-y-6 rounded-lg border border-slate-200 bg-white p-6"
        >
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h2
                id="step-6-heading"
                className="font-display text-lg font-semibold text-slate-900"
              >
                Step 6 · Preview &amp; Resolve Differences
              </h2>
              <p className="text-sm text-slate-600">
                Inspect validated rows for{" "}
                <span className="font-medium text-slate-900">
                  {report.event.code} — {report.event.name}
                </span>
                , skip problematic rows if appropriate, and explicitly choose
                how to handle existing CMS matches.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setStep(4)}
              className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Back to Column Mapping</span>
            </button>
          </div>

          {/* Unboxed KPI Summary Counters */}
          <dl className="grid grid-cols-2 gap-6 border-b border-slate-200 pb-6 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <dt className="text-xs font-medium text-slate-500">Total Rows</dt>
              <dd className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
                {report.summary.totalRows}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Valid Active</dt>
              <dd className="mt-1 font-display text-2xl font-bold text-emerald-700 tabular-nums">
                {readinessCheck.validActiveCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">
                Unskipped Invalid
              </dt>
              <dd className="mt-1 font-display text-2xl font-bold text-red-700 tabular-nums">
                {readinessCheck.remainingInvalidCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Skipped Rows</dt>
              <dd className="mt-1 font-display text-2xl font-bold text-slate-700 tabular-nums">
                {readinessCheck.skippedRowCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">
                Existing Matches
              </dt>
              <dd className="mt-1 font-display text-2xl font-bold text-slate-800 tabular-nums">
                {resolutionContext.matchedRecords.length}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">
                Missing From File
              </dt>
              <dd className="mt-1 font-display text-2xl font-bold text-amber-700 tabular-nums">
                {resolutionContext.missingFromFileEntries.length}
              </dd>
            </div>
          </dl>

          {report.batchNotices.length > 0 ? (
            <div className="space-y-1.5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-medium">Batch Validation Notices</p>
              <ul className="list-disc space-y-1 pl-5 text-xs">
                {report.batchNotices.map((notice, idx) => (
                  <li key={idx}>{notice}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Unresolved Identity Conflicts (excluded from Reuse/Update and execution) */}
          {(resolutionContext.identityConflicts ?? []).length > 0 ? (
            <div
              role="alert"
              className="space-y-3 rounded-md border border-red-200 bg-red-50 p-4 text-red-900"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0 text-red-700"
                  aria-hidden="true"
                />
                <div className="space-y-1 text-xs leading-relaxed">
                  <p className="text-sm font-semibold">
                    Identity Conflicts Detected (
                    <span className="tabular-nums">
                      {resolutionContext.identityConflicts.length}
                    </span>
                    )
                  </p>
                  <p>
                    Multiple identifiers on the same row resolved to different
                    existing CMS records. Conflicting records are blocked from
                    Reuse, Update, and import execution until you fix the source
                    file or mapping and revalidate (or skip the affected row).
                  </p>
                </div>
              </div>
              <ul className="space-y-2">
                {resolutionContext.identityConflicts.map((conflict) => (
                  <li
                    key={conflict.conflictKey}
                    className="rounded border border-red-200 bg-white p-3 text-xs text-slate-800"
                  >
                    <p className="font-semibold text-red-800">
                      Row #{conflict.rowNumber} ·{" "}
                      <span className="capitalize">{conflict.entity}</span>{" "}
                      Identity Conflict
                    </p>
                    <p className="mt-1 text-slate-700">{conflict.message}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Existing CMS Matches & Explicit Diff Resolution */}
          {resolutionContext.matchedRecords.length > 0 ? (
            <div className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="space-y-1">
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Existing CMS Record Resolution (
                  <span className="tabular-nums">
                    {resolutionContext.matchedRecords.length}
                  </span>
                  )
                </h3>
                <p className="text-xs text-slate-600">
                  Default is <span className="font-semibold">Reuse Existing</span>{" "}
                  (non-destructive). Select{" "}
                  <span className="font-semibold">Apply Approved Updates</span>{" "}
                  and check individual fields only if you want incoming values to
                  update the existing CMS record.
                </p>
              </div>

              <div className="space-y-3">
                {resolutionContext.matchedRecords.map((item) => {
                  const choice = entityResolutions[item.matchKey] ?? {
                    action: "reuse",
                    approvedFields: [],
                  };

                  return (
                    <div
                      key={item.matchKey}
                      className="space-y-3 rounded-md border border-slate-200 bg-white p-4"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs uppercase text-[#4B0507]">
                              {item.entity}
                            </span>
                            <span className="text-sm font-semibold text-slate-900">
                              {item.existingLabel}
                            </span>
                            {!item.existingIsActive ? (
                              <span className="text-xs font-semibold text-red-700">
                                Inactive in CMS
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs text-slate-500">
                            Matched by {item.matchedBy.join(", ")} · File row(s):{" "}
                            <span className="font-mono tabular-nums">
                              {item.rowNumbers.join(", ")}
                            </span>
                            {item.alreadyEnteredInSelectedEvent
                              ? " · Already entered in this event (status untouched)"
                              : " · Not yet entered in this event (entry will be created unless skipped)"}
                          </p>
                        </div>

                        <div
                          className="flex flex-wrap gap-2"
                          role="group"
                          aria-label={`Resolution action for ${item.existingLabel}`}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              handleSetEntityAction(item.matchKey, "reuse")
                            }
                            className={`min-h-8 rounded border px-2.5 py-1 text-xs font-medium ${
                              choice.action === "reuse"
                                ? "border-[#4B0507] bg-[#4B0507] text-white"
                                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            Reuse Existing
                          </button>
                          {item.hasAllowedChanges ? (
                            <button
                              type="button"
                              onClick={() =>
                                handleSetEntityAction(item.matchKey, "update")
                              }
                              className={`min-h-8 rounded border px-2.5 py-1 text-xs font-medium ${
                                choice.action === "update"
                                  ? "border-[#4B0507] bg-[#4B0507] text-white"
                                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              Apply Approved Updates
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() =>
                              handleSetEntityAction(item.matchKey, "skip")
                            }
                            className={`min-h-8 rounded border px-2.5 py-1 text-xs font-medium ${
                              choice.action === "skip"
                                ? "border-slate-800 bg-slate-800 text-white"
                                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            Skip
                          </button>
                        </div>
                      </div>

                      {item.fieldDiffs.length > 0 ? (
                        <div className="overflow-x-auto rounded border border-slate-200">
                          <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                            <thead className="bg-slate-50 font-semibold text-slate-700">
                              <tr>
                                {choice.action === "update" ? (
                                  <th className="w-12 px-3 py-2">Approve</th>
                                ) : null}
                                <th className="px-3 py-2">Field</th>
                                <th className="px-3 py-2">Existing CMS Value</th>
                                <th className="px-3 py-2">Incoming File Value</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {item.fieldDiffs.map((diff) => {
                                const isChecked = choice.approvedFields.includes(
                                  diff.field,
                                );
                                return (
                                  <tr key={diff.field}>
                                    {choice.action === "update" ? (
                                      <td className="px-3 py-2">
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          disabled={!diff.allowedToUpdate}
                                          onChange={() =>
                                            handleToggleApprovedField(
                                              item.matchKey,
                                              diff.field,
                                            )
                                          }
                                          aria-label={`Approve update for ${diff.label} on ${item.existingLabel}`}
                                          className="h-4 w-4 rounded border-slate-300 accent-[#4B0507]"
                                        />
                                      </td>
                                    ) : null}
                                    <td className="px-3 py-2 font-medium text-slate-800">
                                      {diff.label}
                                    </td>
                                    <td className="px-3 py-2 text-slate-600">
                                      {diff.currentValue ?? (
                                        <span className="text-slate-400">
                                          Empty
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 font-medium text-slate-900">
                                      {diff.incomingValue ?? (
                                        <span className="text-slate-400">
                                          Empty
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">
                          All mapped fields match the existing CMS record.
                        </p>
                      )}

                      {choice.action === "update" &&
                      choice.approvedFields.length === 0 ? (
                        <p className="text-xs font-medium text-amber-700">
                          Check at least one field above to approve updates, or
                          switch to Reuse Existing / Skip.
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Missing-From-File Non-Destructive Notice */}
          {resolutionContext.missingFromFileEntries.length > 0 ? (
            <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-2.5 text-amber-900">
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
                <div className="space-y-1 text-xs leading-relaxed">
                  <p className="text-sm font-semibold">
                    Existing Event Entries Missing from Uploaded File (
                    <span className="tabular-nums">
                      {resolutionContext.missingFromFileEntries.length}
                    </span>
                    )
                  </p>
                  <p>
                    The following entries already exist in {report.event.code} in
                    the CMS but are not present in this uploaded file. They will
                    be <span className="font-semibold">retained untouched</span>{" "}
                    and will never be deleted or marked withdrawn.
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto rounded border border-amber-200 bg-white">
                <table className="min-w-full divide-y divide-amber-100 text-left text-xs">
                  <thead className="bg-amber-50/70 font-semibold text-amber-900">
                    <tr>
                      <th className="px-3 py-2">Code</th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Entry Type</th>
                      <th className="px-3 py-2">Retained Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {resolutionContext.missingFromFileEntries.map((entry) => (
                      <tr key={entry.entryId}>
                        <td className="px-3 py-2 font-mono text-slate-800">
                          {entry.subjectCode}
                        </td>
                        <td className="px-3 py-2 text-slate-800">
                          {entry.subjectName}
                        </td>
                        <td className="px-3 py-2 capitalize text-slate-600">
                          {entry.entryType}
                        </td>
                        <td className="px-3 py-2 font-medium text-emerald-700">
                          {ENTRY_STATUS_LABELS[entry.entryStatus]} (Untouched)
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {/* Row Filter Bar + Quick Skip Invalid */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              className="flex flex-wrap gap-2"
              role="tablist"
              aria-label="Filter preview rows"
            >
              {(
                [
                  { id: "all", label: `All (${report.summary.totalRows})` },
                  {
                    id: "valid",
                    label: `Valid (${readinessCheck.validActiveCount})`,
                  },
                  {
                    id: "invalid",
                    label: `Invalid (${readinessCheck.remainingInvalidCount})`,
                  },
                  {
                    id: "conflicts",
                    label: `Conflicts (${readinessCheck.remainingConflictCount})`,
                  },
                  {
                    id: "duplicates",
                    label: `In-File Duplicates (${report.summary.inFileDuplicateRows})`,
                  },
                  {
                    id: "existing_matches",
                    label: `Existing Matches (${report.summary.existingMatchRows})`,
                  },
                  {
                    id: "skipped",
                    label: `Skipped (${readinessCheck.skippedRowCount})`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={previewFilter === tab.id}
                  onClick={() => setPreviewFilter(tab.id)}
                  className={`min-h-9 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    previewFilter === tab.id
                      ? "border-[#4B0507] bg-[#4B0507] text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {readinessCheck.remainingInvalidCount > 0 ? (
                <button
                  type="button"
                  onClick={handleSkipAllInvalidRows}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
                >
                  <span>Skip All Invalid Rows</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleRunServerValidation}
                disabled={validateBusy}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Re-run Validation</span>
              </button>
            </div>
          </div>

          {filteredPreviewRows.length === 0 ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
              No rows match the selected preview filter.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-700">
                  <tr>
                    <th className="px-3 py-3">Row</th>
                    <th className="px-3 py-3">Action</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Entry</th>
                    <th className="px-3 py-3">Contingent / Institution</th>
                    <th className="px-3 py-3">Participant</th>
                    <th className="px-3 py-3">
                      Validation Issues &amp; CMS Matches
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white align-top">
                  {filteredPreviewRows.map((row) => {
                    const isManuallySkipped = skippedRowSet.has(row.rowNumber);
                    const isEntitySkipped = entitySkippedRowSet.has(
                      row.rowNumber,
                    );
                    const isSkipped = isManuallySkipped || isEntitySkipped;
                    const rowConflicts = conflictRowMap.get(row.rowNumber) ?? [];
                    const hasConflict = rowConflicts.length > 0;

                    return (
                      <tr
                        key={row.rowNumber}
                        className={
                          isSkipped
                            ? "bg-slate-50/70 text-slate-500"
                            : row.status === "invalid" || hasConflict
                              ? "bg-red-50/30"
                              : ""
                        }
                      >
                        <td className="px-3 py-3 font-mono text-xs text-slate-500 tabular-nums">
                          #{row.rowNumber}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {isEntitySkipped && !isManuallySkipped ? (
                            <span className="text-xs text-slate-500">
                              Entity skipped
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggleSkipRow(row.rowNumber)}
                              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              {isManuallySkipped ? "Include" : "Skip"}
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span
                            className={`text-xs font-semibold ${
                              isSkipped
                                ? "text-slate-500"
                                : hasConflict || row.status === "invalid"
                                  ? "text-red-700"
                                  : "text-emerald-700"
                            }`}
                          >
                            {isSkipped
                              ? "Skipped"
                              : hasConflict
                                ? "Conflict"
                                : row.status === "valid"
                                  ? "Valid"
                                  : "Invalid"}
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-700">
                          <div className="font-medium capitalize">
                            {row.resolvedEntryType}
                          </div>
                          <div className="text-slate-500">
                            {ENTRY_STATUS_LABELS[row.normalized.entryStatus]}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-700">
                          {row.normalized.contingent ? (
                            <div className="space-y-0.5">
                              <div className="font-medium text-slate-900">
                                {row.normalized.contingent.contingentCode ?? "—"}{" "}
                                {row.normalized.contingent.name
                                  ? `· ${row.normalized.contingent.name}`
                                  : ""}
                              </div>
                              <div className="text-slate-600">
                                {row.normalized.contingent.institutionName ?? "—"}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-500">
                              {row.normalized.participant.institutionName ??
                                "Individual"}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-700">
                          <div className="font-medium text-slate-900">
                            {row.normalized.participant.participantCode ?? "—"}{" "}
                            {row.normalized.participant.fullName
                              ? `· ${row.normalized.participant.fullName}`
                              : ""}
                          </div>
                          {row.normalized.participant.email ? (
                            <div className="text-slate-600">
                              {row.normalized.participant.email}
                            </div>
                          ) : null}
                          {row.normalized.participant.isContingentLead ? (
                            <div className="font-medium text-[#4B0507]">
                              Contingent Lead
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {row.issues.length === 0 &&
                          row.existingMatches.length === 0 &&
                          rowConflicts.length === 0 ? (
                            <span className="text-emerald-700">
                              Ready to import
                            </span>
                          ) : (
                            <ul className="space-y-1">
                              {rowConflicts.map((conflict) => (
                                <li
                                  key={conflict.conflictKey}
                                  className="font-medium text-red-700"
                                >
                                  • {conflict.message}
                                </li>
                              ))}
                              {row.issues.map((issue, idx) => (
                                <li
                                  key={`issue-${idx}`}
                                  className={
                                    issue.severity === "error"
                                      ? "text-red-700"
                                      : "text-amber-700"
                                  }
                                >
                                  • {issue.message}
                                </li>
                              ))}
                              {row.existingMatches.map((match, idx) => (
                                <li
                                  key={`match-${idx}`}
                                  className={
                                    match.alreadyEnteredInSelectedEvent
                                      ? "font-medium text-amber-800"
                                      : "text-slate-600"
                                  }
                                >
                                  • {match.message}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {readinessCheck.reason ? (
            <div
              role="alert"
              className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900"
            >
              {readinessCheck.reason}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setStep(4)}
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Adjust Mapping</span>
            </button>
            <button
              type="button"
              disabled={!readinessCheck.canProceed}
              onClick={() => {
                setErrorMessage(null);
                setStep(7);
              }}
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#4B0507] px-5 py-2 text-sm font-medium text-white hover:bg-[#380305] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>Continue to Confirm &amp; Execute</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </section>
      ) : null}

      {/* STEP 7: Confirm & Execute */}
      {step === 7 && workbook && report && resolutionContext ? (
        <section
          aria-labelledby="step-7-heading"
          className="space-y-6 rounded-lg border border-slate-200 bg-white p-6"
        >
          <div className="space-y-1 border-b border-slate-100 pb-4">
            <h2
              id="step-7-heading"
              className="font-display text-lg font-semibold text-slate-900"
            >
              Step 7 · Confirm &amp; Execute Atomic Import
            </h2>
            <p className="text-sm text-slate-600">
              Final review before committing registrations for{" "}
              <span className="font-medium text-slate-900">
                {report.event.code} — {report.event.name}
              </span>
              . The server will revalidate every row and apply all database writes
              atomically.
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-6 border-b border-slate-200 pb-6 sm:grid-cols-4">
            <div>
              <dt className="text-xs font-medium text-slate-500">Source File</dt>
              <dd className="mt-1 truncate text-sm font-semibold text-slate-900">
                {workbook.fileName}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">
                Active Rows to Process
              </dt>
              <dd className="mt-1 font-display text-2xl font-bold text-emerald-700 tabular-nums">
                {readinessCheck.activeRowCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Skipped Rows</dt>
              <dd className="mt-1 font-display text-2xl font-bold text-slate-700 tabular-nums">
                {readinessCheck.skippedRowCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">
                Missing CMS Entries Retained
              </dt>
              <dd className="mt-1 font-display text-2xl font-bold text-amber-700 tabular-nums">
                {resolutionContext.missingFromFileEntries.length}
              </dd>
            </div>
          </dl>

          <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
            <p className="text-sm font-semibold text-slate-900">
              Approved Existing-Record Updates (
              <span className="tabular-nums">
                {approvedUpdatePreviewList.length}
              </span>
              )
            </p>
            {approvedUpdatePreviewList.length === 0 ? (
              <p>
                No existing CMS records will be overwritten. Matched records will
                be reused non-destructively.
              </p>
            ) : (
              <ul className="list-disc space-y-1 pl-5">
                {approvedUpdatePreviewList.map((u) => (
                  <li key={u.label}>
                    <span className="font-medium text-slate-900">{u.label}</span>:
                    update fields{" "}
                    <span className="font-mono text-[#4B0507]">
                      {u.fields.join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-4 rounded-md border border-slate-200 p-4">
            <label className="flex items-start gap-3 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={confirmChecked}
                onChange={(e) => setConfirmChecked(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 accent-[#4B0507]"
              />
              <span className="leading-relaxed">
                I have reviewed the validation preview, row skips, and existing
                CMS match resolutions, and I confirm executing this atomic import
                into <span className="font-semibold">{report.event.code}</span>.
              </span>
            </label>
            <p className="font-mono text-[11px] text-slate-400">
              Idempotency token: {idempotencyKey}
            </p>
          </div>

          <div className="flex flex-wrap justify-between gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              disabled={executeBusy}
              onClick={() => setStep(6)}
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Back to Preview &amp; Resolve</span>
            </button>
            <button
              type="button"
              disabled={executeBusy || !confirmChecked || !readinessCheck.canProceed}
              onClick={handleExecuteImport}
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#4B0507] px-5 py-2 text-sm font-medium text-white hover:bg-[#380305] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <span>
                {executeBusy
                  ? "Executing Atomic Import..."
                  : "Execute Registration Import"}
              </span>
            </button>
          </div>
        </section>
      ) : null}

      {/* STEP 8: Execution Summary */}
      {step === 8 && executionResult && report ? (
        <section
          aria-labelledby="step-8-heading"
          className="space-y-6 rounded-lg border border-slate-200 bg-white p-6"
        >
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h2
                id="step-8-heading"
                className="font-display text-lg font-semibold text-slate-900"
              >
                Step 8 · Import Execution Summary
              </h2>
              <p className="text-sm text-slate-600">
                {executionResult.idempotentReplay
                  ? "Idempotent replay matched an already committed import batch — no duplicate records were created."
                  : `Registration import committed atomically to ${report.event.code}.`}
              </p>
            </div>
            <span className="font-mono text-xs text-slate-500">
              Import ID: {executionResult.importId.slice(0, 8)} ·{" "}
              {formatTimestamp(executionResult.createdAt)}
            </span>
          </div>

          <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {executionResult.idempotentReplay
                ? "This import request had already succeeded and the stored summary was returned safely."
                : "Database commit succeeded. All created contingents, participants, and event entries are now active in the CMS."}
            </span>
          </div>

          {executionResult.auditWarning ? (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <span>
                <span className="font-semibold">
                  Import committed, audit log warning:
                </span>{" "}
                {executionResult.auditWarning}
              </span>
            </div>
          ) : null}

          <dl className="grid grid-cols-2 gap-6 border-b border-slate-200 pb-6 sm:grid-cols-4">
            <div>
              <dt className="text-xs font-medium text-slate-500">
                Created Contingents
              </dt>
              <dd className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
                {executionResult.createdContingentsCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">
                Created Participants
              </dt>
              <dd className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
                {executionResult.createdParticipantsCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">
                Created Event Entries
              </dt>
              <dd className="mt-1 font-display text-2xl font-bold text-emerald-700 tabular-nums">
                {executionResult.createdEntriesCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">
                Reused Existing Records
              </dt>
              <dd className="mt-1 font-display text-2xl font-bold text-slate-800 tabular-nums">
                {executionResult.reusedRecordsCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">
                Approved Updates Applied
              </dt>
              <dd className="mt-1 font-display text-2xl font-bold text-[#4B0507] tabular-nums">
                {executionResult.updatedRecordsCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">
                Skipped Rows
              </dt>
              <dd className="mt-1 font-display text-2xl font-bold text-slate-700 tabular-nums">
                {executionResult.skippedRowsCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">
                Rejected / Invalid Rows
              </dt>
              <dd className="mt-1 font-display text-2xl font-bold text-slate-700 tabular-nums">
                {executionResult.rejectedRowsCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">
                Missing Entries Retained
              </dt>
              <dd className="mt-1 font-display text-2xl font-bold text-amber-700 tabular-nums">
                {executionResult.missingFromFileCount}
              </dd>
            </div>
          </dl>

          {executionResult.missingFromFileEntries.length > 0 ? (
            <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
              <p className="font-semibold text-slate-900">
                Retained Event Entries Not Included in This File (
                <span className="tabular-nums">
                  {executionResult.missingFromFileEntries.length}
                </span>
                )
              </p>
              <p>
                These existing entries were preserved untouched without deletion
                or status changes:{" "}
                {executionResult.missingFromFileEntries
                  .map((e) => `${e.subjectCode} (${e.subjectName})`)
                  .join(", ")}
                .
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/events/${report.event.id}`}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
              >
                <span>Inspect Event Entries</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
              <Link
                href="/contingents"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
              >
                <span>View Contingents</span>
              </Link>
              <Link
                href="/participants"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
              >
                <span>View Participants</span>
              </Link>
            </div>

            <button
              type="button"
              onClick={() => {
                setWorkbook(null);
                setSelectedFile(null);
                setMapping(createEmptyMapping());
                resetPreparationOutputs();
                setStep(2);
              }}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-[#4B0507] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#380305]"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Import Another File</span>
            </button>
          </div>
        </section>
      ) : null}

      {/* Persistent Per-Event Import History */}
      {selectedEvent ? (
        <section
          aria-labelledby="import-history-heading"
          className="space-y-4 rounded-lg border border-slate-200 bg-white p-6"
        >
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-[#4B0507]" aria-hidden="true" />
              <h2
                id="import-history-heading"
                className="font-display text-base font-semibold text-slate-900"
              >
                Import History · {selectedEvent.code}
              </h2>
            </div>

            <button
              type="button"
              disabled={historyBusy}
              onClick={() => refreshHistoryForEvent(selectedEvent.id)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{historyBusy ? "Refreshing..." : "Refresh History"}</span>
            </button>
          </div>

          {historyItems.length === 0 ? (
            <p className="text-sm text-slate-500">
              No registration imports have been recorded for {selectedEvent.code}{" "}
              yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 font-semibold text-slate-700">
                  <tr>
                    <th className="px-3 py-3">Timestamp</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Source File</th>
                    <th className="px-3 py-3">Organiser</th>
                    <th className="px-3 py-3">Created (C / P / E)</th>
                    <th className="px-3 py-3">Reused / Updated</th>
                    <th className="px-3 py-3">Skipped / Missing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {historyItems.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-3 whitespace-nowrap text-slate-600">
                        {formatTimestamp(item.created_at)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span
                          className={`font-semibold capitalize ${
                            item.status === "completed"
                              ? "text-emerald-700"
                              : "text-red-700"
                          }`}
                        >
                          {item.status}
                        </span>
                        {item.error_summary ? (
                          <p className="mt-0.5 max-w-xs whitespace-normal text-[11px] text-red-700">
                            {item.error_summary}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-slate-900">
                        <div className="font-medium">{item.source_filename}</div>
                        <div className="font-mono text-[11px] uppercase text-slate-400">
                          {item.file_format} · {item.total_rows} rows
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {item.initiated_by_email ?? item.initiated_by.slice(0, 8)}
                      </td>
                      <td className="px-3 py-3 font-mono text-slate-800 tabular-nums">
                        {item.created_contingents_count} /{" "}
                        {item.created_participants_count} /{" "}
                        {item.created_entries_count}
                      </td>
                      <td className="px-3 py-3 font-mono text-slate-700 tabular-nums">
                        {item.reused_records_count} /{" "}
                        {item.updated_records_count}
                      </td>
                      <td className="px-3 py-3 font-mono text-slate-700 tabular-nums">
                        {item.skipped_rows_count} /{" "}
                        {item.missing_from_file_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
