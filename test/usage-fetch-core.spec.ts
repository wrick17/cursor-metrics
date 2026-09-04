import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { SetupCache } from "../src/cursor-api-types";

const getCursorToken = mock(async () => ({
  userId: "auth-uuid",
  sessionToken: "session",
  accessToken: "access",
  email: "me@example.com" as string | null,
}));

const soloSetup: SetupCache = {
  isTeamMember: false,
  teamId: undefined,
  maxRequestUsage: 500,
  onDemandEnabled: false,
  stripeRecord: null,
  planInfo: { displayName: "Pro" } as SetupCache["planInfo"],
};

const teamSetup: SetupCache = {
  isTeamMember: true,
  teamId: 7,
  maxRequestUsage: 500,
  onDemandEnabled: true,
  stripeRecord: { isTeamMember: true, teamId: 7 },
  planInfo: { displayName: "Team" } as SetupCache["planInfo"],
};

const ensureSetup = mock(async (): Promise<SetupCache | null> => soloSetup);

mock.module("../src/cursor-auth", () => ({
  getCursorToken,
  cursorHeaders: () => ({ Authorization: "Bearer session" }),
}));

mock.module("../src/cursor-setup", () => ({
  ensureSetup,
  withPlanInfo: (payload: { planInfo: unknown }, setup: SetupCache) => ({
    ...payload,
    planInfo: setup.planInfo,
  }),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function failResponse(): Response {
  return new Response("error", { status: 500 });
}

const summaryWithPlan = {
  individualUsage: {
    plan: {
      enabled: true,
      used: 999,
      limit: 9999,
      autoPercentUsed: 12,
      apiPercentUsed: 3,
      totalPercentUsed: 8,
    },
  },
};

describe("fetchUsageData", () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchUsageData: typeof import("../src/usage-fetch-core").fetchUsageData;

  beforeEach(async () => {
    originalFetch = globalThis.fetch;
    getCursorToken.mockClear();
    getCursorToken.mockResolvedValue({
      userId: "auth-uuid",
      sessionToken: "session",
      accessToken: "access",
      email: "me@example.com",
    });
    ensureSetup.mockClear();
    ensureSetup.mockResolvedValue(soloSetup);
    const mod = await import("../src/usage-fetch-core");
    fetchUsageData = mod.fetchUsageData;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("uses team spend for included requests when setup is a team member even if summary has plan limits", async () => {
    ensureSetup.mockResolvedValue(teamSetup);
    const urls: string[] = [];
    globalThis.fetch = async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("get-team-spend")) {
        return jsonResponse({
          teamMemberSpend: [
            {
              email: "me@example.com",
              authId: "auth-uuid",
              userId: 4242,
              includedRequestsUsed: 42,
              includedRequestLimit: 500,
              spendCents: 0,
            },
          ],
        });
      }
      if (url.includes("/api/usage-summary")) return jsonResponse(summaryWithPlan);
      if (url.includes("/api/usage?")) return failResponse();
      if (url.includes("GetCurrentPeriodUsage")) return failResponse();
      return failResponse();
    };

    const payload = await fetchUsageData();
    expect(urls.some((url) => url.includes("get-team-spend"))).toBe(true);
    expect(payload?.includedRequests).toEqual({ used: 42, limit: 500 });
    expect(payload?.poolUsage).toEqual({
      autoPercentUsed: 12,
      apiPercentUsed: 3,
      totalPercentUsed: 8,
    });
  });

  it("finds the team member by authId when email and numeric userId do not match", async () => {
    ensureSetup.mockResolvedValue(teamSetup);
    getCursorToken.mockResolvedValue({
      userId: "auth-uuid",
      sessionToken: "session",
      accessToken: "access",
      email: null,
    });
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("get-team-spend")) {
        return jsonResponse({
          teamMemberSpend: [
            {
              email: "other@example.com",
              authId: "auth-uuid",
              userId: 4242,
              includedRequestsUsed: 7,
              includedRequestLimit: 200,
              spendCents: 0,
            },
          ],
        });
      }
      if (url.includes("/api/usage-summary")) return jsonResponse(summaryWithPlan);
      return failResponse();
    };

    const payload = await fetchUsageData();
    expect(payload).not.toBeNull();
    expect(payload?.includedRequests).toEqual({ used: 7, limit: 200 });
  });

  it("does not call get-team-spend on the summary fast-path for a personal account", async () => {
    const urls: string[] = [];
    globalThis.fetch = async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/api/usage-summary")) return jsonResponse(summaryWithPlan);
      if (url.includes("GetCurrentPeriodUsage")) return failResponse();
      return failResponse();
    };

    const payload = await fetchUsageData();
    expect(urls.some((url) => url.includes("get-team-spend"))).toBe(false);
    expect(payload?.includedRequests).toEqual({ used: 999, limit: 9999 });
  });
});
