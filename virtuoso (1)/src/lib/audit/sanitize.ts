const SENSITIVE_KEY_PATTERN =
  /password|secret|token|service_role|api_key|apikey|authorization|cookie|credential/i;

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > 5) {
    return "[truncated]";
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1));
  }

  if (typeof value === "object") {
    const clean: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        clean[key] = "[redacted]";
      } else if (entryValue !== undefined) {
        clean[key] = sanitizeValue(entryValue, depth + 1);
      }
    }
    return clean;
  }

  return String(value);
}

export function sanitizeAuditPayload(
  payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!payload) {
    return null;
  }
  return sanitizeValue(payload, 0) as Record<string, unknown>;
}
