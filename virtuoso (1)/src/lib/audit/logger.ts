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

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeUuidOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return UUID_REGEX.test(trimmed) ? trimmed : null;
}

export async function recordAuditLog(
  input: RecordAuditLogInput,
): Promise<{ ok: boolean; error?: string }> {
  if (!isAdminSupabaseConfigured()) {
    const message =
      "Audit logging skipped because SUPABASE_SERVICE_ROLE_KEY is not configured on the server.";
    console.error("[audit_logs]", message, {
      action: input.action,
      entityType: input.entityType,
    });
    return {
      ok: false,
      error: message,
    };
  }

  const normalizedAction = input.action.trim();
  const normalizedEntityType = input.entityType.trim();
  const normalizedActorId = normalizeUuidOrNull(input.actorUserId);
  const normalizedEntityId = input.entityId?.trim() || null;
  const normalizedActorEmail = input.actorEmail?.trim() || null;

  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("audit_logs").insert({
      actor_user_id: normalizedActorId,
      actor_email: normalizedActorEmail,
      action: normalizedAction,
      entity_type: normalizedEntityType,
      entity_id: normalizedEntityId,
      before_data: sanitizeAuditPayload(input.beforeData),
      after_data: sanitizeAuditPayload(input.afterData),
      metadata: sanitizeAuditPayload(input.metadata) ?? {},
    });

    if (error) {
      console.error("[audit_logs] failed to insert audit entry:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        action: normalizedAction,
        entityType: normalizedEntityType,
      });

      const diagnostic =
        process.env.NODE_ENV !== "production"
          ? `Audit entry could not be recorded (${error.code ?? "DB_ERROR"}: ${error.message}).`
          : "Audit entry could not be recorded.";

      return { ok: false, error: diagnostic };
    }

    return { ok: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown audit log error";
    console.error("[audit_logs] unexpected error:", message);
    return {
      ok: false,
      error:
        process.env.NODE_ENV !== "production"
          ? `Audit entry could not be recorded (${message}).`
          : "Audit entry could not be recorded.",
    };
  }
}
