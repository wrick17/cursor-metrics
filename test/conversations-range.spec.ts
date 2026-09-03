import { describe, expect, it } from "bun:test";
import { aggregateConversations } from "../src/conversation-aggregate";
import { getDurationCutoff } from "../src/model-breakdown";
import { usageEvent } from "./usage-event-fixture";

describe("conversation range cutoff", () => {
  const now = Date.UTC(2026, 6, 14, 12, 0, 0);
  const dayMs = 86_400_000;

  it("excludes conversations outside the selected 7d range", () => {
    const events = [
      usageEvent({
        timestamp: now - 2 * dayMs,
        model: "gpt-5",
        kind: "Included",
        totalTokens: 100,
        requests: 1,
        conversationId: "recent-conv",
      }),
      usageEvent({
        timestamp: now - 10 * dayMs,
        model: "gpt-5",
        kind: "Included",
        totalTokens: 200,
        requests: 1,
        conversationId: "old-conv",
      }),
    ];

    const cutoff = getDurationCutoff("7d", null, now);
    const rows = aggregateConversations(events, {
      cutoff,
      usageFilter: "all",
      previewTitles: false,
      locale: "en",
      noConversationLabel: "No conversation",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.conversationId).toBe("recent-conv");
  });
});
