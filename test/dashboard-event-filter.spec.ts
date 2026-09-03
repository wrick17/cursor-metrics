import { describe, expect, it } from "bun:test";
import type { UsageEvent } from "../src/cursor-api";
import { filterDashboardEvents } from "../src/dashboard-state";

const dayMs = 86_400_000;
const now = Date.UTC(2026, 3, 20, 12, 0, 0);

const events: UsageEvent[] = [
  {
    timestamp: now - 2 * dayMs,
    model: "gpt-5",
    kind: "Included",
    totalTokens: 100,
    requests: 1,
    spendCents: 0,
    maxMode: false,
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    tokenCostCents: 0,
    cursorTokenFee: 0,
    isTokenBasedCall: false,
    isHeadless: false,
    isChargeable: true,
    conversationId: null,
  },
  {
    timestamp: now - 10 * dayMs,
    model: "gpt-5",
    kind: "On-Demand",
    totalTokens: 200,
    requests: 1,
    spendCents: 50,
    maxMode: false,
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    tokenCostCents: 0,
    cursorTokenFee: 0,
    isTokenBasedCall: false,
    isHeadless: false,
    isChargeable: true,
    conversationId: null,
  },
];

describe("filterDashboardEvents", () => {
  it("returns all events when prefs are null", () => {
    expect(filterDashboardEvents(events, null, null, now)).toHaveLength(2);
  });

  it("filters by range and usage kind when prefs are set", () => {
    const filtered = filterDashboardEvents(
      events,
      { range: "7d", usageFilter: "included" },
      null,
      now,
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.kind).toBe("Included");
  });
});
