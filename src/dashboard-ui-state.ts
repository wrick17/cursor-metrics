import * as vscode from "vscode";
import type { ChartMetric, UsageFilter } from "./dashboard-state";
import { isUsageDuration } from "./duration-options";
import type { UsageDuration } from "./model-breakdown";

const GLOBAL_STATE_KEY = "dashboardUiPreferences";

export type DashboardUiPreferences = {
  range?: UsageDuration;
  usageFilter?: UsageFilter;
  metric?: ChartMetric;
};

function isUsageFilter(value: unknown): value is UsageFilter {
  return value === "all" || value === "included" || value === "ondemand";
}

function isChartMetric(value: unknown): value is ChartMetric {
  return value === "spend" || value === "tokens" || value === "requests";
}

function sanitize(raw: unknown): DashboardUiPreferences {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const prefs: DashboardUiPreferences = {};
  if (isUsageDuration(o.range)) prefs.range = o.range;
  if (isUsageFilter(o.usageFilter)) prefs.usageFilter = o.usageFilter;
  if (isChartMetric(o.metric)) prefs.metric = o.metric;
  return prefs;
}

export function loadDashboardUiPreferences(context: vscode.ExtensionContext): DashboardUiPreferences {
  return sanitize(context.globalState.get(GLOBAL_STATE_KEY));
}

export async function saveDashboardUiPreferences(
  context: vscode.ExtensionContext,
  patch: DashboardUiPreferences,
): Promise<DashboardUiPreferences> {
  const current = loadDashboardUiPreferences(context);
  const next: DashboardUiPreferences = { ...current, ...patch };
  await context.globalState.update(GLOBAL_STATE_KEY, next);
  return next;
}
