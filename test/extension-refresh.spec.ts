import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type * as vscode from "vscode";
import type { UsagePayload } from "../src/cursor-api-types";

const invalidateSetupCache = mock(() => {});
let fetchUsageDataCalls = 0;
let firstFetchGate: Promise<void> | null = null;
let releaseFirstFetch: (() => void) | null = null;
let syncEventsFromApiCalls = 0;
let upsertEventsCalls = 0;
let eventsFetchComplete = true;
let eventsFetchRejected = false;
let spendFetchRejected = false;
let usageDataRejected = false;
let postStateCalls = 0;

const samplePayload: UsagePayload = {
  includedRequests: { used: 1, limit: 100 },
  onDemand: { state: "disabled", onDemandEnabled: false, spendDollars: 0, limitDollars: null },
  poolUsage: null,
  resetsAt: null,
  planInfo: null,
};

mock.module("../src/cursor-setup-cache", () => ({
  invalidateSetupCache,
  getCachedSetup: () => null,
  storeSetupCache: () => {},
  getCachedMaxRequestUsage: () => 100,
  isTeamMemberCached: () => false,
}));

mock.module("../src/cursor-api", () => ({
  enrichUsageFromEvents: (data: UsagePayload) => data,
  fetchDailySpendByCategory: async () => {
    if (spendFetchRejected) throw new Error("spend failed");
    return [];
  },
  fetchUsageData: async () => {
    fetchUsageDataCalls += 1;
    if (usageDataRejected) throw new Error("usage data failed");
    if (fetchUsageDataCalls === 1 && firstFetchGate) {
      await firstFetchGate;
    }
    return samplePayload;
  },
  fetchUsageEvents: async () => {
    if (eventsFetchRejected) throw new Error("events failed");
    return {
    events: eventsFetchComplete
      ? [
          {
            timestamp: Date.now(),
            model: "gpt-5",
            kind: "Included",
            totalTokens: 10,
            requests: 1,
            spendCents: 0,
            maxMode: false,
            inputTokens: 10,
            outputTokens: 0,
            cacheWriteTokens: 0,
            cacheReadTokens: 0,
            tokenCostCents: 0,
            cursorTokenFee: 0,
            isTokenBasedCall: false,
            isHeadless: false,
            isChargeable: true,
            conversationId: null,
          },
        ]
      : [],
    complete: eventsFetchComplete,
  };
  },
  isTeamMemberCached: () => false,
}));

mock.module("../src/dashboard-panel", () => ({
  DashboardPanel: {
    currentPanel: {
      postState: () => {
        postStateCalls += 1;
      },
    },
    getDashboardEventFilter: () => null,
  },
  OPEN_DASHBOARD_COMMAND: "cursor-usage.openDashboard",
}));

mock.module("../src/conversation-titles", () => ({
  buildConversationTitleMap: async () => ({}),
}));

mock.module("../src/usage-event-store", () => {
  class MockUsageEventStore {
    async init(): Promise<void> {}
    syncEventsFromApi(): number {
      syncEventsFromApiCalls += 1;
      return 1;
    }
    flushPersist(): void {}
    upsertEvents(): number {
      upsertEventsCalls += 1;
      return 1;
    }
    getEventCount(): number {
      return 1;
    }
    getEventsSince(): unknown[] {
      return [];
    }
    close(): void {}
  }
  return { UsageEventStore: MockUsageEventStore };
});

describe("updateUsage force refresh", () => {
  let updateUsage: (opts?: { force?: boolean }) => Promise<void>;
  let getDashboardState: () => import("../src/dashboard-state").DashboardState;
  let initExtensionRefresh: (
    context: vscode.ExtensionContext,
    barItem: vscode.StatusBarItem,
    channel: vscode.OutputChannel,
  ) => void;
  let cleanupExtensionRefresh: () => void;

  const statusBarItem = { text: "$(pulse) Usage", show: () => {} } as vscode.StatusBarItem;
  const outputChannel = { appendLine: () => {} } as vscode.OutputChannel;
  const extensionContext = {
    globalState: {
      get: () => false,
      update: async () => {},
    },
    globalStorageUri: { fsPath: "" },
    extensionPath: process.cwd(),
  } as unknown as vscode.ExtensionContext;

  beforeEach(async () => {
    fetchUsageDataCalls = 0;
    syncEventsFromApiCalls = 0;
    upsertEventsCalls = 0;
    invalidateSetupCache.mockClear();
    eventsFetchComplete = true;
    eventsFetchRejected = false;
    spendFetchRejected = false;
    usageDataRejected = false;
    postStateCalls = 0;
    firstFetchGate = null;
    releaseFirstFetch = null;

    const mod = await import("../src/extension-refresh");
    updateUsage = mod.updateUsage;
    getDashboardState = mod.getDashboardState;
    initExtensionRefresh = mod.initExtensionRefresh;
    cleanupExtensionRefresh = mod.cleanupExtensionRefresh;
    initExtensionRefresh(extensionContext, statusBarItem, outputChannel);
  });

  afterEach(() => {
    cleanupExtensionRefresh();
  });

  it("invalidates setup cache and syncs events on force refresh", async () => {
    await updateUsage({ force: true });
    expect(invalidateSetupCache).toHaveBeenCalledTimes(1);
    expect(syncEventsFromApiCalls).toBe(1);
    expect(upsertEventsCalls).toBe(0);
  });

  it("uses upsert on automatic refresh", async () => {
    await updateUsage();
    expect(invalidateSetupCache).not.toHaveBeenCalled();
    expect(syncEventsFromApiCalls).toBe(0);
    expect(upsertEventsCalls).toBe(1);
  });

  it("uses upsert when force refresh receives an incomplete event snapshot", async () => {
    eventsFetchComplete = false;
    await updateUsage({ force: true });
    expect(syncEventsFromApiCalls).toBe(0);
    expect(upsertEventsCalls).toBe(1);
  });

  it("awaits an in-flight fetch when force refresh is requested", async () => {
    firstFetchGate = new Promise<void>((resolve) => {
      releaseFirstFetch = resolve;
    });

    const first = updateUsage({ force: true });
    await new Promise((r) => setTimeout(r, 0));
    const second = updateUsage({ force: true });

    releaseFirstFetch?.();
    await Promise.all([first, second]);

    expect(fetchUsageDataCalls).toBeGreaterThanOrEqual(2);
  });

  it("records warnings when events fetch fails but still posts state", async () => {
    eventsFetchRejected = true;
    await updateUsage({ force: true });
    const state = getDashboardState();
    expect(state.warnings.length).toBeGreaterThan(0);
    expect(state.eventsComplete).toBeFalse();
    expect(postStateCalls).toBeGreaterThan(0);
  });

  it("records partial sync warning when event snapshot is incomplete", async () => {
    eventsFetchComplete = false;
    await updateUsage({ force: true });
    const state = getDashboardState();
    expect(state.eventsComplete).toBeFalse();
    expect(state.warnings.some((w) => w.toLowerCase().includes("partial") || w.toLowerCase().includes("parziale"))).toBeTrue();
  });
});
