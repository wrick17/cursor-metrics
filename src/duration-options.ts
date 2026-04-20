import type { UsageDuration } from "./model-breakdown";

export type RollingUsageDuration = Exclude<UsageDuration, "billingCycle">;

export type DurationOption = {
  label: string;
  value: UsageDuration;
};

const ROLLING_DURATIONS: RollingUsageDuration[] = ["1d", "7d", "30d"];

export function isUsageDuration(value: unknown): value is UsageDuration {
  return value === "1d" || value === "7d" || value === "30d" || value === "billingCycle";
}

export function isRollingDuration(value: unknown): value is RollingUsageDuration {
  return value === "1d" || value === "7d" || value === "30d";
}

export function getDurationLabel(duration: UsageDuration): string {
  if (duration === "1d") return "24 hours";
  if (duration === "7d") return "7 days";
  if (duration === "30d") return "30 days";
  return "Current Billing Cycle";
}

export function buildDurationOptions(hasBillingCycle: boolean): DurationOption[] {
  const options: DurationOption[] = ROLLING_DURATIONS.map((duration) => ({
    value: duration,
    label: getDurationLabel(duration),
  }));
  if (hasBillingCycle) {
    options.push({ value: "billingCycle", label: getDurationLabel("billingCycle") });
  }
  return options;
}

export function normalizeUsageDuration(duration: UsageDuration, hasBillingCycle: boolean): UsageDuration {
  if (duration === "billingCycle" && !hasBillingCycle) {
    return "30d";
  }
  return duration;
}
