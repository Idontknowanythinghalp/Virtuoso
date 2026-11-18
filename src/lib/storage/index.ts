import "server-only";
import type { StorageProvider } from "@/lib/storage/provider";
import { SupabaseStorageProvider } from "@/lib/storage/supabase-storage";

let defaultProvider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (!defaultProvider) {
    defaultProvider = new SupabaseStorageProvider();
  }
  return defaultProvider;
}

export const COMPETITION_DOCUMENTS_BUCKET = "competition-documents";
