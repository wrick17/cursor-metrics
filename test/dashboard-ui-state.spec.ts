import { describe, expect, it } from "bun:test";
import type { ExtensionContext } from "vscode";

type Store = Record<string, unknown>;

function mockContext(store: Store = {}): ExtensionContext {
  const globalState = {
    keys: () => Object.keys(store),
    get: <T>(key: string, defaultValue?: T): T | undefined =>
      (key in store ? store[key] : defaultValue) as T | undefined,
    update: async (key: string, value: unknown) => {
      store[key] = value;
    },
  };
  return { globalState } as unknown as ExtensionContext;
}

describe("dashboard ui preferences", () => {
  it("round-trips valid preferences through global state", async () => {
    const { loadDashboardUiPreferences, saveDashboardUiPreferences } = await import("../src/dashboard-ui-state");
    const ctx = mockContext();

    await saveDashboardUiPreferences(ctx, { usageFilter: "included", metric: "spend" });
    expect(loadDashboardUiPreferences(ctx)).toEqual({ usageFilter: "included", metric: "spend" });

    await saveDashboardUiPreferences(ctx, { metric: "tokens" });
    expect(loadDashboardUiPreferences(ctx)).toEqual({ usageFilter: "included", metric: "tokens" });
  });

  it("round-trips pinned model ids through global state", async () => {
    const { loadDashboardUiPreferences, saveDashboardUiPreferences } = await import("../src/dashboard-ui-state");
    const ctx = mockContext();

    await saveDashboardUiPreferences(ctx, {
      // Intentionally include invalid entries; load() sanitizes them.
      pricingPinnedIds: ["auto", "gpt-5", "auto", "", 42] as unknown as string[],
    });
    expect(loadDashboardUiPreferences(ctx)).toEqual({
      pricingPinnedIds: ["auto", "gpt-5"],
    });
  });

  it("ignores invalid stored values", async () => {
    const { loadDashboardUiPreferences } = await import("../src/dashboard-ui-state");
    const ctx = mockContext({
      dashboardUiPreferences: { usageFilter: "bogus", metric: 42, range: "90d" },
    });
    expect(loadDashboardUiPreferences(ctx)).toEqual({});
  });

  it("does not persist invalid preference fields from a save patch", async () => {
    const { loadDashboardUiPreferences, saveDashboardUiPreferences } = await import("../src/dashboard-ui-state");
    const store: Store = {};
    const ctx = mockContext(store);

    await saveDashboardUiPreferences(ctx, {
      usageFilter: "bogus",
      metric: "spend",
    } as unknown as Parameters<typeof saveDashboardUiPreferences>[1]);

    expect(store.dashboardUiPreferences).toEqual({ metric: "spend" });
    expect(loadDashboardUiPreferences(ctx)).toEqual({ metric: "spend" });
  });

  it("caps pinned model ids at 50 entries of 128 characters", async () => {
    const { loadDashboardUiPreferences, saveDashboardUiPreferences } = await import("../src/dashboard-ui-state");
    const ctx = mockContext();
    const tooLong = "a".repeat(129);
    const ids = Array.from({ length: 60 }, (_, i) => `model-${i}`);
    ids.push(tooLong);

    await saveDashboardUiPreferences(ctx, { pricingPinnedIds: ids });
    const saved = loadDashboardUiPreferences(ctx).pricingPinnedIds ?? [];
    expect(saved).toHaveLength(50);
    expect(saved[0]).toBe("model-0");
    expect(saved[49]).toBe("model-49");
    expect(saved.some((id) => id.length > 128)).toBe(false);
  });
});
