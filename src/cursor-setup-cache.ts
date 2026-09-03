import type { SetupCache } from "./cursor-api-types";

/** Re-fetch setup on automatic polls after this interval (plan/team limits may change). */
export const SETUP_CACHE_TTL_MS = 30 * 60_000;

let cachedSetup: SetupCache | null = null;
let cachedSetupSessionToken: string | null = null;
let cachedSetupAt = 0;

export function invalidateSetupCache(): void {
  cachedSetup = null;
  cachedSetupSessionToken = null;
  cachedSetupAt = 0;
}

export function getCachedSetup(sessionToken: string, now = Date.now()): SetupCache | null {
  if (
    cachedSetup &&
    cachedSetupSessionToken === sessionToken &&
    now - cachedSetupAt < SETUP_CACHE_TTL_MS
  ) {
    return cachedSetup;
  }
  return null;
}

export function storeSetupCache(setup: SetupCache, sessionToken: string, now = Date.now()): void {
  cachedSetup = setup;
  cachedSetupSessionToken = sessionToken;
  cachedSetupAt = now;
}

export function getCachedMaxRequestUsage(): number {
  return cachedSetup?.maxRequestUsage ?? 0;
}

export function isTeamMemberCached(): boolean {
  return cachedSetup?.isTeamMember ?? false;
}
