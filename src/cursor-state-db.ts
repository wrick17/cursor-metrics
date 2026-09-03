import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { loadSqlJs, type SqlJsDatabase } from "./sql-js-loader";

export type { SqlJsDatabase };

export function getGlobalCursorDbPath(): string {
  switch (process.platform) {
    case "darwin":
      return join(homedir(), "Library/Application Support/Cursor/User/globalStorage/state.vscdb");
    case "win32":
      return join(process.env.APPDATA ?? join(homedir(), "AppData/Roaming"), "Cursor/User/globalStorage/state.vscdb");
    default:
      return join(homedir(), ".config/Cursor/User/globalStorage/state.vscdb");
  }
}

export async function withCursorStateDb<T>(
  extensionPath: string,
  fn: (db: SqlJsDatabase) => T,
): Promise<T | null> {
  const dbPath = getGlobalCursorDbPath();
  if (!existsSync(dbPath)) return null;

  const SQL = await loadSqlJs(extensionPath);
  const db = new SQL.Database(readFileSync(dbPath));
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

export function queryTableValue(db: SqlJsDatabase, table: "ItemTable" | "cursorDiskKV", key: string): string | null {
  const rows = db.exec(`SELECT value FROM ${table} WHERE key = ?`, [key]);
  const value = rows[0]?.values[0]?.[0];
  return typeof value === "string" ? value : value == null ? null : String(value);
}
