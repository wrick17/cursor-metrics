import type { UsageEvent } from "../src/cursor-api";

const baseUsageEvent = {
  requests: 1,
  spendCents: 0,
  maxMode: false,
  inputTokens: 0,
  outputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  tokenCostCents: 0,
  cursorTokenFee: 0,
  isTokenBasedCall: false,
  isHeadless: false,
  isChargeable: true,
  conversationId: null,
} satisfies Omit<UsageEvent, "timestamp" | "model" | "kind" | "totalTokens">;

export function usageEvent(
  partial: Pick<UsageEvent, "timestamp" | "model" | "kind" | "totalTokens"> &
    Partial<Omit<UsageEvent, "timestamp" | "model" | "kind" | "totalTokens">>,
): UsageEvent {
  return { ...baseUsageEvent, ...partial };
}

export { baseUsageEvent };
