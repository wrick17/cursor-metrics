import { asRecord, readOptionalCents, toNumber } from "./on-demand-utils";

function resolveStripeOnDemandFlag(stripeRecord: Record<string, unknown> | null): boolean | null {
  if (!stripeRecord) return null;
  const explicitKeys = [
    "isUsageBasedPricingEnabled",
    "usageBasedPricingEnabled",
    "isOnDemandEnabled",
    "onDemandEnabled",
  ] as const;
  for (const key of explicitKeys) {
    if (typeof stripeRecord[key] === "boolean") return stripeRecord[key];
  }
  if (typeof stripeRecord.isOnBillableAuto === "boolean") return stripeRecord.isOnBillableAuto;
  return null;
}

function resolveTeamOnDemandFlag(teamDataRecord: Record<string, unknown> | null): boolean | null {
  if (!teamDataRecord) return null;
  const keys = [
    "onDemandEnabled",
    "usageBasedPricingEnabled",
    "isUsageBasedPricingEnabled",
    "isOnDemandEnabled",
  ] as const;
  for (const key of keys) {
    if (typeof teamDataRecord[key] === "boolean") return teamDataRecord[key];
  }
  return null;
}

/** Team pool with spend but no cap and zero remaining → on-demand off (not uncapped). */
export function inferOnDemandDisabledFromSpendLimit(
  spendLimit: Record<string, unknown>,
): boolean {
  const pooledUsed = toNumber(spendLimit.pooledUsed) ?? 0;
  const individualUsed = toNumber(spendLimit.individualUsed) ?? 0;
  const pooledLimit = readOptionalCents(spendLimit, "pooledLimit");
  const individualLimit = readOptionalCents(spendLimit, "individualLimit");
  const pooledRemaining = readOptionalCents(spendLimit, "pooledRemaining");
  const individualRemaining = readOptionalCents(spendLimit, "individualRemaining");

  const isTeamPool =
    spendLimit.limitType === "team" ||
    pooledUsed > 0 ||
    (pooledLimit !== null && pooledLimit > 0);

  if (!isTeamPool) {
    if (individualUsed <= 0) return false;
    if ((individualLimit ?? 0) > 0) return false;
    if (individualLimit === 0) return true;
    return individualRemaining === 0;
  }

  if (pooledUsed <= 0 && individualUsed <= 0) return false;
  if ((pooledLimit ?? 0) > 0 || (individualLimit ?? 0) > 0) return false;

  if (pooledLimit === null && pooledUsed > 0 && pooledRemaining === 0) return true;
  if (pooledLimit === null && pooledUsed > 0 && individualRemaining === 0) return true;

  return false;
}

/** Dashboard usage-summary exposes the real on-demand toggle (`teamUsage` / `individualUsage`). */
export function resolveOnDemandFromUsageSummary(
  summary: Record<string, unknown> | null,
  isTeamMember: boolean,
): boolean | null {
  if (!summary) return null;

  if (isTeamMember) {
    const teamOnDemand = asRecord(asRecord(summary.teamUsage)?.onDemand);
    if (typeof teamOnDemand?.enabled === "boolean") return teamOnDemand.enabled;
  }

  const individualOnDemand = asRecord(asRecord(summary.individualUsage)?.onDemand);
  if (typeof individualOnDemand?.enabled === "boolean") return individualOnDemand.enabled;

  return null;
}

export function resolveOnDemandEnabled(
  stripeRecord: Record<string, unknown> | null,
  periodUsage: Record<string, unknown> | null,
  teamDataRecord: Record<string, unknown> | null = null,
  usageSummaryEnabled: boolean | null = null,
): boolean {
  if (usageSummaryEnabled === false) return false;
  if (usageSummaryEnabled === true) return true;

  const teamFlag = resolveTeamOnDemandFlag(teamDataRecord);
  if (teamFlag === false) return false;

  const spendLimit = asRecord(periodUsage?.spendLimitUsage);
  if (spendLimit && inferOnDemandDisabledFromSpendLimit(spendLimit)) return false;

  if (periodUsage?.enabled === false && !spendLimit) return false;

  const stripeFlag = resolveStripeOnDemandFlag(stripeRecord);
  if (stripeFlag === false) return false;
  if (stripeFlag === true) return true;

  if (periodUsage?.enabled === false) return false;
  return false;
}
