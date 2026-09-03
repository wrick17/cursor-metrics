import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import type { ModelPricingCatalog } from "./model-pricing-types";

export type PricingCatalogOverlay = {
  syncedAt: number;
  sourceUrl: string;
  catalog: Partial<ModelPricingCatalog>;
  /** Model ids present in docs sync but not in the extension bundled catalog. */
  runtimeOnlyModelIds?: string[];
};

const OVERLAY_FILENAME = "pricing-catalog-overlay.json";

export class PricingCatalogStore {
  private readonly overlayPath: string;

  constructor(storageDir: string) {
    this.overlayPath = join(storageDir, OVERLAY_FILENAME);
  }

  load(): PricingCatalogOverlay | null {
    if (!existsSync(this.overlayPath)) return null;
    try {
      const raw = JSON.parse(readFileSync(this.overlayPath, "utf8")) as PricingCatalogOverlay;
      if (!raw || typeof raw !== "object" || !raw.catalog) return null;
      return raw;
    } catch {
      return null;
    }
  }

  save(overlay: PricingCatalogOverlay): void {
    mkdirSync(join(this.overlayPath, ".."), { recursive: true });
    writeFileSync(this.overlayPath, JSON.stringify(overlay, null, 2), "utf8");
  }

  clear(): void {
    if (existsSync(this.overlayPath)) {
      unlinkSync(this.overlayPath);
    }
  }
}
