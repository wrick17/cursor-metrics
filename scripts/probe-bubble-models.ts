import { createRequire } from "module";
import { readFileSync } from "fs";
import { join } from "path";

const require = createRequire(import.meta.url);
const dbPath = join(process.env.APPDATA!, "Cursor/User/globalStorage/state.vscdb");
const conversationId = process.argv[2];
if (!conversationId) {
  console.error("Usage: bun scripts/probe-bubble-models.ts <conversationId>");
  process.exit(1);
}

const initSqlJs = require("sql.js");
const SQL = await initSqlJs({ locateFile: (f: string) => require.resolve(`sql.js/dist/${f}`) });
const db = new SQL.Database(readFileSync(dbPath));

const bubbleRows = db.exec(
  "SELECT value FROM cursorDiskKV WHERE key LIKE ? ORDER BY key LIMIT 20",
  [`bubbleId:${conversationId}:%`],
);

console.log("=== Sample bubbles with tokenCount / modelInfo ===");
for (const row of bubbleRows[0]?.values ?? []) {
  const p = JSON.parse(String(row[1]));
  if (p.type !== 2 || !p.text) continue;
  console.log({
    createdAt: p.createdAt,
    modelInfo: p.modelInfo,
    tokenCount: p.tokenCount,
    requestId: p.requestId,
    text: String(p.text).slice(0, 50),
  });
}

db.close();
