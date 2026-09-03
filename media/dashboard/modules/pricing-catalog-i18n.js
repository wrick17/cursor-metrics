import { local } from "./core.js";

const VARIANT_LABELS = {
  en: {
    Thinking: "Thinking",
    High: "High",
    "High + Thinking": "High + Thinking",
    "Medium + Thinking": "Medium + Thinking",
    "Input > 200k": "Input > 200k",
    Fast: "Fast",
    "Max Mode (1M)": "Max Mode (1M)",
    "Launch promo (until Aug 2026)": "Launch promo (until Aug 2026)",
    "High reasoning": "High reasoning",
  },
  it: {
    Thinking: "Ragionamento",
    High: "Alta",
    "High + Thinking": "Alta + ragionamento",
    "Medium + Thinking": "Media + ragionamento",
    "Input > 200k": "Input > 200k",
    Fast: "Veloce",
    "Max Mode (1M)": "Max Mode (1M)",
    "Launch promo (until Aug 2026)": "Promo lancio (fino ad ago 2026)",
    "High reasoning": "Ragionamento elevato",
  },
};

const VARIANT_DESCRIPTIONS = {
  en: {
    "claude-4-sonnet.thinking":
      "Same $/M rates; more reasoning tokens billed as output",
    "claude-4-sonnet-1m.long-context":
      "2× input rates when context exceeds 200k tokens",
    "claude-4.6-opus.high":
      "Same $/M; higher reasoning effort uses more tokens",
    "claude-4.6-opus.high-thinking":
      "Same $/M; extended reasoning increases output tokens",
    "claude-4.6-sonnet.medium-thinking":
      "Same $/M; thinking tokens add to output usage",
    "claude-opus-4.8.fast":
      "3× cheaper per token than Opus 4.7 fast ($30/M input)",
    "claude-opus-4.8.max-long-context":
      "Same per-token rates up to 1M context",
    "claude-sonnet-5.promo":
      "Promotional rates through August 31, 2026",
    "gpt-5.high":
      "Same $/M; more reasoning tokens consumed",
    "gpt-5.fast":
      "2× per-token rates vs GPT-5",
    "gpt-5.4.fast":
      "15% faster, 2× per-token rates",
    "gpt-5.4.max-long-context":
      "2× input rates with up to 1M context",
    "gpt-5.5.fast":
      "Higher per-token rates for faster responses",
  },
  it: {
    "claude-4-sonnet.thinking":
      "Stesse tariffe $/M; più token di ragionamento fatturati come output",
    "claude-4-sonnet-1m.long-context":
      "Tariffa input ×2 quando il contesto supera 200k token",
    "claude-4.6-opus.high":
      "Stesse tariffe $/M; maggiore sforzo di ragionamento consuma più token",
    "claude-4.6-opus.high-thinking":
      "Stesse tariffe $/M; ragionamento esteso aumenta i token di output",
    "claude-4.6-sonnet.medium-thinking":
      "Stesse tariffe $/M; i token di ragionamento si aggiungono all'output",
    "claude-opus-4.8.fast":
      "3× più economico per token rispetto a Opus 4.7 veloce ($30/M input)",
    "claude-opus-4.8.max-long-context":
      "Stesse tariffe per token fino a 1M di contesto",
    "claude-sonnet-5.promo":
      "Tariffe promozionali fino al 31 agosto 2026",
    "gpt-5.high":
      "Stesse tariffe $/M; più token di ragionamento consumati",
    "gpt-5.fast":
      "Tariffe per token ×2 rispetto a GPT-5",
    "gpt-5.4.fast":
      "15% più veloce, tariffe per token ×2",
    "gpt-5.4.max-long-context":
      "Tariffa input ×2 con contesto fino a 1M",
    "gpt-5.5.fast":
      "Tariffe per token più elevate per risposte più rapide",
  },
};

const LEGACY_NOTES = {
  en: {
    legacyRequests: "2× requests on legacy request-based plans",
  },
  it: {
    legacyRequests: "2× richieste sui piani legacy a consumo richieste",
  },
};

function locale() {
  return local.locale === "it" ? "it" : "en";
}

export function translateVariantLabel(label) {
  return VARIANT_LABELS[locale()][label] ?? label;
}

export function translateVariantNote(modelId, variant) {
  const key = modelId + "." + variant.id;
  const desc = VARIANT_DESCRIPTIONS[locale()][key];
  if (desc) return desc;
  if (variant.description) return variant.description;
  if (variant.legacyNote) {
    return LEGACY_NOTES[locale()].legacyRequests;
  }
  return "";
}
