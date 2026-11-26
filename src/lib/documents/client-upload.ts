import {
  ALLOWED_COMPETITION_DOCUMENT_MIME,
  COMPETITION_DOCUMENTS_BUCKET,
} from "@/lib/documents/validation";
import type {
  DirectUploadStage,
  DocumentOperationResult,
  SignedUploadIntentResult,
} from "@/types/competition";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type { DirectUploadStage };

export interface DirectPdfUploadDeps {
  requestIntent: (params: {
    title: string;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
  }) => Promise<SignedUploadIntentResult>;
  uploadToSignedUrl: (
    path: string,
    token: string,
    file: File,
    options: {
      contentType: string;
      cacheControl: string;
      upsert: boolean;
    },
  ) => Promise<{ error: { message?: string } | null }>;
  finalizeUpload: (params: {
    title: string;
    originalFilename: string;
    storageObjectPath: string;
  }) => Promise<DocumentOperationResult>;
  onStageChange?: (stage: DirectUploadStage) => void;
}

function classifyDirectUploadErrorMessage(rawMessage?: string): string {
  const normalized = (rawMessage ?? "").toLowerCase();
  if (
    normalized.includes("expir") ||
    normalized.includes("jwt") ||
    normalized.includes("token")
  ) {
    return "Upload permission expired before the transfer completed. Please try uploading again.";
  }
  if (
    normalized.includes("already exists") ||
    normalized.includes("duplicate")
  ) {
    return "The allocated upload path was already used. Please try again.";
  }
  if (
    normalized.includes("maximum allowed size") ||
    normalized.includes("payload too large") ||
    normalized.includes("413")
  ) {
    return "PDF file exceeds the maximum allowed size of 25 MB.";
  }
  return "Direct upload to private storage failed. Please check your connection and try again.";
}

export async function runDirectPdfUploadFlowWithDeps(
  input: {
    title: string;
    file: File;
  },
  deps: DirectPdfUploadDeps,
): Promise<DocumentOperationResult> {
  try {
    deps.onStageChange?.("requesting_permission");
    const intent = await deps.requestIntent({
      title: input.title,
      fileName: input.file.name,
      mimeType: input.file.type,
      fileSizeBytes: input.file.size,
    });

    if (!intent.ok || !intent.storageObjectPath || !intent.token) {
      return {
        ok: false,
        message:
          intent.message || "Unable to obtain permission for direct upload.",
      };
    }

    deps.onStageChange?.("uploading_storage");
    let uploadResult: { error: { message?: string } | null };
    try {
      uploadResult = await deps.uploadToSignedUrl(
        intent.storageObjectPath,
        intent.token,
        input.file,
        {
          contentType: ALLOWED_COMPETITION_DOCUMENT_MIME,
          cacheControl: "no-store",
          upsert: false,
        },
      );
    } catch {
      return {
        ok: false,
        message:
          "Direct upload to private storage failed due to a network error. Please try again.",
      };
    }

    if (uploadResult.error) {
      return {
        ok: false,
        message: classifyDirectUploadErrorMessage(uploadResult.error.message),
      };
    }

    deps.onStageChange?.("finalising");
    const finalResult = await deps.finalizeUpload({
      title: input.title,
      originalFilename: input.file.name,
      storageObjectPath: intent.storageObjectPath,
    });

    return finalResult;
  } catch {
    return {
      ok: false,
      message: "Unexpected error during direct PDF upload. Please try again.",
    };
  }
}

export async function uploadPdfDirectToStorage(input: {
  title: string;
  file: File;
  requestIntent: DirectPdfUploadDeps["requestIntent"];
  finalizeUpload: DirectPdfUploadDeps["finalizeUpload"];
  onStageChange?: (stage: DirectUploadStage) => void;
}): Promise<DocumentOperationResult> {
  const supabase = createSupabaseBrowserClient();

  return runDirectPdfUploadFlowWithDeps(
    {
      title: input.title,
      file: input.file,
    },
    {
      requestIntent: input.requestIntent,
      uploadToSignedUrl: async (path, token, file, options) => {
        const { error } = await supabase.storage
          .from(COMPETITION_DOCUMENTS_BUCKET)
          .uploadToSignedUrl(path, token, file, options);
        return { error };
      },
      finalizeUpload: input.finalizeUpload,
      onStageChange: input.onStageChange,
    },
  );
}
