import { describe, expect, it } from "bun:test";
import {
  getCachedMaxRequestUsage,
  getCachedSetup,
  invalidateSetupCache,
  isTeamMemberCached,
  SETUP_CACHE_TTL_MS,
  storeSetupCache,
} from "../src/cursor-setup-cache";

describe("cursor-setup-cache", () => {
  it("stores and returns setup for matching session token", () => {
    invalidateSetupCache();
    const setup = {
      isTeamMember: true,
      teamId: 42,
      maxRequestUsage: 500,
      onDemandEnabled: true,
      stripeRecord: null,
      planInfo: null,
    };
    storeSetupCache(setup, "token-a");
    expect(getCachedSetup("token-a")).toEqual(setup);
    expect(getCachedMaxRequestUsage()).toBe(500);
    expect(isTeamMemberCached()).toBe(true);
  });

  it("expires cached setup after TTL", () => {
    invalidateSetupCache();
    const setup = {
      isTeamMember: false,
      teamId: undefined,
      maxRequestUsage: 100,
      onDemandEnabled: false,
      stripeRecord: null,
      planInfo: null,
    };
    const storedAt = 1_700_000_000_000;
    storeSetupCache(setup, "token-a", storedAt);
    expect(getCachedSetup("token-a", storedAt + SETUP_CACHE_TTL_MS - 1)).toEqual(setup);
    expect(getCachedSetup("token-a", storedAt + SETUP_CACHE_TTL_MS)).toBeNull();
  });

  it("returns null when session token changes", () => {
    invalidateSetupCache();
    storeSetupCache(
      {
        isTeamMember: false,
        teamId: undefined,
        maxRequestUsage: 100,
        onDemandEnabled: false,
        stripeRecord: null,
        planInfo: null,
      },
      "token-a",
    );
    expect(getCachedSetup("token-b")).toBeNull();
  });

  it("invalidateSetupCache clears cached values", () => {
    storeSetupCache(
      {
        isTeamMember: true,
        teamId: 1,
        maxRequestUsage: 200,
        onDemandEnabled: true,
        stripeRecord: null,
        planInfo: null,
      },
      "token-x",
    );
    invalidateSetupCache();
    expect(getCachedSetup("token-x")).toBeNull();
    expect(getCachedMaxRequestUsage()).toBe(0);
    expect(isTeamMemberCached()).toBe(false);
  });
});
