import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getBundledModelPricingCatalog } from "../src/model-pricing";
import { mergeCatalogsWithStats } from "../src/pricing-catalog-merge";
import { buildOverlayFromMarkdown, fetchPricingDocsMarkdown } from "../src/pricing-catalog-sync";

const args = new Set(process.argv.slice(2));
const updateBundled = args.has("--update-bundled");
const fixturePath = args.has("--fixture")
  ? args.has("--fixture") && process.argv.includes("--fixture")
    ? process.argv[process.argv.indexOf("--fixture") + 1]
    : undefined
  : undefined;

async function main(): Promise<void> {
  const markdown = fixturePath
    ? readFileSync(fixturePath, "utf8")
    : await fetchPricingDocsMarkdown();

  const bundled = getBundledModelPricingCatalog();
  const { overlay, warnings, updated, added } = buildOverlayFromMarkdown(markdown, bundled);
  const { catalog } = mergeCatalogsWithStats(bundled, overlay);

  console.log(`Parsed overlay: ${updated} updated, ${added} added`);
  for (const warning of warnings) {
    console.warn(warning);
  }

  if (updateBundled) {
    const outPath = join(import.meta.dir, "..", "src", "data", "model-pricing.json");
    writeFileSync(outPath, JSON.stringify(catalog, null, 2) + "\n", "utf8");
    console.log(`Wrote bundled catalog to ${outPath}`);
    return;
  }

  const previewDir = join(import.meta.dir, "..", "build");
  mkdirSync(previewDir, { recursive: true });
  const previewPath = join(previewDir, "pricing-catalog-preview.json");
  writeFileSync(previewPath, JSON.stringify(catalog, null, 2), "utf8");
  console.log(`Merged catalog preview written to ${previewPath}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
