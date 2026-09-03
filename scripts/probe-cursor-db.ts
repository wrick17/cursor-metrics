import { createRequire } from "module";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { readTableKeyValue } from "../src/cursor-db-reader";

const require = createRequire(import.meta.url);

function globalDbPath(): string {
  return join(
    process.env.APPDATA ?? join(homedir(), "AppData/Roaming"),
    "Cursor/User/globalStorage/state.vscdb",
  );
}

async function openDb(path: string) {
  const initSqlJs = require("sql.js") as (config: { locateFile: (f: string) => string }) => Promise<{
    Database: new (data?: Buffer) => {
      exec: (sql: string) => { columns: string[]; values: unknown[][] }[];
      close: () => void;
    };
  }>;
  const SQL = await initSqlJs({
    locateFile: (file: string) => require.resolve(`sql.js/dist/${file}`),
  });
  return new SQL.Database(readFileSync(path));
}

async function main() {
  const dbPath = globalDbPath();
  console.log("DB:", dbPath, existsSync(dbPath));

  const headers = readTableKeyValue(dbPath, "ItemTable", "composer.composerHeaders");
  console.log("readTableKeyValue composer.composerHeaders:", headers?.length ?? null);

  const db = await openDb(dbPath);
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
  console.log(
    "tables:",
    tables[0]?.values.map((row) => row[0]),
  );

  for (const pattern of ["%composer%", "%chat%", "%conversation%", "%agent%"]) {
    const rows = db.exec(`SELECT key, length(value) FROM ItemTable WHERE key LIKE '${pattern}' LIMIT 40`);
    if (rows[0]?.values.length) {
      console.log(`\nItemTable LIKE ${pattern}:`);
      for (const [key, len] of rows[0].values as [string, number][]) {
        console.log(`  ${key} (${len})`);
      }
    }
  }

  const hasDiskKv = tables[0]?.values.some((row) => row[0] === "cursorDiskKV");
  if (hasDiskKv) {
    for (const pattern of ["%composer%", "%5a537e94%", "%bubble%"]) {
      const rows = db.exec(`SELECT key, length(value) FROM cursorDiskKV WHERE key LIKE '${pattern}' LIMIT 20`);
      if (rows[0]?.values.length) {
        console.log(`\ncursorDiskKV LIKE ${pattern}:`);
        for (const [key, len] of rows[0].values as [string, number][]) {
          console.log(`  ${key} (${len})`);
        }
      }
    }
  }

  const sample = db.exec(
    "SELECT value FROM ItemTable WHERE key = 'workbench.backgroundComposer.persistentData'",
  );
  if (sample[0]?.values[0]?.[0]) {
    console.log("\nbackgroundComposer:", String(sample[0].values[0][0]).slice(0, 800));
  }

  const manualHeaders = readTableKeyValue(dbPath, "ItemTable", "composer.composerHeaders");
  console.log("\nmanual readTableKeyValue composer.composerHeaders:", manualHeaders?.length ?? null);

  const sqlHeaders = db.exec(
    "SELECT length(value) FROM ItemTable WHERE key = 'composer.composerHeaders'",
  );
  console.log("sql.js composer.composerHeaders length:", sqlHeaders[0]?.values[0]?.[0]);

  const headerPreview = db.exec(
    "SELECT substr(value, 1, 500) FROM ItemTable WHERE key = 'composer.composerHeaders'",
  );
  console.log("headers preview:", headerPreview[0]?.values[0]?.[0]);

  const composerData = db.exec(
    "SELECT substr(value, 1, 800) FROM cursorDiskKV WHERE key = 'composerData:5a537e94-cacd-4ea9-967e-df4faca9d0c8'",
  );
  console.log("\ncomposerData:", composerData[0]?.values[0]?.[0]);

  const bubbles = db.exec(
    "SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:5a537e94-cacd-4ea9-967e-df4faca9d0c8:%' LIMIT 8",
  );
  console.log("\nbubbles parsed:");
  for (const row of bubbles[0]?.values ?? []) {
    try {
      const parsed = JSON.parse(String(row[1]));
      const textFields = ["text", "rawText", "richText", "message", "content", "displayText", "capabilityType"];
      const found: Record<string, unknown> = { type: parsed.type };
      for (const k of textFields) {
        if (parsed[k] !== undefined && parsed[k] !== null && parsed[k] !== "") found[k] = parsed[k];
      }
      if (parsed.type === 1 || parsed.type === 2) {
        console.log(String(row[0]).split(":").pop(), JSON.stringify(found).slice(0, 500));
      }
    } catch {
      console.log(row[0], "parse error");
    }
  }

  const capBubble = db.exec(
    "SELECT value FROM cursorDiskKV WHERE key = 'bubbleId:5a537e94-cacd-4ea9-967e-df4faca9d0c8:30cda550-ccf8-4808-8e16-68fcab5f5b49'",
  );
  if (capBubble[0]?.values[0]?.[0]) {
    const parsed = JSON.parse(String(capBubble[0].values[0][0]));
    console.log("\ncapability bubble keys:", Object.keys(parsed));
    console.log("toolName", parsed.toolName, "name", parsed.name, "capabilityType", parsed.capabilityType);
    if (parsed.toolFormerData) console.log("toolFormerData", JSON.stringify(parsed.toolFormerData).slice(0, 400));
  }

  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
