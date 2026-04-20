import { describe, expect, it } from "bun:test";
import { buildDurationOptions, normalizeUsageDuration } from "../src/duration-options";

describe("duration options", () => {
  it("hides current billing cycle when resetsAt is missing", () => {
    const options = buildDurationOptions(false);
    expect(options.map((option) => option.value)).toEqual(["1d", "7d", "30d"]);
  });

  it("shows current billing cycle when resetsAt exists", () => {
    const options = buildDurationOptions(true);
    expect(options.map((option) => option.value)).toEqual(["1d", "7d", "30d", "billingCycle"]);
  });

  it("falls back from billingCycle when unsupported", () => {
    expect(normalizeUsageDuration("billingCycle", false)).toBe("30d");
    expect(normalizeUsageDuration("billingCycle", true)).toBe("billingCycle");
    expect(normalizeUsageDuration("7d", false)).toBe("7d");
  });
});
