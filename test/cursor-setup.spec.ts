import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { ensureSetup } from "../src/cursor-setup";
import { getCachedSetup, invalidateSetupCache } from "../src/cursor-setup-cache";
import type { CursorHeaders } from "../src/cursor-api-types";

const headers: CursorHeaders = {
  "Content-Type": "application/json",
  Cookie: "WorkosCursorSessionToken=session",
  Origin: "https://cursor.com",
  Referer: "https://cursor.com/dashboard",
};

const summaryOk = {
  individualUsage: {
    plan: { enabled: true, used: 10, limit: 100 },
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function failResponse(): Response {
  return new Response("error", { status: 500 });
}

describe("ensureSetup", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    invalidateSetupCache();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    invalidateSetupCache();
  });

  it("returns null when stripe, usage, and summary all fail", async () => {
    globalThis.fetch = async () => failResponse();
    const setup = await ensureSetup("user-1", "session", headers, "a@b.c");
    expect(setup).toBeNull();
    expect(getCachedSetup("session")).toBeNull();
  });

  it("returns null when stripe and summary fail even if usage succeeds", async () => {
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("/api/usage?") && !url.includes("usage-summary")) {
        return jsonResponse({ "gpt-4": { numRequests: 1, maxRequestUsage: 500 } });
      }
      return failResponse();
    };
    const setup = await ensureSetup("user-1", "session", headers, "a@b.c");
    expect(setup).toBeNull();
    expect(getCachedSetup("session")).toBeNull();
  });

  it("returns uncached personal setup when summary succeeds without stripe", async () => {
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("/api/usage-summary")) return jsonResponse(summaryOk);
      return failResponse();
    };
    const setup = await ensureSetup("user-1", "session", headers, "a@b.c");
    expect(setup?.isTeamMember).toBe(false);
    expect(setup?.stripeRecord).toBeNull();
    expect(setup?.maxRequestUsage).toBe(100);
    expect(getCachedSetup("session")).toBeNull();
  });

  it("caches setup when stripe succeeds", async () => {
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("/api/auth/stripe")) {
        return jsonResponse({ isTeamMember: false, isOnBillableAuto: true });
      }
      if (url.includes("/api/usage-summary")) return jsonResponse(summaryOk);
      return failResponse();
    };
    const setup = await ensureSetup("user-1", "session", headers, "a@b.c");
    expect(setup?.onDemandEnabled).toBe(true);
    expect(getCachedSetup("session")).toEqual(setup);
  });
});
