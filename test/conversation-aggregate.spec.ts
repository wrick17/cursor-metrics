import { describe, expect, it } from "bun:test";
import { aggregateConversations, defaultConversationLabel } from "../src/conversation-aggregate";
import { usageEvent } from "./usage-event-fixture";

describe("aggregateConversations", () => {
  const now = Date.UTC(2026, 6, 6, 12, 0, 0);

  it("groups events by conversationId and sums usage", () => {
    const events = [
      usageEvent({
        timestamp: now - 3_600_000,
        model: "default",
        kind: "Included",
        totalTokens: 1000,
        requests: 2,
        conversationId: "abc-123",
      }),
      usageEvent({
        timestamp: now - 1_800_000,
        model: "gpt-5",
        kind: "Included",
        totalTokens: 500,
        requests: 1,
        conversationId: "abc-123",
      }),
      usageEvent({
        timestamp: now - 900_000,
        model: "default",
        kind: "On-Demand",
        totalTokens: 200,
        requests: 0.5,
        spendCents: 40,
        conversationId: "xyz-999",
      }),
    ];

    const rows = aggregateConversations(events, {
      cutoff: now - 86_400_000,
      usageFilter: "all",
      previewTitles: false,
      locale: "en",
      noConversationLabel: "No conversation",
    });

    expect(rows).toHaveLength(2);
    const grouped = rows.find((row) => row.conversationId === "abc-123");
    expect(grouped?.totalTokens).toBe(1500);
    expect(grouped?.requests).toBe(3);
    expect(grouped?.eventCount).toBe(2);
    expect(grouped?.models).toEqual(["default", "gpt-5"]);
    expect(grouped?.events).toHaveLength(2);
    expect(grouped?.modelsLabel).toContain("Auto");
    expect(grouped?.label).toContain("abc-123".slice(0, 8));
  });

  it("zeros included spend when quota-aware display is enabled", () => {
    const events = [
      usageEvent({
        timestamp: now,
        model: "default",
        kind: "Included",
        totalTokens: 100,
        requests: 1,
        spendCents: 99,
        conversationId: "abc-123",
      }),
    ];

    const rows = aggregateConversations(events, {
      cutoff: 0,
      usageFilter: "all",
      previewTitles: false,
      locale: "en",
      noConversationLabel: "No conversation",
      quotaAwareEventDisplay: true,
    });

    expect(rows[0]?.spendCents).toBe(0);
  });

  it("uses resolved titles when preview is enabled", () => {
    const events = [
      usageEvent({
        timestamp: now,
        model: "default",
        kind: "Included",
        totalTokens: 100,
        requests: 1,
        conversationId: "abc-123",
      }),
    ];

    const rows = aggregateConversations(events, {
      cutoff: 0,
      usageFilter: "all",
      previewTitles: true,
      titles: { "abc-123": "Fix login bug" },
      locale: "en",
      noConversationLabel: "No conversation",
    });

    expect(rows[0]?.label).toBe("Fix login bug");
    expect(rows[0]?.title).toBe("Fix login bug");
  });

  it("falls back to default labels when preview is disabled after being enabled", () => {
    const label = defaultConversationLabel("abc-123-def", now, "en");
    expect(label).toContain("abc-123");
    expect(label).toContain("2026");
  });
});
