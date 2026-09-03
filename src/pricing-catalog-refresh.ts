import type { DashboardState } from "./dashboard-state";
import { setPricingCatalogOverlay } from "./model-pricing";
import { syncPricingCatalog, type PricingSyncResult } from "./pricing-catalog-sync";
import { PricingCatalogStore } from "./pricing-catalog-store";

let pricingCatalogStore: PricingCatalogStore | null = null;
let postDashboardState: (() => void) | null = null;
let logFn: (msg: string) => void = () => {};

export function initPricingCatalogRefresh(
  store: PricingCatalogStore,
  _getState: () => DashboardState,
  logger: (msg: string) => void,
  onStateChange: () => void,
): void {
  pricingCatalogStore = store;
  postDashboardState = onStateChange;
  logFn = logger;
  const overlay = store.load();
  if (overlay) {
    setPricingCatalogOverlay(
      overlay.catalog,
      overlay.syncedAt,
      overlay.runtimeOnlyModelIds ?? [],
    );
    logFn(`Loaded pricing catalog overlay (${overlay.catalog.models?.length ?? 0} models)`);
  }
}

let pricingSyncInFlight: Promise<PricingSyncResult> | null = null;

export async function refreshPricingCatalog(): Promise<PricingSyncResult> {
  if (!pricingCatalogStore) {
    throw new Error("Extension not initialized");
  }
  if (pricingSyncInFlight) return pricingSyncInFlight;

  pricingSyncInFlight = (async () => {
  logFn("Syncing pricing catalog from Cursor docs...");
  const result = await syncPricingCatalog(pricingCatalogStore);
  const overlay = pricingCatalogStore.load();
  setPricingCatalogOverlay(
    overlay?.catalog ?? null,
    result.syncedAt,
    overlay?.runtimeOnlyModelIds ?? result.runtimeOnlyModelIds,
  );
  logFn(`Pricing catalog synced: ${result.updated} updated, ${result.added} added`);
  for (const warning of result.warnings) {
    logFn(`Pricing sync warning: ${warning}`);
  }
  postDashboardState?.();
  return result;
  })();

  try {
    return await pricingSyncInFlight;
  } finally {
    pricingSyncInFlight = null;
  }
}
