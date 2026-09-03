import rawCatalog from "./data/model-pricing.json";
import { mergeCatalogs } from "./pricing-catalog-merge";
import type {
  ModelPricingCatalog,
  ModelPricingEntry,
  ModelPricingVariant,
  ResolvedModelPricing,
  TokenRatesPerMillion,
} from "./model-pricing-types";

function normalizeModelId(modelId: string): string {
  return modelId.trim().toLowerCase();
}

/** Longest-first suffixes stripped from unknown API slugs before resolving the base model. */
const MODEL_ID_STRIP_SUFFIXES = [
  "-thinking-xhigh",
  "-thinking-high",
  "-thinking-medium",
  "-thinking-low",
  "-medium-thinking",
  "-high-thinking",
  "-xhigh-thinking",
  "-thinking",
  "-xhigh",
  "-medium",
  "-high",
  "-fast",
] as const;

const THINKING_EFFORT_TIERS = ["xhigh", "high", "medium", "low"] as const;

function slugForms(slug: string): string[] {
  const forms = new Set<string>([slug]);
  if (slug.includes(".")) forms.add(slug.replace(/\./g, "-"));
  if (slug.includes("-")) forms.add(slug.replace(/-/g, "."));
  return [...forms];
}

function isThinkingLikeVariant(variant: ModelPricingVariant): boolean {
  const id = variant.id.toLowerCase();
  const label = variant.label.toLowerCase();
  return id.includes("thinking") || label.includes("thinking");
}

function isReasoningEffortVariant(variant: ModelPricingVariant): boolean {
  if (variant.priceImpact !== "sameRateMoreTokens") return false;
  const id = variant.id.toLowerCase();
  const label = variant.label.toLowerCase();
  return id === "high" || id === "medium" || label.includes("reasoning") || isThinkingLikeVariant(variant);
}

function generateVariantAliases(entry: ModelPricingEntry, variant: ModelPricingVariant): string[] {
  const out = new Set<string>(variant.aliases ?? []);
  const roots = new Set<string>([entry.id, ...(entry.aliases ?? [])]);
  for (const alias of variant.aliases ?? []) roots.add(alias);

  for (const root of roots) {
    for (const form of slugForms(root)) {
      if (isThinkingLikeVariant(variant)) {
        out.add(`${form}-thinking`);
        for (const effort of THINKING_EFFORT_TIERS) {
          out.add(`${form}-thinking-${effort}`);
          out.add(`${form}-${effort}-thinking`);
        }
        if (variant.id === "medium-thinking") {
          out.add(`${form}-medium-thinking`);
          out.add(`${form}-thinking-medium`);
        }
        if (variant.id === "high-thinking") {
          out.add(`${form}-high-thinking`);
        }
      }

      if (variant.id === "high" && isReasoningEffortVariant(variant)) {
        out.add(`${form}-high`);
        for (const effort of THINKING_EFFORT_TIERS) {
          if (effort !== "high") out.add(`${form}-${effort}`);
        }
      }

      if (variant.id === "medium" && variant.priceImpact === "sameRateMoreTokens") {
        out.add(`${form}-medium`);
        for (const effort of THINKING_EFFORT_TIERS) {
          if (effort !== "medium") out.add(`${form}-${effort}`);
        }
      }
    }
  }

  return [...out];
}

function findReasoningVariant(entry: ModelPricingEntry): ModelPricingVariant | null {
  const variants = entry.variants ?? [];
  return (
    variants.find((variant) => isThinkingLikeVariant(variant)) ??
    variants.find((variant) => variant.id === "high-thinking" || variant.id === "medium-thinking") ??
    variants.find((variant) => isReasoningEffortVariant(variant)) ??
    null
  );
}

function stripModelSuffixes(normalized: string): string {
  let id = normalized;
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of MODEL_ID_STRIP_SUFFIXES) {
      if (id.endsWith(suffix)) {
        id = id.slice(0, -suffix.length);
        changed = true;
        break;
      }
    }
  }
  return id;
}

function resolveFromAliasIndex(modelId: string): ResolvedModelPricing | null {
  if (!aliasIndex) return null;
  return aliasIndex.get(normalizeModelId(modelId)) ?? null;
}

function resolveThinkingFallback(normalized: string): ResolvedModelPricing | null {
  const baseId = stripModelSuffixes(normalized);
  const base = resolveFromAliasIndex(baseId);
  if (!base) return null;

  const reasoning = findReasoningVariant(base.entry);
  if (reasoning) {
    return {
      entry: base.entry,
      variant: reasoning,
      effectiveRates: resolveEffectiveRates(base.entry, reasoning),
    };
  }

  return base;
}

function resolveWithSuffixFallback(modelId: string): ResolvedModelPricing | null {
  const normalized = normalizeModelId(modelId);

  for (const suffix of MODEL_ID_STRIP_SUFFIXES) {
    if (!normalized.endsWith(suffix)) continue;
    const stem = normalized.slice(0, -suffix.length);
    let parent = resolveFromAliasIndex(stem);

    if (!parent && normalized.includes("thinking")) {
      parent = resolveFromAliasIndex(stripModelSuffixes(normalized));
    }

    if (!parent) continue;

    if (suffix === "-fast") {
      const fastVariant = parent.entry.variants?.find((variant) => variant.id === "fast");
      if (fastVariant) {
        return {
          entry: parent.entry,
          variant: fastVariant,
          effectiveRates: resolveEffectiveRates(parent.entry, fastVariant),
        };
      }
    }

    const wantsThinking = suffix.includes("thinking") || normalized.includes("thinking");
    if (wantsThinking && !parent.variant) {
      const reasoning = findReasoningVariant(parent.entry);
      if (reasoning) {
        return {
          entry: parent.entry,
          variant: reasoning,
          effectiveRates: resolveEffectiveRates(parent.entry, reasoning),
        };
      }
    }

    return {
      entry: parent.entry,
      variant: parent.variant,
      effectiveRates: resolveEffectiveRates(parent.entry, parent.variant),
    };
  }

  if (normalized.includes("thinking")) {
    return resolveThinkingFallback(normalized);
  }

  return null;
}

function registerAlias(
  index: Map<string, ResolvedModelPricing>,
  alias: string,
  resolved: ResolvedModelPricing,
): void {
  for (const form of slugForms(alias)) {
    index.set(normalizeModelId(form), resolved);
  }
}

function validateCatalog(data: unknown): ModelPricingCatalog {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid model pricing catalog");
  }
  const catalog = data as ModelPricingCatalog;
  if (!Array.isArray(catalog.models) || catalog.models.length === 0) {
    throw new Error("Model pricing catalog has no models");
  }
  for (const entry of catalog.models) {
    if (!entry.rates.output && !entry.rates.inputPlusCacheWrite) {
      throw new Error(`Model ${entry.id} is missing output pricing`);
    }
  }
  return catalog;
}

let cachedCatalog: ModelPricingCatalog | null = null;
let aliasIndex: Map<string, ResolvedModelPricing> | null = null;
let catalogOverlay: Partial<ModelPricingCatalog> | null = null;
let pricingCatalogSyncedAt: number | null = null;
let catalogRuntimeOnlyModelIds: string[] = [];

export type RuntimeOnlyPricingModel = {
  id: string;
  displayName: string;
};

function normalizeDisplayNameForMatch(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function setPricingCatalogOverlay(
  overlay: Partial<ModelPricingCatalog> | null,
  syncedAt?: number | null,
  runtimeOnlyModelIds?: string[] | null,
): void {
  catalogOverlay = overlay;
  pricingCatalogSyncedAt = syncedAt ?? null;
  catalogRuntimeOnlyModelIds = overlay ? (runtimeOnlyModelIds ?? []) : [];
  invalidatePricingCatalogCache();
}

export function getPricingRuntimeOnlyModels(): RuntimeOnlyPricingModel[] {
  if (!catalogRuntimeOnlyModelIds.length) return [];

  const bundled = getBundledModelPricingCatalog();
  const merged = getModelPricingCatalog();

  return catalogRuntimeOnlyModelIds
    .map((id) => merged.models.find((entry) => entry.id === id))
    .filter((entry): entry is ModelPricingEntry => !!entry)
    .filter(
      (entry) =>
        !bundled.models.some(
          (bundledEntry) =>
            bundledEntry.id === entry.id ||
            normalizeDisplayNameForMatch(bundledEntry.displayName) ===
              normalizeDisplayNameForMatch(entry.displayName),
        ),
    )
    .map((entry) => ({ id: entry.id, displayName: entry.displayName }));
}

export function getPricingCatalogSyncedAt(): number | null {
  return pricingCatalogSyncedAt;
}

export function invalidatePricingCatalogCache(): void {
  cachedCatalog = null;
  aliasIndex = null;
}

export function getBundledModelPricingCatalog(): ModelPricingCatalog {
  return validateCatalog(rawCatalog);
}

export { validateCatalog };

function applyRateMultiplier(
  rates: TokenRatesPerMillion,
  multiplier: number,
  inputOnly = false,
): TokenRatesPerMillion {
  const scale = (value: number | undefined) =>
    value === undefined ? undefined : value * multiplier;
  if (inputOnly) {
    return {
      ...rates,
      input: scale(rates.input),
      inputPlusCacheWrite: scale(rates.inputPlusCacheWrite),
    };
  }
  return {
    input: scale(rates.input),
    cacheWrite: scale(rates.cacheWrite),
    cacheRead: scale(rates.cacheRead),
    output: scale(rates.output),
    inputPlusCacheWrite: scale(rates.inputPlusCacheWrite),
  };
}

function resolveEffectiveRates(
  entry: ModelPricingEntry,
  variant: ModelPricingVariant | null,
  maxMode = false,
): TokenRatesPerMillion {
  if (variant?.priceImpact === "separateModel" && variant.separateModelId) {
    const separate = getModelPricingCatalog().models.find((m) => m.id === variant.separateModelId);
    if (separate) return separate.rates;
  }
  if (variant?.priceImpact === "customRates" && variant.rates) {
    return variant.rates;
  }

  let rates = entry.rates;
  if (variant?.priceImpact === "rateMultiplier" && variant.rateMultiplier) {
    rates = applyRateMultiplier(rates, variant.rateMultiplier);
  }
  if (variant?.priceImpact === "inputMultiplier" && variant.inputRateMultiplier) {
    rates = applyRateMultiplier(rates, variant.inputRateMultiplier, true);
  }
  if (variant?.requiresMaxMode && !maxMode) {
    return rates;
  }
  if (maxMode) {
    const maxVariant = entry.variants?.find((v) => v.id === "max-long-context");
    if (maxVariant?.inputRateMultiplier) {
      rates = applyRateMultiplier(rates, maxVariant.inputRateMultiplier, true);
    }
  }
  return rates;
}

function buildAliasIndex(catalog: ModelPricingCatalog): Map<string, ResolvedModelPricing> {
  const index = new Map<string, ResolvedModelPricing>();
  for (const entry of catalog.models) {
    const baseResolved: ResolvedModelPricing = {
      entry,
      variant: null,
      effectiveRates: entry.rates,
    };
    registerAlias(index, entry.id, baseResolved);
    for (const alias of entry.aliases ?? []) {
      registerAlias(index, alias, baseResolved);
    }
    for (const variant of entry.variants ?? []) {
      const variantResolved: ResolvedModelPricing = {
        entry,
        variant,
        effectiveRates: resolveEffectiveRates(entry, variant),
      };
      for (const alias of generateVariantAliases(entry, variant)) {
        registerAlias(index, alias, variantResolved);
      }
    }
  }
  return index;
}

export function getModelPricingCatalog(): ModelPricingCatalog {
  if (!cachedCatalog) {
    const bundled = getBundledModelPricingCatalog();
    cachedCatalog = validateCatalog(mergeCatalogs(bundled, catalogOverlay));
    aliasIndex = buildAliasIndex(cachedCatalog);
  }
  return cachedCatalog;
}

export function resolveModelPricingDetailed(
  modelId: string,
  maxMode = false,
): ResolvedModelPricing | null {
  getModelPricingCatalog();
  const resolved = resolveFromAliasIndex(modelId) ?? resolveWithSuffixFallback(modelId);
  if (!resolved) return null;
  return {
    ...resolved,
    effectiveRates: resolveEffectiveRates(resolved.entry, resolved.variant, maxMode),
  };
}

export function resolveModelPricing(modelId: string): ModelPricingEntry | null {
  return resolveModelPricingDetailed(modelId)?.entry ?? null;
}

export function formatVariantPriceImpact(variant: ModelPricingVariant): string {
  if (variant.priceImpact === "sameRateMoreTokens") {
    return "same $/M, more tokens";
  }
  if (variant.priceImpact === "rateMultiplier" && variant.rateMultiplier) {
    return variant.rateMultiplier + "× all rates";
  }
  if (variant.priceImpact === "inputMultiplier" && variant.inputRateMultiplier) {
    return variant.inputRateMultiplier + "× input";
  }
  if (variant.priceImpact === "customRates") {
    return "custom rates";
  }
  if (variant.priceImpact === "separateModel" && variant.separateModelId) {
    return "→ " + variant.separateModelId;
  }
  return variant.priceImpact;
}
