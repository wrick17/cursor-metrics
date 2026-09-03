import type { ConversationRow, UsageEvent } from "./cursor-api-types";
import { eventRequestCount, eventTokenCount } from "./cursor-usage-parsing";
import { formatModelLabel } from "./model-labels";

const NO_CONVERSATION_KEY = "__none__";

export function abbreviateConversationId(id: string | null): string {
  if (!id) return "—";
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…`;
}

export function defaultConversationLabel(
  conversationId: string | null,
  lastTimestamp: number,
  locale: "en" | "it",
): string {
  const date = new Date(lastTimestamp).toLocaleDateString(locale === "it" ? "it-IT" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${abbreviateConversationId(conversationId)} · ${date}`;
}

function eventBillableSpendCents(event: UsageEvent, quotaAwareEventDisplay: boolean): number {
  if (quotaAwareEventDisplay && event.kind !== "On-Demand") return 0;
  return event.spendCents || 0;
}

export function aggregateConversations(
  events: UsageEvent[],
  opts: {
    cutoff: number;
    usageFilter: "all" | "included" | "ondemand";
    titles?: Record<string, string>;
    previewTitles: boolean;
    locale: "en" | "it";
    noConversationLabel: string;
    quotaAwareEventDisplay?: boolean;
  },
): ConversationRow[] {
  const quotaAware = opts.quotaAwareEventDisplay ?? true;
  const groups = new Map<string, UsageEvent[]>();

  for (const event of events) {
    if (event.timestamp < opts.cutoff) continue;
    if (!matchesUsageFilter(event, opts.usageFilter)) continue;
    const key = event.conversationId ?? NO_CONVERSATION_KEY;
    const bucket = groups.get(key) ?? [];
    bucket.push(event);
    groups.set(key, bucket);
  }

  const summaries: ConversationRow[] = [];
  for (const [key, bucket] of groups) {
    bucket.sort((a, b) => a.timestamp - b.timestamp);
    const conversationId = key === NO_CONVERSATION_KEY ? null : key;
    const firstTimestamp = bucket[0]!.timestamp;
    const lastTimestamp = bucket[bucket.length - 1]!.timestamp;
    const models = [...new Set(bucket.map((e) => e.model))];
    const kinds = [...new Set(bucket.map((e) => e.kind))];
    const title = conversationId && opts.previewTitles ? opts.titles?.[conversationId] ?? null : null;
    const label = title
      ?? (conversationId === null
        ? opts.noConversationLabel
        : defaultConversationLabel(conversationId, lastTimestamp, opts.locale));

    summaries.push({
      conversationId,
      label,
      title,
      firstTimestamp,
      lastTimestamp,
      totalTokens: bucket.reduce((sum, e) => sum + eventTokenCount(e), 0),
      requests: bucket.reduce((sum, e) => sum + eventRequestCount(e), 0),
      spendCents: bucket.reduce((sum, e) => sum + eventBillableSpendCents(e, quotaAware), 0),
      eventCount: bucket.length,
      models,
      kinds,
      modelsLabel: formatConversationModels(models),
      events: bucket,
    });
  }

  summaries.sort((a, b) => b.lastTimestamp - a.lastTimestamp);
  return summaries;
}

export function formatConversationModels(models: string[]): string {
  return models.map((model) => formatModelLabel(model)).join(", ");
}

function matchesUsageFilter(event: UsageEvent, filter: "all" | "included" | "ondemand"): boolean {
  if (filter === "all") return true;
  if (filter === "included") return event.kind === "Included";
  return event.kind === "On-Demand";
}
