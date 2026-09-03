export const FETCH_TIMEOUT_MS = 15_000;
export const MAX_USAGE_EVENT_PAGES = 10;
export const MAX_STORE_SYNC_PAGES = 100;

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

export function withTimeout(init: RequestInit = {}): RequestInit {
  return { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) };
}

export function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function nextMonth(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return shiftUtcMonth(d.getTime(), 1);
}

export function parseTimestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return 0;
    const asNum = Number(trimmed);
    if (Number.isFinite(asNum)) return asNum;
    const asDate = Date.parse(trimmed);
    if (Number.isFinite(asDate)) return asDate;
  }
  return 0;
}

/** UTC month shift with day clamped to the target month length (avoids Jan 31 → Mar 3). */
export function shiftUtcMonth(timestampMs: number, deltaMonths: number): string {
  const date = new Date(timestampMs);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + deltaMonths;
  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();
  const ms = date.getUTCMilliseconds();

  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, daysInTargetMonth);

  return new Date(Date.UTC(targetYear, targetMonth, clampedDay, hours, minutes, seconds, ms)).toISOString();
}

export function getBillingCycleCutoff(resetAtIso: string | null, now: number): number {
  if (!resetAtIso) return now - 31 * 86_400_000;
  const resetAt = new Date(resetAtIso);
  if (Number.isNaN(resetAt.getTime())) return now - 31 * 86_400_000;
  return new Date(shiftUtcMonth(resetAt.getTime(), -1)).getTime();
}
