import { describe, expect, it } from "bun:test";
import { attachMessageModels, nearestUsageEventModel, parseBubbleText } from "../src/conversation-messages";
import { parseComposerHeaders } from "../src/conversation-titles";
import type { UsageEvent } from "../src/cursor-api-types";

const baseEvent: UsageEvent = {
  timestamp: 1_000_000,
  model: "claude-4.6-sonnet",
  kind: "Included",
  totalTokens: 100,
  requests: 1,
  spendCents: 0,
  maxMode: false,
  inputTokens: 50,
  outputTokens: 50,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  tokenCostCents: 0,
  cursorTokenFee: 0,
  isTokenBasedCall: true,
  isHeadless: false,
  isChargeable: true,
  conversationId: "abc",
};

describe("parseComposerHeaders", () => {
  it("maps composerId to name from allComposers", () => {
    const raw = JSON.stringify({
      allComposers: [
        { composerId: "abc-123", name: "Fix dashboard preview", subtitle: "ignored when name exists" },
        { id: "legacy-id", subtitle: "Legacy subtitle" },
      ],
    });
    const titles = parseComposerHeaders(raw);
    expect(titles.get("abc-123")).toBe("Fix dashboard preview");
    expect(titles.get("legacy-id")).toBe("Legacy subtitle");
  });
});

describe("parseBubbleText", () => {
  it("prefers plain text over rich text", () => {
    expect(parseBubbleText({ text: "Hello", richText: "{\"root\":{}}" })).toBe("Hello");
  });

  it("extracts text from lexical richText", () => {
    const richText = JSON.stringify({
      root: { children: [{ text: "/commit-message", type: "text" }] },
    });
    expect(parseBubbleText({ richText })).toBe("/commit-message");
  });

  it("formats tool bubbles with command detail", () => {
    const text = parseBubbleText({
      capabilityType: 15,
      toolFormerData: {
        name: "run_terminal_command_v2",
        params: JSON.stringify({ command: "git status" }),
      },
    });
    expect(text).toContain("run terminal command v2");
    expect(text).toContain("git status");
  });
});

describe("attachMessageModels", () => {
  it("matches assistant messages to the nearest usage event model", () => {
    const messages = attachMessageModels(
      [{
        id: "m1",
        role: "assistant",
        text: "Risposta",
        createdAt: new Date(1_000_500).toISOString(),
        model: null,
      }],
      [baseEvent],
    );
    expect(messages[0]?.model).toBe("claude-4.6-sonnet");
    expect(messages[0]?.modelEstimated).toBe(true);
  });

  it("keeps bubble-provided models without marking them estimated", () => {
    const messages = attachMessageModels(
      [{
        id: "m1",
        role: "user",
        text: "Ciao",
        createdAt: null,
        model: "default",
        modelEstimated: false,
      }],
      [baseEvent],
    );
    expect(messages[0]?.model).toBe("default");
    expect(messages[0]?.modelEstimated).toBe(false);
  });

  it("returns null when no event is close enough", () => {
    expect(nearestUsageEventModel(5_000_000, [baseEvent])).toBeNull();
  });
});
