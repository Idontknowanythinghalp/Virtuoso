import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdminSupabaseConfigured } from "@/lib/supabase/server-env";
import { sanitizeAuditPayload } from "@/lib/audit/sanitize";

export interface RecordAuditLogInput {
  actorUserId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export async function recordAuditLog(
  input: RecordAuditLogInput,
): Promise<{ ok: boolean; error?: string }> {
  if (!isAdminSupabaseConfigured()) {
    return {
      ok: false,
      error: "Admin Supabase configuration is unavailable for audit logging.",
    };
  }

  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("audit_logs").insert({
      actor_user_id: input.actorUserId ?? null,
      actor_email: input.actorEmail ?? null,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      before_data: sanitizeAuditPayload(input.beforeData),
      after_data: sanitizeAuditPayload(input.afterData),
      metadata: sanitizeAuditPayload(input.metadata) ?? {},
    });

    if (error) {
      console.error("[audit_logs] failed to insert audit entry:", error.message);
      return { ok: false, error: "Audit entry could not be recorded." };
    }

    return { ok: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown audit log error";
    console.error("[audit_logs] unexpected error:", message);
    return { ok: false, error: "Audit entry could not be recorded." };
  }
}
