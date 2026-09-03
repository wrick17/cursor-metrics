import { describe, expect, it } from "bun:test";
import type { UsageEvent } from "../src/cursor-api-types";
import { eventReportedUsageCostCents } from "../src/model-pricing";

/**
 * Mirrors media/dashboard/modules/format.js chartSpendDollars logic for unit tests.
 */
function chartSpendDollars(
  event: UsageEvent,
  quotaAwareEventDisplay: boolean,
): number {
  const isOnDemand = event.kind === "On-Demand";
  const billable =
    quotaAwareEventDisplay && !isOnDemand ? 0 : (event.spendCents || 0) / 100;
  if (billable > 0) return billable;
  if (quotaAwareEventDisplay && !isOnDemand) {
    const tokenCost = (event.tokenCostCents || 0) / 100;
    if (tokenCost > 0) return tokenCost;
  }
  return 0;
}

const included: UsageEvent = {
  timestamp: Date.now(),
  model: "default",
  kind: "Included",
  totalTokens: 1000,
  requests: 1,
  spendCents: 16,
  maxMode: false,
  inputTokens: 500,
  outputTokens: 500,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  tokenCostCents: 32.75,
  cursorTokenFee: 0,
  isTokenBasedCall: true,
  isHeadless: false,
  isChargeable: true,
  conversationId: null,
};

describe("chart spend helpers", () => {
  it("uses tokenCostCents for included events when quota-aware", () => {
    expect(chartSpendDollars(included, true)).toBeCloseTo(0.3275, 4);
    expect(eventReportedUsageCostCents(included)).toBeCloseTo(32.75, 2);
  });

  it("uses spendCents for on-demand events", () => {
    const onDemand = { ...included, kind: "On-Demand" as const, spendCents: 99, tokenCostCents: 32.75 };
    expect(chartSpendDollars(onDemand, true)).toBeCloseTo(0.99, 4);
    expect(eventReportedUsageCostCents(onDemand)).toBe(99);
  });

  it("shows zero billable spend for included when quota-aware off", () => {
    expect(chartSpendDollars(included, false)).toBeCloseTo(0.16, 4);
  });
});
