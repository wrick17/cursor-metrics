import type { UsageDuration } from "./model-breakdown";

export function isUsageDuration(value: unknown): value is UsageDuration {
  return value === "1d" || value === "7d" || value === "30d" || value === "billingCycle";
}

export function getDurationLabel(duration: UsageDuration): string {
  if (duration === "1d") return "24 hours";
  if (duration === "7d") return "7 days";
  if (duration === "30d") return "30 days";
  return "Current Billing Cycle";
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
