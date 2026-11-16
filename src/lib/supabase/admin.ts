import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requireAdminSupabaseConfig } from "@/lib/supabase/server-env";

export function createSupabaseAdminClient() {
  const { url, serviceRoleKey } = requireAdminSupabaseConfig();

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
