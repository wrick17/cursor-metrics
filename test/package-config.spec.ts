import { describe, expect, it } from "bun:test";
import packageJson from "../package.json";

describe("package configuration", () => {
  it("shows a friendly label for billing cycle in the usage duration setting", () => {
    const usageDurationConfig = packageJson.contributes.configuration.properties["cursorUsage.usageDuration"];

    expect(usageDurationConfig.enum).toContain("billingCycle");
    expect(usageDurationConfig.enumItemLabels).toEqual([
      "Last 24 hours",
      "Last 7 days",
      "Last 30 days",
      "Current Billing Cycle",
    ]);
  });
});
