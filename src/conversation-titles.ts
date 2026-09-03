import type { ConversationMessage } from "./cursor-api-types";
import { getGlobalCursorDbPath, queryTableValue, withCursorStateDb } from "./cursor-state-db";

export { getGlobalCursorDbPath };

type ComposerHeaderEntry = {
  composerId?: string;
  id?: string;
  name?: string;
  subtitle?: string;
};

function pickTitle(entry: ComposerHeaderEntry): string | null {
  const name = typeof entry.name === "string" ? entry.name.trim() : "";
  if (name) return name;
  const subtitle = typeof entry.subtitle === "string" ? entry.subtitle.trim() : "";
  if (subtitle) return subtitle;
  return null;
}

export function parseComposerHeaders(raw: string | null): Map<string, string> {
  const titles = new Map<string, string>();
  if (!raw) return titles;

  try {
    const parsed = JSON.parse(raw) as { allComposers?: ComposerHeaderEntry[] };
    for (const entry of parsed.allComposers ?? []) {
      const id = entry.composerId ?? entry.id;
      const title = pickTitle(entry);
      if (typeof id === "string" && title) titles.set(id, title);
    }
  } catch {
    return titles;
  }
  return titles;
}

function parseComposerDataTitle(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { name?: string; subtitle?: string; text?: string };
    const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
    if (name) return name;
    const subtitle = typeof parsed.subtitle === "string" ? parsed.subtitle.trim() : "";
    if (subtitle) return subtitle;
    const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
    if (text) return text.length > 80 ? `${text.slice(0, 77)}…` : text;
  } catch {
    return null;
  }
  return null;
}

export async function buildConversationTitleMap(
  conversationIds: string[],
  extensionPath: string,
): Promise<Record<string, string>> {
  const uniqueIds = [...new Set(conversationIds.filter(Boolean))];
  if (uniqueIds.length === 0) return {};

  const titles = await withCursorStateDb(extensionPath, (db) => {
    const map = parseComposerHeaders(queryTableValue(db, "ItemTable", "composer.composerHeaders"));

    for (const id of uniqueIds) {
      if (map.has(id)) continue;
      const composerData = queryTableValue(db, "cursorDiskKV", `composerData:${id}`);
      const title = parseComposerDataTitle(composerData);
      if (title) map.set(id, title);
    }
    return map;
  });

  if (!titles) return {};

  const out: Record<string, string> = {};
  for (const id of uniqueIds) {
    const title = titles.get(id);
    if (title) out[id] = title;
  }
  return out;
}
