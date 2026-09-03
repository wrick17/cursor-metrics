import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { parseUsageEvent } from "../src/cursor-api";
import {
  aggregateTheoreticalByModel,
  eventReportedUsageCostCents,
} from "../src/model-pricing";

const fixturesDir = join(import.meta.dir, "fixtures");

function loadUsageEventsFixture(): ReturnType<typeof parseUsageEvent>[] {
  const raw = JSON.parse(
    readFileSync(join(fixturesDir, "usage-events-page1.json"), "utf8").replace(/^\uFEFF/, ""),
  ) as { usageEventsDisplay?: unknown[] };
  const events = raw.usageEventsDisplay ?? [];
  return events.map((row) => parseUsageEvent(row)).filter((e): e is NonNullable<typeof e> => e !== null);
}

describe("reported usage cost (Cursor Included Usage alignment)", () => {
  const now = Date.UTC(2026, 7, 9, 12, 0, 0);
  const resetAt = "2026-08-09T00:00:00.000Z";

  it("parseUsageEvent maps tokenUsage.totalCents to tokenCostCents", () => {
    const events = loadUsageEventsFixture();
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event.tokenCostCents).toBeGreaterThan(0);
      expect(eventReportedUsageCostCents(event)).toBe(event.tokenCostCents);
    }
  });

  it("aggregate reportedCostCents equals sum of tokenCostCents for included fixture events", () => {
    const events = loadUsageEventsFixture();
    const expected = events.reduce((sum, e) => sum + eventReportedUsageCostCents(e), 0);
    const result = aggregateTheoreticalByModel(events, "billingCycle", resetAt, now);
    const reportedTotal = Object.values(result.theoreticalByModel).reduce(
      (sum, row) => sum + row.reportedCostCents,
      0,
    );
    expect(reportedTotal).toBeCloseTo(expected, 4);
    expect(reportedTotal).toBeGreaterThan(0);
  });

  it("reported cost is lower than catalog theoretical for first-party included events", () => {
    const events = loadUsageEventsFixture();
    const result = aggregateTheoreticalByModel(events, "billingCycle", resetAt, now, {
      applyCursorTokenRate: false,
    });
    const reportedTotal = Object.values(result.theoreticalByModel).reduce(
      (sum, row) => sum + row.reportedCostCents,
      0,
    );
    const theoreticalTotal = Object.values(result.theoreticalByModel).reduce(
      (sum, row) => sum + row.theoreticalCents,
      0,
    );
    expect(reportedTotal).toBeLessThan(theoreticalTotal);
  });
});
