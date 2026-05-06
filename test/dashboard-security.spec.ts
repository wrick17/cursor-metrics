import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";

describe("dashboard security hardening", () => {
  it("guards CSV exports against spreadsheet formula injection", () => {
    const dashboardScript = readFileSync("media/dashboard/dashboard.js", "utf-8");

    expect(dashboardScript).toContain("/^\\s*[=+\\-@]/");
    expect(dashboardScript).toContain("\"'\" + s");
  });
});
