import { describe, expect, it } from "bun:test";
import { resolveConfiguredUsageDuration } from "../src/duration-options";

describe("configured usage duration", () => {
  it("uses billing cycle when config selects it and reset metadata exists", () => {
    expect(resolveConfiguredUsageDuration("billingCycle", true)).toBe("billingCycle");
  });

  it("falls back to 30d when config selects billing cycle but reset metadata is missing", () => {
    expect(resolveConfiguredUsageDuration("billingCycle", false)).toBe("30d");
  });

  it("defaults invalid config values to the billing-cycle default before normalization", () => {
    expect(resolveConfiguredUsageDuration("unexpected", true)).toBe("billingCycle");
    expect(resolveConfiguredUsageDuration(undefined, false)).toBe("30d");
  });
});
