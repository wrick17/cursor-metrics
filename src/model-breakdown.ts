import type { DailySpendRow, UsageEvent } from "./cursor-api";

export type UsageDuration = "1d" | "7d" | "30d";

export type ModelAggregate = {
  model: string;
  totalTokens: number;
  requests: number;
  spendCents: number;
};

export function getDurationCutoff(duration: UsageDuration, now = Date.now()): number {
  const daysMap: Record<UsageDuration, number> = { "1d": 1, "7d": 7, "30d": 30 };
  return now - daysMap[duration] * 86_400_000;
}

export function aggregateSpendByCategory(
  rows: DailySpendRow[],
  duration: UsageDuration,
  now = Date.now(),
): Map<string, number> {
  const cutoff = getDurationCutoff(duration, now);
  const totals = new Map<string, number>();

  for (const row of rows) {
    if (row.day < cutoff) continue;
    totals.set(row.category, (totals.get(row.category) ?? 0) + row.spendCents);
  }

  return totals;
}

export function aggregateByModel(
  events: UsageEvent[],
  spendRows: DailySpendRow[],
  duration: UsageDuration,
  now = Date.now(),
): ModelAggregate[] {
  const cutoff = getDurationCutoff(duration, now);
  const spendByCategory = aggregateSpendByCategory(spendRows, duration, now);
  const modelMap = new Map<string, { totalTokens: number; requests: number }>();

  for (const event of events) {
    if (event.timestamp < cutoff) continue;
    const entry = modelMap.get(event.model) ?? { totalTokens: 0, requests: 0 };
    entry.totalTokens += event.totalTokens;
    entry.requests += event.requests;
    modelMap.set(event.model, entry);
  }

  return [...modelMap.entries()]
    .map(([model, totals]) => ({
      model,
      totalTokens: totals.totalTokens,
      requests: totals.requests,
      spendCents: spendByCategory.get(model) ?? 0,
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens);
}

export function formatDollarsFromCents(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toFixed(2)}`;
}
