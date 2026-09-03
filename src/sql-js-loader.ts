import { createRequire } from "module";
import { existsSync } from "fs";
import { join } from "path";

const require = createRequire(__filename);

export type SqlJsStatic = {
  Database: new (data?: Buffer) => SqlJsDatabase;
};

export type SqlJsDatabase = {
  run: (sql: string, params?: unknown[]) => void;
  exec: (sql: string, params?: unknown[]) => { columns: string[]; values: unknown[][] }[];
  prepare: (sql: string) => SqlJsStatement;
  export: () => Uint8Array;
  close: () => void;
  getRowsModified: () => number;
};

export type SqlJsStatement = {
  bind: (params: unknown[]) => void;
  step: () => boolean;
  reset: () => void;
  free: () => void;
  getAsObject: () => Record<string, unknown>;
};

let sqlInit: Promise<SqlJsStatic> | null = null;

export function resolveSqlWasmPath(extensionPath: string): string {
  const wasmCandidates = [
    join(extensionPath, "dist", "sql-wasm.wasm"),
    join(extensionPath, "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
  ];
  return wasmCandidates.find((candidate) => existsSync(candidate)) ?? wasmCandidates[0]!;
}

export async function loadSqlJs(extensionPath: string): Promise<SqlJsStatic> {
  if (!sqlInit) {
    sqlInit = (async () => {
      const initSqlJs = require("sql.js") as (config?: { locateFile: (file: string) => string }) => Promise<SqlJsStatic>;
      const wasmPath = resolveSqlWasmPath(extensionPath);
      return initSqlJs({ locateFile: () => wasmPath });
    })();
  }
  return sqlInit;
}
