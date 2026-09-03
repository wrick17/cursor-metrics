import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2];

const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const version = pkg.version;

if (target === "ovsx") {
  const token = process.env.OPEN_VSX_TOKEN;
  if (!token) {
    throw new Error("OPEN_VSX_TOKEN is not set");
  }
  execSync(`bunx ovsx publish "build/cursor-usage-${version}.vsix" -p "${token}"`, {
    cwd: root,
    stdio: "inherit",
  });
  return;
}

if (target === "vsm") {
  const token = process.env.VSCE_PAT;
  if (!token) {
    throw new Error("VSCE_PAT is not set");
  }
  execSync(
    `bunx @vscode/vsce publish --packagePath "build/cursor-usage-auto-${version}.vsix" -p "${token}"`,
    { cwd: root, stdio: "inherit" },
  );
  return;
}

throw new Error("Usage: bun scripts/publish-extension.mjs ovsx|vsm");
