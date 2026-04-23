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

  it("exposes model table sorting settings with token-desc defaults", () => {
    const sortByConfig = packageJson.contributes.configuration.properties["cursorUsage.modelBreakdownSortBy"];
    const sortOrderConfig = packageJson.contributes.configuration.properties["cursorUsage.modelBreakdownSortOrder"];

    expect(sortByConfig.default).toBe("tokens");
    expect(sortByConfig.enum).toEqual(["model", "requests", "tokens", "spend"]);
    expect(sortByConfig.enumItemLabels).toEqual(["Model", "Requests", "Tokens", "Spend"]);

    expect(sortOrderConfig.default).toBe("desc");
    expect(sortOrderConfig.enum).toEqual(["asc", "desc"]);
    expect(sortOrderConfig.enumItemLabels).toEqual(["Ascending", "Descending"]);
  });
});
