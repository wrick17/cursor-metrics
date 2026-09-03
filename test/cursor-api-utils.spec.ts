import { describe, expect, it } from "bun:test";
import { getBillingCycleCutoff, nextMonth, shiftUtcMonth } from "../src/cursor-api-utils";

describe("shiftUtcMonth", () => {
  it("clamps end-of-month days instead of overflowing into the next month", () => {
    expect(shiftUtcMonth(Date.parse("2026-03-31T15:37:46.000Z"), -1)).toBe("2026-02-28T15:37:46.000Z");
    expect(shiftUtcMonth(Date.parse("2026-01-31T12:00:00.000Z"), 1)).toBe("2026-02-28T12:00:00.000Z");
  });

  it("keeps mid-month days stable across UTC month shifts", () => {
    expect(shiftUtcMonth(Date.parse("2026-08-02T15:37:46.000Z"), -1)).toBe("2026-07-02T15:37:46.000Z");
  });
});

describe("getBillingCycleCutoff", () => {
  it("subtracts one UTC month from the reset timestamp", () => {
    const cutoff = getBillingCycleCutoff("2026-08-02T15:37:46.000Z", Date.UTC(2026, 6, 5));
    expect(cutoff).toBe(Date.parse("2026-07-02T15:37:46.000Z"));
  });

  it("does not collapse March 31 resets into early March", () => {
    const cutoff = getBillingCycleCutoff("2026-03-31T15:37:46.000Z", Date.UTC(2026, 2, 15));
    expect(cutoff).toBe(Date.parse("2026-02-28T15:37:46.000Z"));
  });
});

describe("nextMonth", () => {
  it("advances by one UTC month with day clamping", () => {
    expect(nextMonth("2026-01-31T12:00:00.000Z")).toBe("2026-02-28T12:00:00.000Z");
    expect(nextMonth("2026-07-02T15:37:46.000Z")).toBe("2026-08-02T15:37:46.000Z");
  });
});
