import { local } from "./core.js";
import { MESSAGES_EN } from "./i18n/en.js";
import { MESSAGES_IT } from "./i18n/it.js";

const MESSAGES = {
  en: MESSAGES_EN,
  it: MESSAGES_IT,
};

const STATIC_I18N = {
  "range.1d": "range1d",
  "range.7d": "range7d",
  "range.30d": "range30d",
  "range.billingCycle": "rangeBilling",
  "section.usage.title": "sectionUsage",
  "section.usage.desc": "sectionUsageDesc",
  "section.pool.title": "sectionPool",
  "section.pool.desc": "sectionPoolDesc",
  "section.breakdown.title": "sectionBreakdown",
  "section.pricing.title": "sectionPricing",
  "section.pricing.desc": "sectionPricingDesc",
  "pricingSource": "pricingSource",
  "pricingPoolFirstParty": "pricingPoolFirstParty",
  "pricingPoolApi": "pricingPoolApi",
  "pricingPoolFirstPartyDesc": "pricingPoolFirstPartyDesc",
  "pricingPoolApiDesc": "pricingPoolApiDesc",
  "pricingFilterProvider": "pricingFilterProvider",
  "pricingFilterPool": "pricingFilterPool",
  "pricingFilterAllPools": "pricingFilterAllPools",
  "pricingFilterUsedOnly": "pricingFilterUsedOnly",
  "pricingInput": "pricingInput",
  "pricingCacheWrite": "pricingCacheWrite",
  "pricingCacheRead": "pricingCacheRead",
  "pricingOutput": "pricingOutput",
  "pricingColProvider": "pricingColProvider",
  "pricingColActual": "pricingColActual",
  "pricingColTheoretical": "pricingColTheoretical",
  "pricingColDelta": "pricingColDelta",
  "pricingModesNote": "pricingModesNote",
  "tab.events": "tabEvents",
  "tab.conversations": "tabConversations",
  "mainTab.usage": "mainTabUsage",
  "mainTab.pools": "mainTabPools",
  "mainTab.pricing": "mainTabPricing",
  "mainTab.activity": "mainTabActivity",
  "preview.titles": "previewTitles",
  "col.conversation": "colConversation",
  "col.lastActive": "colLastActive",
  "col.models": "colModels",
  "col.calls": "colCalls",
  "filter.usage.label": "filterUsage",
  "filter.metric.label": "filterMetric",
  "filter.all": "filterAll",
  "filter.included": "filterIncluded",
  "filter.ondemand": "filterOnDemand",
  "metric.spend": "metricSpend",
  "metric.tokens": "metricTokens",
  "metric.requests": "metricRequests",
  "export.csv": "exportCsv",
  "col.model": "colModel",
  "col.requests": "colRequests",
  "col.tokens": "colTokens",
  "col.spend": "colSpend",
  "col.theoretical": "colTheoretical",
  "col.poolShare": "colPoolShare",
  "col.poolQuota": "colPoolQuota",
  "col.date": "colDate",
  "col.type": "colType",
  "pool.pace.title": "poolDailyPace",
  "pool.pace.desc": "poolDailyPaceDesc",
  "event.details": "eventDetails",
};

export function t(key) {
  const locale = local.locale in MESSAGES ? local.locale : "en";
  return MESSAGES[locale][key] ?? MESSAGES.en[key] ?? key;
}

export function cardHelpText(key) {
  const map = {
    includedRequests: "helpIncludedRequests",
    onDemand: "helpOnDemand",
    includedPool: "helpIncludedPool",
    poolDepletion: "helpPoolDepletion",
    poolPace: "helpPoolPace",
    poolRecommended: "helpPoolRecommended",
    billingCycle: "helpBillingCycle",
  };
  return t(map[key] || key);
}

export function getDateLocale() {
  return local.locale === "it" ? "it-IT" : "en-US";
}

export function applyStaticTranslations() {
  document.documentElement.lang = local.locale === "it" ? "it" : "en";

  const titleEl = document.querySelector(".dashboard-header h1");
  if (titleEl) titleEl.textContent = t("title");

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = STATIC_I18N[el.dataset.i18n] || el.dataset.i18n;
    el.textContent = t(key);
  });

  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  });

  const refreshBtn = document.getElementById("refresh-btn");
  if (refreshBtn && !refreshBtn.disabled) {
    refreshBtn.textContent = t("refresh");
  }

  const langSelect = document.getElementById("lang-select");
  if (langSelect) {
    langSelect.value = local.locale;
    langSelect.setAttribute("aria-label", t("language"));
  }

  const currencySelect = document.getElementById("currency-select");
  if (currencySelect) {
    currencySelect.value = local.currency === "eur" ? "eur" : "usd";
    currencySelect.setAttribute("aria-label", t("currency"));
  }

  const poolNote = document.getElementById("pool-chart-note");
  if (poolNote) poolNote.textContent = t("poolChartNote");

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", t(el.dataset.i18nPlaceholder));
  });
}
