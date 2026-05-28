import { describe, expect, it } from "bun:test";
import type { ExtensionContext, Memento } from "vscode";

type Store = Record<string, unknown>;

function mockContext(store: Store = {}): ExtensionContext {
  const globalState: Memento & { update: (k: string, v: unknown) => Promise<void> } = {
    keys: () => Object.keys(store),
    get: (key, defaultValue) => (key in store ? store[key] : defaultValue),
    update: async (key, value) => {
      store[key] = value;
    },
  };
  return { globalState } as ExtensionContext;
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

  it("ignores invalid stored values", async () => {
    const { loadDashboardUiPreferences } = await import("../src/dashboard-ui-state");
    const ctx = mockContext({
      dashboardUiPreferences: { usageFilter: "bogus", metric: 42, range: "90d" },
    });
    expect(loadDashboardUiPreferences(ctx)).toEqual({});
  });
});
