import { resolveModelPricing } from "./model-pricing";

const MODEL_LABELS: Record<string, string> = {
  default: "Auto",
};

export function formatModelLabel(model: string): string {
  const entry = resolveModelPricing(model);
  if (entry) return entry.displayName;
  return MODEL_LABELS[model] ?? model;
}
