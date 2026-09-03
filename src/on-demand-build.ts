import type { OnDemandBreakdown, OnDemandUsage } from "./on-demand-types";
import {
  asRecord,
  centsToDollars,
  pickPositiveDollars,
  readOptionalCents,
  toNumber,
} from "./on-demand-utils";

export function finalizeBreakdown(
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
export function emptyDisabled(): OnDemandUsage {
  return buildLimitedOnDemand(0, finalizeBreakdown(0, 0, 0, false), false);
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

export function finalizeOnDemandUsage(
  usage: OnDemandUsage,
  onDemandEnabled: boolean,
): OnDemandUsage {
  if (!onDemandEnabled && usage.state !== "disabled") {
    return coerceDisabledCap(usage);
  }
  return { ...usage, onDemandEnabled };
}

export function getOnDemandTotalSpend(onDemand: OnDemandUsage): number {
  if (onDemand.breakdown) return onDemand.breakdown.totalSpendDollars;
  return onDemand.spendDollars;
}
