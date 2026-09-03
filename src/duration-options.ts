import type { UsageDuration } from "./model-breakdown";
import * as vscode from "vscode";

export function isUsageDuration(value: unknown): value is UsageDuration {
  return value === "1d" || value === "7d" || value === "30d" || value === "billingCycle";
}

export function normalizeUsageDuration(duration: UsageDuration, hasBillingCycle: boolean): UsageDuration {
  if (duration === "billingCycle" && !hasBillingCycle) {
    return "30d";
  }
  return duration;
}

export function resolveConfiguredUsageDuration(value: unknown, hasBillingCycle: boolean): UsageDuration {
  const configuredDuration = isUsageDuration(value) ? value : "billingCycle";
  return normalizeUsageDuration(configuredDuration, hasBillingCycle);
}

export async function syncUsageDurationToSettings(
  range: UsageDuration,
  hasBillingCycle: boolean,
): Promise<void> {
  const normalized = normalizeUsageDuration(range, hasBillingCycle);
  await vscode.workspace
    .getConfiguration("cursorUsage")
    .update("usageDuration", normalized, vscode.ConfigurationTarget.Global);
}
