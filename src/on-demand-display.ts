import type { OnDemandUsage, ProgressSegment } from "./on-demand-types";
import { getOnDemandTotalSpend } from "./on-demand-build";

export function isOnDemandVisible(onDemand: OnDemandUsage): boolean {
  if (onDemand.onDemandEnabled === false) return false;
  return onDemand.state !== "disabled";
}

export function getOnDemandDisplaySpend(onDemand: OnDemandUsage): number {
  return onDemand.breakdown?.mySpendDollars ?? onDemand.spendDollars;
}

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

function formatDollars(amount: number): string {
  return `$${amount.toFixed(2)}`;
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

function segmentsFromSpendShares(breakdown: NonNullable<OnDemandUsage["breakdown"]>): ProgressSegment[] {
  const totalSpend = breakdown.totalSpendDollars;
  if (totalSpend <= 0) return [];
  const youRatio = breakdown.mySpendDollars / totalSpend;
  const othersRatio = breakdown.othersSpendDollars / totalSpend;
  const segments: ProgressSegment[] = [];
  if (youRatio > 0) segments.push({ ratio: youRatio, opacity: 0.9 });
  if (othersRatio > 0) segments.push({ ratio: othersRatio, opacity: 0.45 });
  return segments;
}

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
