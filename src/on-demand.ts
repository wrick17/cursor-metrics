export type OnDemandBreakdown = {
  mySpendDollars: number;
  othersSpendDollars: number;
  totalSpendDollars: number;
  remainingDollars: number;
  isTeamPool: boolean;
};

export type OnDemandUsage = {
  state: "disabled" | "limited" | "unlimited";
  onDemandEnabled: boolean;
  spendDollars: number;
  limitDollars: number | null;
  breakdown?: OnDemandBreakdown;
};

function centsToDollars(cents: number): number {
  return cents / 100;
}

function pickPositiveDollars(...values: Array<number | null>): number | null {
  for (const value of values) {
    if (value !== null && value > 0) return value;
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function finalizeBreakdown(
  limitDollars: number,
  mySpendDollars: number,
  othersSpendDollars: number,
  isTeamPool: boolean,
): OnDemandBreakdown {
  const totalSpendDollars = mySpendDollars + othersSpendDollars;
  return {
    mySpendDollars,
    othersSpendDollars,
    totalSpendDollars,
    remainingDollars: Math.max(0, limitDollars - totalSpendDollars),
    isTeamPool,
  };
}

function buildLimitedOnDemand(
  limitDollars: number,
  breakdown: OnDemandBreakdown,
  onDemandEnabled: boolean,
): OnDemandUsage {
  return {
    state: "limited",
    onDemandEnabled,
    spendDollars: breakdown.mySpendDollars,
    limitDollars,
    breakdown: finalizeBreakdown(
      limitDollars,
      breakdown.mySpendDollars,
      breakdown.othersSpendDollars,
      breakdown.isTeamPool,
    ),
  };
}

/** Zero-cap limited state so UI can show spend with on-demand turned off. */
function emptyDisabled(): OnDemandUsage {
  return buildLimitedOnDemand(0, finalizeBreakdown(0, 0, 0, false), false);
}

function readOptionalCents(record: Record<string, unknown>, field: string): number | null {
  if (!(field in record)) return null;
  return toNumber(record[field]);
}

function buildUnlimitedOnDemand(
  mySpendDollars: number,
  othersSpendDollars: number,
  isTeamPool: boolean,
): OnDemandUsage {
  return {
    state: "unlimited",
    onDemandEnabled: true,
    spendDollars: mySpendDollars,
    limitDollars: null,
    breakdown: finalizeBreakdown(0, mySpendDollars, othersSpendDollars, isTeamPool),
  };
}

function segmentsFromSpendShares(breakdown: OnDemandBreakdown): ProgressSegment[] {
  const totalSpend = breakdown.totalSpendDollars;
  if (totalSpend <= 0) return [];
  const youRatio = breakdown.mySpendDollars / totalSpend;
  const othersRatio = breakdown.othersSpendDollars / totalSpend;
  const segments: ProgressSegment[] = [];
  if (youRatio > 0) segments.push({ ratio: youRatio, opacity: 0.9 });
  if (othersRatio > 0) segments.push({ ratio: othersRatio, opacity: 0.45 });
  return segments;
}

export function resolveMemberLimitDollars(member: Record<string, unknown>): number | null {
  const hardLimit = toNumber(member.hardLimitOverrideDollars);
  if (hardLimit !== null && hardLimit > 0) return hardLimit;
  const monthlyLimit = toNumber(member.monthlyLimitDollars);
  if (monthlyLimit !== null && monthlyLimit > 0) return monthlyLimit;
  return null;
}

function pickTeamLimitDollars(dataRecord: Record<string, unknown>): number | null {
  const fields = [
    "teamHardLimitDollars",
    "teamSpendLimitDollars",
    "teamMonthlySpendLimitDollars",
    "monthlyTeamSpendLimitDollars",
    "hardLimitDollars",
    "spendLimitDollars",
    "monthlySpendLimitDollars",
  ];
  for (const field of fields) {
    const value = toNumber(dataRecord[field]);
    if (value !== null && value > 0) return value;
  }
  return null;
}

function sumTeamSpendCents(members: unknown[]): number {
  let total = 0;
  for (const member of members) {
    const record = asRecord(member);
    if (!record) continue;
    total += toNumber(record.spendCents) ?? 0;
  }
  return total;
}

function resolveLimitDollars(onDemandEnabled: boolean, apiLimitDollars: number): number {
  return onDemandEnabled ? apiLimitDollars : 0;
}

export function buildOnDemandFromSpendLimit(
  spendLimitRaw: unknown,
  onDemandEnabled: boolean,
  mySpendCents = 0,
): OnDemandUsage {
  const spendLimit = asRecord(spendLimitRaw);
  const myFallbackDollars = centsToDollars(mySpendCents);

  if (!spendLimit) {
    if (mySpendCents > 0) {
      return onDemandEnabled
        ? buildUnlimitedOnDemand(myFallbackDollars, 0, false)
        : buildLimitedOnDemand(0, finalizeBreakdown(0, myFallbackDollars, 0, false), false);
    }
    return onDemandEnabled
      ? { state: "unlimited", onDemandEnabled: true, spendDollars: 0, limitDollars: null }
      : emptyDisabled();
  }

  const limitType = typeof spendLimit.limitType === "string" ? spendLimit.limitType : null;
  const pooledLimitCents = readOptionalCents(spendLimit, "pooledLimit");
  const individualLimitCents = readOptionalCents(spendLimit, "individualLimit");
  const pooledUsedCents = toNumber(spendLimit.pooledUsed);
  const pooledRemainingCents = toNumber(spendLimit.pooledRemaining);
  const individualUsedCents = toNumber(spendLimit.individualUsed);
  const individualRemainingCents = toNumber(spendLimit.individualRemaining);
  const totalSpendCents = toNumber(spendLimit.totalSpend);

  const apiPooledLimitDollars = pooledLimitCents !== null ? centsToDollars(pooledLimitCents) : null;
  const isTeamPool =
    limitType === "team" ||
    (pooledLimitCents !== null && pooledLimitCents > 0) ||
    (pooledUsedCents ?? 0) > 0;

  if (isTeamPool) {
    const apiLimitDollars = apiPooledLimitDollars ?? 0;

    let totalUsedDollars = pooledUsedCents !== null ? centsToDollars(pooledUsedCents) : 0;
    if (totalUsedDollars === 0 && apiLimitDollars > 0 && pooledRemainingCents !== null) {
      totalUsedDollars = Math.max(0, apiLimitDollars - centsToDollars(pooledRemainingCents));
    }

    let mySpendDollars = individualUsedCents !== null
      ? centsToDollars(individualUsedCents)
      : myFallbackDollars;
    if (totalUsedDollars > 0) {
      mySpendDollars = Math.min(Math.max(0, mySpendDollars), totalUsedDollars);
    } else if (mySpendDollars > 0) {
      totalUsedDollars = mySpendDollars;
    }

    const othersSpendDollars = Math.max(0, totalUsedDollars - mySpendDollars);
    if (totalUsedDollars <= 0 && mySpendDollars <= 0) {
      if (pooledLimitCents !== null && pooledLimitCents > 0) {
        const limitDollars = resolveLimitDollars(onDemandEnabled, apiPooledLimitDollars ?? 0);
        return buildLimitedOnDemand(
          limitDollars,
          finalizeBreakdown(limitDollars, 0, 0, true),
          onDemandEnabled,
        );
      }
      return onDemandEnabled
        ? { state: "unlimited", onDemandEnabled: true, spendDollars: 0, limitDollars: null }
        : emptyDisabled();
    }

    if (onDemandEnabled && pooledLimitCents === null) {
      return buildUnlimitedOnDemand(mySpendDollars, othersSpendDollars, true);
    }

    const limitDollars = resolveLimitDollars(onDemandEnabled, apiLimitDollars);
    return buildLimitedOnDemand(
      limitDollars,
      finalizeBreakdown(limitDollars, mySpendDollars, othersSpendDollars, true),
      onDemandEnabled,
    );
  }

  const apiIndividualLimitDollars = individualLimitCents !== null ? centsToDollars(individualLimitCents) : null;
  const individualUsedDollars = individualUsedCents !== null ? centsToDollars(individualUsedCents) : 0;
  const hasIndividualActivity =
    (individualLimitCents !== null && individualLimitCents > 0) ||
    individualUsedDollars > 0 ||
    (individualRemainingCents !== null && individualLimitCents !== null && individualLimitCents > 0);

  if (hasIndividualActivity) {
    let spendDollars = individualUsedDollars;
    if (spendDollars === 0 && (apiIndividualLimitDollars ?? 0) > 0 && individualRemainingCents !== null) {
      spendDollars = Math.max(0, (apiIndividualLimitDollars ?? 0) - centsToDollars(individualRemainingCents));
    }
    if (spendDollars === 0) spendDollars = myFallbackDollars;

    if (spendDollars <= 0) {
      if (individualLimitCents !== null && individualLimitCents > 0) {
        const limitDollars = resolveLimitDollars(onDemandEnabled, apiIndividualLimitDollars ?? 0);
        return buildLimitedOnDemand(
          limitDollars,
          finalizeBreakdown(limitDollars, 0, 0, false),
          onDemandEnabled,
        );
      }
      return onDemandEnabled
        ? { state: "unlimited", onDemandEnabled: true, spendDollars: 0, limitDollars: null }
        : emptyDisabled();
    }

    if (onDemandEnabled && individualLimitCents === null) {
      return buildUnlimitedOnDemand(spendDollars, 0, false);
    }

    const limitDollars = resolveLimitDollars(onDemandEnabled, apiIndividualLimitDollars ?? 0);
    return buildLimitedOnDemand(
      limitDollars,
      finalizeBreakdown(limitDollars, spendDollars, 0, false),
      onDemandEnabled,
    );
  }

  const totalSpendDollars = totalSpendCents !== null ? centsToDollars(totalSpendCents) : myFallbackDollars;
  if (totalSpendDollars > 0) {
    return onDemandEnabled
      ? buildUnlimitedOnDemand(totalSpendDollars, 0, false)
      : buildLimitedOnDemand(0, finalizeBreakdown(0, totalSpendDollars, 0, false), false);
  }

  return onDemandEnabled
    ? { state: "unlimited", onDemandEnabled: true, spendDollars: 0, limitDollars: null }
    : emptyDisabled();
}

export function buildTeamOnDemandFallback(
  members: unknown[],
  meRecord: Record<string, unknown>,
  dataRecord: Record<string, unknown>,
  onDemandEnabled: boolean,
): OnDemandUsage {
  const mySpendCents = toNumber(meRecord.spendCents) ?? 0;
  const totalTeamSpendCents = sumTeamSpendCents(members);
  const mySpendDollars = centsToDollars(mySpendCents);
  const totalSpendDollars = centsToDollars(totalTeamSpendCents);

  if (!onDemandEnabled) {
    if (totalSpendDollars <= 0 && mySpendDollars <= 0) return emptyDisabled();
    const isTeamPool = totalTeamSpendCents > mySpendCents;
    const othersSpendDollars = Math.max(0, totalSpendDollars - mySpendDollars);
    return buildLimitedOnDemand(
      0,
      finalizeBreakdown(0, mySpendDollars, othersSpendDollars, isTeamPool),
      false,
    );
  }

  const limitDollars = pickPositiveDollars(
    pickTeamLimitDollars(dataRecord),
    resolveMemberLimitDollars(meRecord),
  );

  if (limitDollars === null) {
    if (totalSpendDollars <= 0 && mySpendDollars <= 0) {
      return { state: "unlimited", onDemandEnabled: true, spendDollars: 0, limitDollars: null };
    }
    const isTeamPool = totalTeamSpendCents > mySpendCents;
    const othersSpendDollars = Math.max(0, totalSpendDollars - mySpendDollars);
    return buildUnlimitedOnDemand(mySpendDollars, othersSpendDollars, isTeamPool);
  }

  const isTeamPool = totalTeamSpendCents > mySpendCents || pickTeamLimitDollars(dataRecord) !== null;
  const othersSpendDollars = isTeamPool ? Math.max(0, totalSpendDollars - mySpendDollars) : 0;

  return buildLimitedOnDemand(
    limitDollars,
    finalizeBreakdown(limitDollars, mySpendDollars, othersSpendDollars, isTeamPool),
    true,
  );
}

function onDemandRichness(onDemand: OnDemandUsage): number {
  return onDemand.breakdown?.totalSpendDollars ?? onDemand.spendDollars;
}

function onDemandSortScore(onDemand: OnDemandUsage): number {
  if (onDemand.state === "disabled") return 0;
  if (!onDemand.onDemandEnabled && onDemand.state === "limited") return 35;
  if (onDemand.state === "limited" && (onDemand.limitDollars ?? 0) > 0) return 40;
  if (onDemand.state === "unlimited" && onDemand.breakdown) return 30;
  if (onDemand.state === "limited" && onDemand.breakdown) return 20;
  if (onDemand.state === "unlimited" && onDemand.spendDollars > 0) return 10;
  return 1;
}

function coerceDisabledCap(usage: OnDemandUsage): OnDemandUsage {
  if (!usage.breakdown || getOnDemandTotalSpend(usage) <= 0) return emptyDisabled();
  return buildLimitedOnDemand(0, usage.breakdown, false);
}

export function mergeOnDemandUsage(
  primary: OnDemandUsage,
  fallback: OnDemandUsage,
  onDemandEnabled: boolean,
): OnDemandUsage {
  if (!onDemandEnabled) {
    const capped = [primary, fallback].filter(
      (usage) => usage.state === "limited" && !usage.onDemandEnabled,
    );
    if (capped.length > 0) {
      return [...capped].sort((a, b) => onDemandRichness(b) - onDemandRichness(a))[0]!;
    }
    const withSpend = [primary, fallback].find((usage) => getOnDemandTotalSpend(usage) > 0);
    return withSpend ? coerceDisabledCap(withSpend) : emptyDisabled();
  }

  const candidates = [
    { ...primary, onDemandEnabled: true },
    { ...fallback, onDemandEnabled: true },
  ];
  return candidates.sort((a, b) => {
    const scoreDiff = onDemandSortScore(b) - onDemandSortScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return onDemandRichness(b) - onDemandRichness(a);
  })[0]!;
}

export function isOnDemandVisible(onDemand: OnDemandUsage): boolean {
  if (onDemand.state === "disabled") return false;
  return true;
}

export function getOnDemandDisplaySpend(onDemand: OnDemandUsage): number {
  return onDemand.breakdown?.mySpendDollars ?? onDemand.spendDollars;
}

export function getOnDemandTotalSpend(onDemand: OnDemandUsage): number {
  if (onDemand.breakdown) return onDemand.breakdown.totalSpendDollars;
  return onDemand.spendDollars;
}

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

  // Uncapped enabled pools omit limit/remaining; disabled pools pin remaining to 0.
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

/** Bar scale: when usage exceeds the cap, use team total so you/team shares fill the bar. */
export function getOnDemandBarScaleDollars(onDemand: OnDemandUsage): number {
  const breakdown = onDemand.breakdown;
  const totalSpend = getOnDemandTotalSpend(onDemand);
  const limitDollars = onDemand.limitDollars ?? 0;

  if (breakdown && limitDollars > 0 && totalSpend > limitDollars) {
    return totalSpend;
  }
  if (
    onDemand.state === "unlimited" ||
    onDemand.onDemandEnabled === false ||
    limitDollars <= 0
  ) {
    return totalSpend > 0 ? totalSpend : limitDollars;
  }
  return limitDollars > 0 ? limitDollars : totalSpend;
}

export function finalizeOnDemandUsage(
  usage: OnDemandUsage,
  onDemandEnabled: boolean,
): OnDemandUsage {
  if (!onDemandEnabled && usage.state !== "disabled") {
    return coerceDisabledCap(usage);
  }
  return { ...usage, onDemandEnabled };
}

export function getOnDemandRatio(onDemand: OnDemandUsage): number | null {
  if (onDemand.state !== "limited") return null;
  if (onDemand.limitDollars === null || onDemand.limitDollars <= 0) return null;
  return getOnDemandTotalSpend(onDemand) / onDemand.limitDollars;
}

export function formatOnDemandValue(onDemand: OnDemandUsage): string {
  const mySpend = getOnDemandDisplaySpend(onDemand);
  if (
    onDemand.state === "unlimited" ||
    onDemand.onDemandEnabled === false ||
    onDemand.breakdown?.isTeamPool
  ) {
    return `$${mySpend.toFixed(2)}`;
  }
  return `$${mySpend.toFixed(2)} / $${(onDemand.limitDollars ?? 0).toFixed(2)}`;
}

export function formatOnDemandBreakdownFooter(onDemand: OnDemandUsage): string {
  const breakdown = onDemand.breakdown;
  if (!breakdown) return "";

  if (onDemand.onDemandEnabled === false) {
    const leftTotal = "Left $0.00 / $0.00";
    if (breakdown.isTeamPool) {
      return `Team ${formatDollars(breakdown.othersSpendDollars)} · ${leftTotal}`;
    }
    return leftTotal;
  }

  if (onDemand.state === "unlimited") {
    if (breakdown.isTeamPool) {
      return `Team ${formatDollars(breakdown.othersSpendDollars)} · No limit`;
    }
    return "No limit";
  }

  if (onDemand.state !== "limited") return "";

  const limitDollars = onDemand.limitDollars ?? 0;
  const leftTotal = `Left ${formatDollars(breakdown.remainingDollars)} / ${formatDollars(limitDollars)}`;

  if (breakdown.isTeamPool) {
    return `Team ${formatDollars(breakdown.othersSpendDollars)} · ${leftTotal}`;
  }

  return leftTotal;
}

function formatDollars(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export type ProgressSegment = { ratio: number; opacity: number };

export function getOnDemandProgressSegments(onDemand: OnDemandUsage): ProgressSegment[] | null {
  const breakdown = onDemand.breakdown;

  if (onDemand.state === "unlimited") {
    if (!breakdown || breakdown.totalSpendDollars <= 0) return null;
    const segments = segmentsFromSpendShares(breakdown);
    return segments.length > 0 ? segments : null;
  }

  if (onDemand.state !== "limited") return null;

  const limitDollars = onDemand.limitDollars ?? 0;

  if (limitDollars <= 0) {
    const totalSpend = getOnDemandTotalSpend(onDemand);
    if (totalSpend <= 0) return null;
    if (!breakdown) return [{ ratio: 1, opacity: 0.85 }];
    const segments = segmentsFromSpendShares(breakdown);
    return segments.length > 0 ? segments : [{ ratio: 1, opacity: 0.85 }];
  }

  if (!breakdown) {
    const scale = getOnDemandBarScaleDollars(onDemand);
    if (scale <= 0) return null;
    const usedRatio = Math.min(1, onDemand.spendDollars / scale);
    return [{ ratio: usedRatio, opacity: 0.85 }];
  }

  const scale = getOnDemandBarScaleDollars(onDemand);
  if (scale <= 0) return null;

  const totalSpend = breakdown.totalSpendDollars;
  if (limitDollars > 0 && totalSpend > limitDollars) {
    return segmentsFromSpendShares(breakdown);
  }

  const youRatio = Math.min(1, breakdown.mySpendDollars / scale);
  const othersRatio = Math.min(Math.max(0, 1 - youRatio), breakdown.othersSpendDollars / scale);
  const segments: ProgressSegment[] = [];
  if (youRatio > 0) segments.push({ ratio: youRatio, opacity: 0.9 });
  if (othersRatio > 0) segments.push({ ratio: othersRatio, opacity: 0.45 });
  return segments;
}
