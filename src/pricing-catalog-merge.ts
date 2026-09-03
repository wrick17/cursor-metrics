import type {
  ModelPricingCatalog,
  ModelPricingEntry,
  PlanPricingInfo,
  TokenRatesPerMillion,
} from "./model-pricing-types";

export type MergeStats = {
  updated: number;
  added: number;
};

function normalizeDisplayName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function mergeRates(base: TokenRatesPerMillion, patch: TokenRatesPerMillion): TokenRatesPerMillion {
  return {
    input: patch.input ?? base.input,
    cacheWrite: patch.cacheWrite ?? base.cacheWrite,
    cacheRead: patch.cacheRead ?? base.cacheRead,
    output: patch.output ?? base.output,
    inputPlusCacheWrite: patch.inputPlusCacheWrite ?? base.inputPlusCacheWrite,
  };
}

function mergeModelEntry(base: ModelPricingEntry, patch: ModelPricingEntry): ModelPricingEntry {
  return {
    ...base,
    displayName: patch.displayName || base.displayName,
    provider: patch.provider || base.provider,
    pool: patch.pool || base.pool,
    rates: mergeRates(base.rates, patch.rates),
    hidden: patch.hidden ?? base.hidden,
    notes: patch.notes ?? base.notes,
    docsUrl: patch.docsUrl ?? base.docsUrl,
    aliases: base.aliases,
    variants: base.variants,
  };
}

export function findModelIndexByDisplayName(
  models: ModelPricingEntry[],
  displayName: string,
): number {
  const target = normalizeDisplayName(displayName);
  return models.findIndex((entry) => normalizeDisplayName(entry.displayName) === target);
}

export function findModelIndexById(models: ModelPricingEntry[], id: string): number {
  return models.findIndex((entry) => entry.id === id);
}

export function mergeCatalogs(
  base: ModelPricingCatalog,
  overlay?: Partial<ModelPricingCatalog> | null,
): ModelPricingCatalog {
  return mergeCatalogsWithStats(base, overlay).catalog;
}

function mergePlans(base: PlanPricingInfo[], overlay: PlanPricingInfo[]): PlanPricingInfo[] {
  const byId = new Map(overlay.map((plan) => [plan.id, plan]));
  const merged = base.map((plan) => (byId.has(plan.id) ? { ...plan, ...byId.get(plan.id)! } : plan));
  for (const plan of overlay) {
    if (!base.some((entry) => entry.id === plan.id)) {
      merged.push(plan);
    }
  }
  return merged;
}

export function mergeCatalogsWithStats(
  base: ModelPricingCatalog,
  overlay?: Partial<ModelPricingCatalog> | null,
): { catalog: ModelPricingCatalog; stats: MergeStats } {
  if (!overlay) {
    return { catalog: base, stats: { updated: 0, added: 0 } };
  }

  const models = base.models.map((entry) => ({ ...entry, rates: { ...entry.rates } }));
  let updated = 0;
  let added = 0;

  for (const patch of overlay.models ?? []) {
    const byId = findModelIndexById(models, patch.id);
    const byName = byId >= 0 ? -1 : findModelIndexByDisplayName(models, patch.displayName);
    const index = byId >= 0 ? byId : byName;

    if (index >= 0) {
      models[index] = mergeModelEntry(models[index]!, patch);
      updated += 1;
    } else {
      models.push({
        ...patch,
        pool: patch.pool ?? "api",
        aliases: patch.aliases ?? [],
      });
      added += 1;
    }
  }

  const plans: PlanPricingInfo[] = overlay.plans?.length
    ? mergePlans(base.plans, overlay.plans)
    : base.plans;

  return {
    catalog: {
      sourceUrl: overlay.sourceUrl ?? base.sourceUrl,
      lastUpdated: overlay.lastUpdated ?? base.lastUpdated,
      cursorTokenRatePerMillion:
        overlay.cursorTokenRatePerMillion ?? base.cursorTokenRatePerMillion,
      plans,
      models,
    },
    stats: { updated, added },
  };
}
