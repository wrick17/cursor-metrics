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

  it("keeps the display name while using a unique VS Marketplace package id", () => {
    expect(packageJson.displayName).toBe("Cursor Usage");
    expect(packageJson.scripts["package:vsm"]).toContain("cursor-usage-auto");
    expect(packageJson.scripts["publish:vsm"]).toContain("cursor-usage-auto");
  });
});
