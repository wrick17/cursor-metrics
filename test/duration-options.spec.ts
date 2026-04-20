import { describe, expect, it } from "bun:test";
import { normalizeUsageDuration } from "../src/duration-options";

describe("duration options", () => {
  it("falls back from billingCycle when unsupported", () => {
    expect(normalizeUsageDuration("billingCycle", false)).toBe("30d");
    expect(normalizeUsageDuration("billingCycle", true)).toBe("billingCycle");
    expect(normalizeUsageDuration("7d", false)).toBe("7d");
  });
});
