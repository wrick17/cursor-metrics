export function centsToDollars(cents: number): number {
  return cents / 100;
}

export function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

export function readOptionalCents(record: Record<string, unknown>, field: string): number | null {
  if (!(field in record)) return null;
  return toNumber(record[field]);
}

export function pickPositiveDollars(...values: Array<number | null>): number | null {
  for (const value of values) {
    if (value !== null && value > 0) return value;
  }
  return null;
}
