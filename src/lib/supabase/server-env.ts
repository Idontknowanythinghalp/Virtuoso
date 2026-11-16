import "server-only";
import { getPublicSupabaseConfig } from "@/lib/env";

export interface AdminSupabaseConfig {
  url: string;
  serviceRoleKey: string;
}

export function getAdminSupabaseConfig(): AdminSupabaseConfig | null {
  const publicConfig = getPublicSupabaseConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!publicConfig || !serviceRoleKey) {
    return null;
  }

  return {
    url: publicConfig.url,
    serviceRoleKey,
  };
}

export function isAdminSupabaseConfigured(): boolean {
  return getAdminSupabaseConfig() !== null;
}

export function requireAdminSupabaseConfig(): AdminSupabaseConfig {
  const config = getAdminSupabaseConfig();
  if (!config) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY or public Supabase configuration on the server.",
    );
  }
  return config;
}
