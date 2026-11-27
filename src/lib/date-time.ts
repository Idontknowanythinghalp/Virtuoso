const IST_TIME_ZONE = "Asia/Kolkata";

const istDateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

const istDateTimeWithSecondsFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

const istDateFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function parseValidDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export function formatIstTimestamp(
  value: string | Date | null | undefined,
  fallback = "—",
): string {
  const parsed = parseValidDate(value);
  if (!parsed) {
    return typeof value === "string" && value.trim().length > 0
      ? value
      : fallback;
  }
  return `${istDateTimeFormatter.format(parsed)} IST`;
}

export function formatIstDateTimeWithSeconds(
  value: string | Date | null | undefined,
  fallback = "—",
): string {
  const parsed = parseValidDate(value);
  if (!parsed) {
    return typeof value === "string" && value.trim().length > 0
      ? value
      : fallback;
  }
  return `${istDateTimeWithSecondsFormatter.format(parsed)} IST`;
}

export function formatIstDate(
  value: string | Date | null | undefined,
  fallback = "—",
): string {
  const parsed = parseValidDate(value);
  if (!parsed) {
    return typeof value === "string" && value.trim().length > 0
      ? value
      : fallback;
  }
  return istDateFormatter.format(parsed);
}
