import { createHash } from "crypto";
import type { UsageEvent } from "./cursor-api-types";

function hasTokenBreakdown(event: UsageEvent): boolean {
  return (
    (event.inputTokens ?? 0) +
    (event.outputTokens ?? 0) +
    (event.cacheWriteTokens ?? 0) +
    (event.cacheReadTokens ?? 0)
  ) > 0;
}

export function usageEventFingerprint(event: UsageEvent): string {
  const payload: Record<string, unknown> = {
    timestamp: event.timestamp,
    model: event.model,
    kind: event.kind,
    conversationId: event.conversationId ?? "",
    spendCents: event.spendCents,
    inputTokens: event.inputTokens,
    outputTokens: event.outputTokens,
    cacheWriteTokens: event.cacheWriteTokens,
    cacheReadTokens: event.cacheReadTokens,
    tokenCostCents: event.tokenCostCents,
    cursorTokenFee: event.cursorTokenFee,
    maxMode: event.maxMode,
    isTokenBasedCall: event.isTokenBasedCall,
    isHeadless: event.isHeadless,
    isChargeable: event.isChargeable,
  };
  // Derived when tokenUsage breakdown exists — same rule as omitting normalized `requests`.
  if (!hasTokenBreakdown(event)) {
    payload.totalTokens = event.totalTokens;
  }
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
