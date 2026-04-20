import { describe, expect, it } from "bun:test";
import type { DailySpendRow, UsageEvent } from "../src/cursor-api";
import {
  aggregateByModel,
  aggregateSpendByCategory,
  formatDollarsFromCents,
  getDurationCutoff,
} from "../src/model-breakdown";

const now = Date.UTC(2026, 3, 20, 12, 0, 0);
const dayMs = 86_400_000;

describe("model breakdown aggregation", () => {
  it("sums spend by category for the selected duration", () => {
    const spendRows: DailySpendRow[] = [
      { day: now - 2 * dayMs, category: "gpt-5.3-codex", spendCents: 120, totalTokens: 10_000 },
      { day: now - 2 * dayMs, category: "gpt-5.3-codex", spendCents: 80, totalTokens: 20_000 },
      { day: now - 1 * dayMs, category: "gpt-5.4-high", spendCents: 55, totalTokens: 5_000 },
      { day: now - 40 * dayMs, category: "gpt-5.3-codex", spendCents: 999, totalTokens: 100_000 },
    ];

    const totals = aggregateSpendByCategory(spendRows, "7d", now);
    expect(totals.get("gpt-5.3-codex")).toBe(200);
    expect(totals.get("gpt-5.4-high")).toBe(55);
    expect(totals.has("unknown")).toBeFalse();
  });

  it("joins tokens, requests, and spend by model", () => {
    const events: UsageEvent[] = [
      { timestamp: now - 1 * dayMs, model: "gpt-5.3-codex", kind: "On-Demand", totalTokens: 2000, requests: 2 },
      { timestamp: now - 2 * dayMs, model: "gpt-5.3-codex", kind: "On-Demand", totalTokens: 3000, requests: 1 },
      { timestamp: now - 1 * dayMs, model: "composer-2", kind: "Included", totalTokens: 1000, requests: 4 },
    ];
    const spendRows: DailySpendRow[] = [
      { day: now - 1 * dayMs, category: "gpt-5.3-codex", spendCents: 320, totalTokens: 5000 },
    ];

    const rows = aggregateByModel(events, spendRows, "7d", now);
    expect(rows).toEqual([
      { model: "gpt-5.3-codex", totalTokens: 5000, requests: 3, spendCents: 320 },
      { model: "composer-2", totalTokens: 1000, requests: 4, spendCents: 0 },
    ]);
  });

  it("applies duration cutoffs for 1d, 7d, and 30d", () => {
    const events: UsageEvent[] = [
      { timestamp: now - 6 * dayMs, model: "gpt-5.3-codex", kind: "Included", totalTokens: 100, requests: 1 },
      { timestamp: now - 20 * dayMs, model: "gpt-5.3-codex", kind: "Included", totalTokens: 200, requests: 1 },
      { timestamp: now - 35 * dayMs, model: "gpt-5.3-codex", kind: "Included", totalTokens: 300, requests: 1 },
    ];
    const spendRows: DailySpendRow[] = [
      { day: now - 6 * dayMs, category: "gpt-5.3-codex", spendCents: 50, totalTokens: 100 },
      { day: now - 20 * dayMs, category: "gpt-5.3-codex", spendCents: 80, totalTokens: 200 },
      { day: now - 35 * dayMs, category: "gpt-5.3-codex", spendCents: 90, totalTokens: 300 },
    ];

    const oneDay = aggregateByModel(events, spendRows, "1d", now);
    expect(oneDay).toHaveLength(0);

    const sevenDays = aggregateByModel(events, spendRows, "7d", now);
    expect(sevenDays[0]).toEqual({
      model: "gpt-5.3-codex",
      totalTokens: 100,
      requests: 1,
      spendCents: 50,
    });

    const thirtyDays = aggregateByModel(events, spendRows, "30d", now);
    expect(thirtyDays[0]).toEqual({
      model: "gpt-5.3-codex",
      totalTokens: 300,
      requests: 2,
      spendCents: 130,
    });
  });
});

describe("model breakdown formatting", () => {
  it("formats cents into dollars", () => {
    expect(formatDollarsFromCents(0)).toBe("$0.00");
    expect(formatDollarsFromCents(229)).toBe("$2.29");
    expect(formatDollarsFromCents(12345)).toBe("$123.45");
  });

  it("computes cutoff timestamps for all durations", () => {
    expect(getDurationCutoff("1d", now)).toBe(now - 1 * dayMs);
    expect(getDurationCutoff("7d", now)).toBe(now - 7 * dayMs);
    expect(getDurationCutoff("30d", now)).toBe(now - 30 * dayMs);
  });
});
