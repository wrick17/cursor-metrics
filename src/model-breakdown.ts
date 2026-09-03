import type { DailySpendRow, UsageEvent } from "./cursor-api";
import { getBillingCycleCutoff, parseTimestamp } from "./cursor-api-utils";
import { eventRequestCount, eventTokenCount } from "./cursor-usage-parsing";

export type UsageDuration = "1d" | "7d" | "30d" | "billingCycle";

export type ModelAggregate = {
  model: string;
  totalTokens: number;
  requests: number;
  spendCents: number;
};

export type ModelBreakdownSortBy = "model" | "requests" | "tokens" | "spend";
export type SortOrder = "asc" | "desc";

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, "en-US");
}

function compareNumbers(a: number, b: number): number {
  return a - b;
}

function sortModelAggregates(
  rows: ModelAggregate[],
  sortBy: ModelBreakdownSortBy,
  sortOrder: SortOrder,
): ModelAggregate[] {
  const direction = sortOrder === "asc" ? 1 : -1;
  const sorted = [...rows].sort((a, b) => {
    if (sortBy === "model") {
      const byName = compareStrings(a.model, b.model);
      return byName === 0 ? 0 : byName * direction;
    }

    const metricDiff = sortBy === "requests"
      ? compareNumbers(a.requests, b.requests)
      : sortBy === "spend"
        ? compareNumbers(a.spendCents, b.spendCents)
        : compareNumbers(a.totalTokens, b.totalTokens);
    if (metricDiff !== 0) {
      return metricDiff * direction;
    }

    return compareStrings(a.model, b.model);
  });

  return sorted;
}

function getBillingCycleStart(resetAtIso: string, now = Date.now()): number {
  return getBillingCycleCutoff(resetAtIso, now);
}

function startOfUtcDay(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function eventTimestampMs(event: UsageEvent): number {
  return parseTimestamp(event.timestamp);
}

export function getDurationCutoff(
  duration: UsageDuration,
  resetAtIso: string | null,
  now = Date.now(),
): number {
  if (duration === "billingCycle") {
    if (!resetAtIso) return now - 31 * 86_400_000;
    return getBillingCycleStart(resetAtIso, now);
  }
  if (duration === "1d") {
    return startOfUtcDay(now);
  }
  const daysMap: Record<Exclude<UsageDuration, "billingCycle" | "1d">, number> = { "7d": 7, "30d": 30 };
  return now - daysMap[duration] * 86_400_000;
}

export function aggregateSpendByCategory(
  rows: DailySpendRow[],
  duration: UsageDuration,
  resetAtIso: string | null,
  now = Date.now(),
): Map<string, number> {
  const cutoff = getDurationCutoff(duration, resetAtIso, now);
  const totals = new Map<string, number>();

  for (const row of rows) {
    if (row.day < cutoff) continue;
    totals.set(row.category, (totals.get(row.category) ?? 0) + row.spendCents);
  }

  return totals;
}

export function aggregateTokensByCategory(
  rows: DailySpendRow[],
  duration: UsageDuration,
  resetAtIso: string | null,
  now = Date.now(),
): Map<string, number> {
  const cutoff = getDurationCutoff(duration, resetAtIso, now);
  const totals = new Map<string, number>();

  for (const row of rows) {
    if (row.day < cutoff) continue;
    totals.set(row.category, (totals.get(row.category) ?? 0) + row.totalTokens);
  }

  return totals;
}

export type UsageFilterKind = "all" | "included" | "ondemand";

function matchesUsageFilter(event: UsageEvent, filter: UsageFilterKind): boolean {
  if (filter === "all") return true;
  if (filter === "included") return event.kind === "Included";
  return event.kind === "On-Demand";
}

export function shouldPreferDailySpendTokens(
  spendRows: DailySpendRow[],
  usageFilter: UsageFilterKind = "all",
): boolean {
  return usageFilter === "all" && spendRows.length > 0;
}

export function buildModelTokenTotals(
  events: UsageEvent[],
  spendRows: DailySpendRow[],
  duration: UsageDuration,
  resetAtIso: string | null,
  now: number,
  usageFilter: UsageFilterKind,
): Map<string, number> {
  const preferDaily = shouldPreferDailySpendTokens(spendRows, usageFilter);
  if (preferDaily) {
    return aggregateTokensByCategory(spendRows, duration, resetAtIso, now);
  }

  const cutoff = getDurationCutoff(duration, resetAtIso, now);
  const totals = new Map<string, number>();
  for (const event of events) {
    if (eventTimestampMs(event) < cutoff) continue;
    if (!matchesUsageFilter(event, usageFilter)) continue;
    totals.set(event.model, (totals.get(event.model) ?? 0) + eventTokenCount(event));
  }
  return totals;
}

export type AggregateByModelOptions = {
  preferDailySpendTokens?: boolean;
};

export function aggregateByModel(
  events: UsageEvent[],
  spendRows: DailySpendRow[],
  duration: UsageDuration,
  resetAtIso: string | null,
  now = Date.now(),
  sortBy: ModelBreakdownSortBy = "tokens",
  sortOrder: SortOrder = "desc",
  options: AggregateByModelOptions = {},
): ModelAggregate[] {
  const cutoff = getDurationCutoff(duration, resetAtIso, now);
  const spendByCategory = aggregateSpendByCategory(spendRows, duration, resetAtIso, now);
  const tokensByCategory = aggregateTokensByCategory(spendRows, duration, resetAtIso, now);
  const preferDaily = options.preferDailySpendTokens ?? shouldPreferDailySpendTokens(spendRows);
  const modelMap = new Map<string, { totalTokens: number; requests: number }>();

  for (const event of events) {
    if (eventTimestampMs(event) < cutoff) continue;
    const entry = modelMap.get(event.model) ?? { totalTokens: 0, requests: 0 };
    entry.totalTokens += eventTokenCount(event);
    entry.requests += eventRequestCount(event);
    modelMap.set(event.model, entry);
  }

  const models = new Set<string>([
    ...modelMap.keys(),
    ...(preferDaily ? tokensByCategory.keys() : []),
  ]);

  const rows = [...models].map((model) => {
    const eventTotals = modelMap.get(model);
    const totalTokens = preferDaily
      ? (tokensByCategory.get(model) ?? eventTotals?.totalTokens ?? 0)
      : (eventTotals?.totalTokens ?? 0);
    return {
      model,
      totalTokens,
      requests: eventTotals?.requests ?? 0,
      spendCents: spendByCategory.get(model) ?? 0,
    };
  });
  return sortModelAggregates(rows, sortBy, sortOrder);
}

import type { DashboardCurrency, DashboardLocale } from "./dashboard-locale";
import { formatMoneyFromCents } from "./currency-format";

export function formatDollarsFromCents(
  cents: number,
  currency: DashboardCurrency = "usd",
  locale: DashboardLocale = "en",
): string {
  return formatMoneyFromCents(cents, currency, locale);
}

export function filterZeroTokenModels(rows: ModelAggregate[], excludeZeroTokenModels: boolean): ModelAggregate[] {
  if (!excludeZeroTokenModels) {
    return rows;
  }

  return rows.filter((row) => row.totalTokens > 0);
}
