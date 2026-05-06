import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { readCursorAuthValuesFromDb } from "../src/cursor-api";

describe("Cursor auth database reader", () => {
  it("reads auth values from ItemTable without sqlite CLI or native bindings", () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "cursor-auth-db-")), "state.vscdb");
    const db = new Database(dbPath);
    db.run("CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)");
    db.run("INSERT INTO ItemTable VALUES (?, ?)", ["cursorAuth/accessToken", "jwt-token"]);
    db.run("INSERT INTO ItemTable VALUES (?, ?)", ["cursorAuth/cachedEmail", "user@example.com"]);
    db.close();

    expect(readCursorAuthValuesFromDb(dbPath)).toEqual({
      "cursorAuth/accessToken": "jwt-token",
      "cursorAuth/cachedEmail": "user@example.com",
    });
  });

  it("reads auth values committed to a WAL file", () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "cursor-auth-wal-db-")), "state.vscdb");
    const db = new Database(dbPath);
    db.run("PRAGMA journal_mode = WAL");
    db.run("CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)");
    db.run("INSERT INTO ItemTable VALUES (?, ?)", ["cursorAuth/accessToken", "wal-jwt-token"]);
    db.run("INSERT INTO ItemTable VALUES (?, ?)", ["cursorAuth/cachedEmail", "wal@example.com"]);

    expect(existsSync(`${dbPath}-wal`)).toBeTrue();
    expect(readCursorAuthValuesFromDb(dbPath)).toEqual({
      "cursorAuth/accessToken": "wal-jwt-token",
      "cursorAuth/cachedEmail": "wal@example.com",
    });

    db.close();
  });
});
