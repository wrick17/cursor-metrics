import { readFileSync, writeFileSync } from "node:fs";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("Usage: bun scripts/save-cdp-png.mjs <cdp-json> <output.png>");
  process.exit(1);
}

const payload = JSON.parse(readFileSync(input, "utf8"));
const base64 = payload?.result?.data ?? payload?.data;
if (!base64) {
  console.error("No screenshot data in", input);
  process.exit(1);
}

writeFileSync(output, Buffer.from(base64, "base64"));
console.log("Wrote", output);
