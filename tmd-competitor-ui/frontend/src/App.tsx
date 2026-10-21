import { Check, ChevronDown, CircleAlert, Filter } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

import { fetchBidRateHkdHistory, fetchDashboardBootstrap, fetchFxTmdHistory, fetchLatestAiSummary, fetchLatestRates, fetchNewFundHistory } from "./lib/api";
import type { AiSummaryResponse, BidRateHkdPoint, FilterOption, FiltersResponse, LatestRatesResponse, RateItem } from "./lib/types";
import { TmdSidebar } from "./tmd/TmdSidebar";
import { readTmdSessionCache, writeTmdSessionCache } from "./tmd/sessionCache";
import {
  DEFAULT_TMD_PAGE,
  fxTmdPageConfig,
  newFundPageConfigs,
  tmdNavItems,
  type DashboardView,
  type DimensionMode,
  type HeatmapView,
  type RateView,
} from "./tmd/navigation";

type FilterState = {
  currencies: string[];
  tenors: string[];
  bank_codes: string[];
  customer_segments: string[];
};

type NewFundCurrency = (typeof newFundPageConfigs)[number]["currency"];
type NewFundHistoryKey = `newfund:${NewFundCurrency}`;
type OverviewHistoryKey = NewFundHistoryKey | "fx-tmd";

const overviewTenors = ["3m", "6m", "12m"];
const overnightBidRateSeriesKey = "overnight-bid-rate-hkd";
const tmdSidebarCollapsedStorageKey = "tmd-sidebar-collapsed";

const initialFilters: FilterState = {
  currencies: [],
  tenors: ["3m", "6m", "9m", "12m"],
  bank_codes: [],
  customer_segments: [],
};

const defaultTenorSelection = ["3m", "6m", "9m", "12m"];

const currencyOrder = ["HKD", "USD", "RMB", "AUD"];
const fxTmdOverviewDimensions = currencyOrder.map((currency) => `1w ${currency}`);
const rateViewDisplayOrder: RateView[] = ["New Fund", "FX TMD", "Existing Fund", "Special Offer"];
const heatmapBankColumnWidth = 98;
const heatmapVisibleDateColumnCount = 15.1;
const fixedBankCodeOrder = [
  "hsbc_hk",
  "hang_seng",
  "boc_hk",
  "scb_hk",
  "dbs_hk",
  "bea_hk",
  "icbc_asia",
  "ccb_asia",
  "ocbc_hk",
  "fubon_hk",
  "mox_bank",
  "chiyu_hk",
  "shacombank_hk",
  "bocom_hk",
  "cncbi_hk",
  "cmb_wing_lung_hk",
  "livi_bank",
  "welab_bank",
];
const fixedBankRank = new Map(fixedBankCodeOrder.map((bankCode, index) => [bankCode, index]));
const aiSummaryBankNames = [
  "China Construction Bank",
  "Standard Chartered",
  "CMB Wing Lung Bank",
  "Shanghai Commercial Bank",
  "Bank of Communications",
  "Bank of China",
  "HSBC Hong Kong",
  "Hang Seng Bank",
  "ICBC (Asia)",
  "ICBC Asia",
  "WeLab Bank",
  "livi Bank",
  "Mox Bank",
  "Chiyu Bank",
  "Fubon Bank",
  "OCBC Bank",
  "CNCBI",
  "HSBC",
  "Hang Seng",
  "BOC",
  "DBS",
  "ICBC",
  "CCB",
  "OCBC",
  "Fubon",
  "Mox",
  "Livi",
  "WeLab",
].sort((left, right) => right.length - left.length);
const aiSummaryBankPattern = aiSummaryBankNames.map(escapeRegExp).join("|");
const aiSummaryHighlightPattern = new RegExp(`(${aiSummaryBankPattern})|([+-]\\d+(?:\\.\\d+)?\\s*bp\\b)|(\\b(?:to|remains at)\\s+)(\\d+(?:\\.\\d+)?%?)`, "gi");
type AiSummaryDimension = {
  key: string;
  label: string;
  aliases: string[];
};
const newFundAiSummaryDimensions: AiSummaryDimension[] = [
  { key: "3m", label: "3-Month", aliases: ["3m", "3-month", "3 month", "3-month tenor", "3 months"] },
  { key: "6m", label: "6-Month", aliases: ["6m", "6-month", "6 month", "6-month tenor", "6 months"] },
  { key: "12m", label: "12-Month", aliases: ["12m", "12-month", "12 month", "12-month tenor", "12 months"] },
];

function readSidebarCollapsedPreference() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(tmdSidebarCollapsedStorageKey) === "true";
  } catch {
    return false;
  }
}
const fxTmdAiSummaryDimensions: AiSummaryDimension[] = [
  { key: "HKD", label: "HKD", aliases: ["HKD"] },
  { key: "USD", label: "USD", aliases: ["USD"] },
  { key: "RMB", label: "RMB", aliases: ["RMB", "CNY"] },
  { key: "AUD", label: "AUD", aliases: ["AUD"] },
];
type AiSummaryTrendSource = "hsbc" | "market";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getTmdTypeLabel(tmdType: string) {
  if (tmdType === "FX TMD") {
    return "FX TMD";
  }
  return tmdType;
}

function getNewFundHistoryKey(currency: NewFundCurrency): NewFundHistoryKey {
  return `newfund:${currency}`;
}

function isNewFundHistoryKey(key: OverviewHistoryKey): key is NewFundHistoryKey {
  return key.startsWith("newfund:");
}

function getCurrencyFromHistoryKey(key: NewFundHistoryKey): NewFundCurrency {
  return key.replace("newfund:", "") as NewFundCurrency;
}

function getOverviewHistoryLabel(key: OverviewHistoryKey) {
  if (key === "fx-tmd") {
    return "FX TMD";
  }
  return `New Fund - ${getCurrencyFromHistoryKey(key)}`;
}

function formatTenorLabel(tenor: string) {
  return tenor;
}

function getItemDimensionLabel(item: RateItem, mode: DimensionMode) {
  const tenor = item.tenor_bucket || item.tenor;
  return mode === "tenor-currency" ? `${tenor} ${item.currency}` : tenor;
}

function getDimensionTenor(dimension: string) {
  return dimension.split(" ")[0] ?? dimension;
}

function getDimensionCurrency(dimension: string) {
  const parts = dimension.split(" ");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function compareDimensions(left: string, right: string) {
  const tenorDiff = compareTenors(getDimensionTenor(left), getDimensionTenor(right));
  if (tenorDiff !== 0) {
    return tenorDiff;
  }
  return compareCurrencies(getDimensionCurrency(left), getDimensionCurrency(right));
}

function buildDimensionTabs(items: RateItem[], mode: DimensionMode) {
  const availableDimensions = Array.from(new Set(items.map((item) => getItemDimensionLabel(item, mode)))).sort(compareDimensions);
  return [{ label: "All", tenor: "" }, ...availableDimensions.map((dimension) => ({ label: formatTenorLabel(dimension), tenor: dimension }))];
}

function getSpecificTenorsFromTabs(tabs: Array<{ label: string; tenor: string }>) {
  return tabs.map((tab) => tab.tenor).filter(Boolean);
}

function normalizeTenorSelection(selection: string[], availableTenors: string[]) {
  const validSelection = selection.filter((tenor) => tenor === "" || availableTenors.includes(tenor));
  if (validSelection.includes("")) {
    return [""];
  }
  return sortTenorValues(validSelection);
}

function toggleTenorSelection(selection: string[], tenor: string, availableTenors: string[]) {
  if (tenor === "") {
    return [""];
  }

  const withoutAll = selection.filter((value) => value !== "");
  if (withoutAll.includes(tenor)) {
    if (withoutAll.length === 1) {
      return withoutAll;
    }
    return withoutAll.filter((value) => value !== tenor);
  }

  return sortTenorValues([...withoutAll, tenor].filter((value) => availableTenors.includes(value)));
}

function matchesTenorSelection(selection: string[], tenor: string) {
  if (selection.length === 0 || selection.includes("")) {
    return true;
  }
  return selection.includes(tenor);
}

function sortTmdTypes<T extends RateView>(values: T[]) {
  return [...values].sort((left, right) => rateViewDisplayOrder.indexOf(left) - rateViewDisplayOrder.indexOf(right));
}

function compareCurrencies(left: string, right: string) {
  const leftRank = currencyOrder.indexOf(left);
  const rightRank = currencyOrder.indexOf(right);
  if (leftRank === -1 && rightRank === -1) {
    return left.localeCompare(right);
  }
  if (leftRank === -1) {
    return 1;
  }
  if (rightRank === -1) {
    return -1;
  }
  return leftRank - rightRank;
}

function compareTenors(left: string, right: string) {
  const leftRank = getTenorRank(left);
  const rightRank = getTenorRank(right);
  if (!Number.isFinite(leftRank) && !Number.isFinite(rightRank)) {
    return left.localeCompare(right);
  }
  if (!Number.isFinite(leftRank)) {
    return 1;
  }
  if (!Number.isFinite(rightRank)) {
    return -1;
  }
  return leftRank - rightRank;
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }
  return `${value.toFixed(2)}%`;
}

function formatRateAxisPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatRateCalloutPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

function formatMoney(value: number | null) {
  if (value === null) {
    return "-";
  }
  return new Intl.NumberFormat("en-HK", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompactMoney(value: number | null) {
  if (value === null) {
    return "-";
  }
  if (Math.abs(value) >= 1_000_000_000) {
    const normalized = value / 1_000_000_000;
    return `${Number.isInteger(normalized) ? normalized.toFixed(0) : normalized.toFixed(1)}b`;
  }
  if (Math.abs(value) >= 1_000_000) {
    const normalized = value / 1_000_000;
    return `${Number.isInteger(normalized) ? normalized.toFixed(0) : normalized.toFixed(1)}m`;
  }
  if (Math.abs(value) >= 1_000) {
    const normalized = value / 1_000;
    return `${Number.isInteger(normalized) ? normalized.toFixed(0) : normalized.toFixed(1)}k`;
  }
  return `${value}`;
}

function formatSnapshotLabel(date: string | null) {
  if (!date) {
    return "No snapshot loaded";
  }
  return `Snapshot ${date}`;
}

function getBankLabel(name: string) {
  return name;
}

function getBankDisplayRank(bankCode: string) {
  return fixedBankRank.get(bankCode) ?? Number.POSITIVE_INFINITY;
}

function sortByFixedBankOrder<T extends { bank_code: string; bank_name_en: string }>(items: T[]) {
  return [...items].sort((left, right) => {
    const rankDiff = getBankDisplayRank(left.bank_code) - getBankDisplayRank(right.bank_code);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return left.bank_name_en.localeCompare(right.bank_name_en);
  });
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  includeAll = true,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  includeAll?: boolean;
}) {
  return (
    <label className="filter-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {includeAll ? <option value="">All</option> : null}
        {options.map((option) => (
          <option key={`${label}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MultiSelectMenu({
  label,
  values,
  options,
  onChange,
}: {
  label: string;
  values: string[];
  options: FilterOption[];
  onChange: (value: string[]) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draftValues, setDraftValues] = useState<string[]>(values);

  useEffect(() => {
    if (!isOpen) {
      setDraftValues(values);
    }
  }, [isOpen, values]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const details = detailsRef.current;
      if (!details || details.contains(event.target as Node)) {
        return;
      }
      setDraftValues(values);
      setIsOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isOpen, values]);

  const selectedOptions = options.filter((option) => values.includes(option.value));
  const summaryLabel =
    selectedOptions.length === 0
      ? "All"
      : selectedOptions.length <= 2
        ? selectedOptions.map((option) => option.label).join(", ")
        : `${selectedOptions.length} selected`;
  const hasSelection = selectedOptions.length > 0;

  return (
    <div className="filter-field">
      <span>{label}</span>
      <details
        ref={detailsRef}
        className="multi-select"
        open={isOpen}
        onToggle={(event) => {
          const nextOpen = event.currentTarget.open;
          setIsOpen(nextOpen);
          if (nextOpen) {
            setDraftValues(values);
          }
        }}
      >
        <summary
          className="multi-select-trigger"
          onClick={(event) => {
            event.preventDefault();
            setIsOpen((current) => {
              if (current) {
                setDraftValues(values);
                return false;
              }
              setDraftValues(values);
              return true;
            });
          }}
        >
          <span>{summaryLabel}</span>
          <span className={`multi-select-indicator ${hasSelection ? "is-ready" : ""}`} aria-hidden="true">
            {hasSelection ? <Check size={14} /> : <ChevronDown size={14} />}
          </span>
        </summary>
        <div className="multi-select-panel">
          <div className="multi-select-actions">
            <button type="button" className="multi-select-action" onClick={() => setDraftValues(options.map((option) => option.value))}>
              Select all
            </button>
            <button type="button" className="multi-select-action" onClick={() => setDraftValues([])}>
              Clear
            </button>
            <button
              type="button"
              className="multi-select-apply"
              onClick={() => {
                onChange(draftValues);
                setIsOpen(false);
              }}
            >
              <Check size={14} />
            </button>
          </div>
          {options.map((option) => {
            const isChecked = draftValues.includes(option.value);
            return (
              <label key={`${label}-${option.value}`} className="multi-select-option">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => {
                    if (isChecked) {
                      setDraftValues(draftValues.filter((item) => item !== option.value));
                    } else {
                      setDraftValues([...draftValues, option.value]);
                    }
                  }}
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      </details>
    </div>
  );
}

function TenorToggleGroup({
  value,
  availableTenors,
  onChange,
}: {
  value: string[];
  availableTenors: Set<string>;
  onChange: (value: string[]) => void;
}) {
  const sortedTenors = sortTenorValues(Array.from(availableTenors));
  return (
    <div className="filter-field tenor-toggle-field">
      <span>Tenor</span>
      <div className="tenor-toggle-group">
        {sortedTenors.map((tenor) => {
          const isActive = value.includes(tenor);
          return (
            <button
              key={tenor}
              type="button"
              className={`tenor-toggle ${isActive ? "is-active" : ""}`}
              onClick={() => {
                if (isActive) {
                  onChange(value.filter((item) => item !== tenor));
                } else {
                  onChange(sortTenorValues([...value, tenor]));
                }
              }}
            >
              {tenor}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function sortCurrencyOptions(options: FilterOption[]) {
  return [...options].sort((left, right) => compareCurrencies(left.value, right.value));
}

function getDefaultTenors(availableTenors: Set<string>) {
  const defaults = defaultTenorSelection.filter((tenor) => availableTenors.has(tenor));
  if (defaults.length > 0) {
    return defaults;
  }
  return sortTenorValues(Array.from(availableTenors)).slice(0, 4);
}

function sortTenorValues(values: string[]) {
  return [...values].sort(compareTenors);
}

function buildFiltersResponse(snapshotDate: string | null, items: RateItem[]): FiltersResponse {
  const toOptions = (entries: Map<string, string>) =>
    Array.from(entries.entries())
      .sort((left, right) => left[1].localeCompare(right[1]))
      .map(([value, label]) => ({ value, label }));

  const currencies = new Map<string, string>();
  const tenors = new Map<string, string>();
  const banks = new Map<string, string>();
  const customerSegments = new Map<string, string>();
  const tmdTypes = new Map<string, string>();

  items.forEach((item) => {
    currencies.set(item.currency, item.currency);
    tenors.set(item.tenor, item.tenor);
    banks.set(item.bank_code, item.bank_name_en);
    customerSegments.set(item.customer_segment, item.customer_segment);
    tmdTypes.set(item.tmd_type, item.tmd_type);
  });

  return {
    snapshot_date: snapshotDate,
    currencies: toOptions(currencies),
    tenors: toOptions(tenors),
    banks: toOptions(banks),
    customer_segments: toOptions(customerSegments),
    tmd_types: toOptions(tmdTypes),
  };
}

function getRankedUniqueBankRates(items: RateItem[]) {
  const rankedItems = [...items].sort((left, right) => {
    if (right.interest_rate !== left.interest_rate) {
      return right.interest_rate - left.interest_rate;
    }
    if (left.bank_code === "hsbc_hk" && right.bank_code !== "hsbc_hk") {
      return -1;
    }
    if (right.bank_code === "hsbc_hk" && left.bank_code !== "hsbc_hk") {
      return 1;
    }
    const leftMinAmount = left.min_amount ?? Number.POSITIVE_INFINITY;
    const rightMinAmount = right.min_amount ?? Number.POSITIVE_INFINITY;
    if (leftMinAmount !== rightMinAmount) {
      return leftMinAmount - rightMinAmount;
    }
    return left.bank_name_en.localeCompare(right.bank_name_en);
  });

  const uniqueByBank = new Map<string, RateItem>();
  rankedItems.forEach((item) => {
    if (!uniqueByBank.has(item.bank_code)) {
      uniqueByBank.set(item.bank_code, item);
    }
  });
  return Array.from(uniqueByBank.values());
}

function getBestBankRates(items: RateItem[]) {
  return getRankedUniqueBankRates(items).slice(0, 4);
}

function getBestRateSlots(items: RateItem[]) {
  const rankedItems = getRankedUniqueBankRates(items);
  const hsbcItem = rankedItems.find((item) => item.bank_code === "hsbc_hk") ?? null;
  const otherItems = rankedItems.filter((item) => item.bank_code !== "hsbc_hk").slice(0, 3);
  return [hsbcItem, ...otherItems, ...Array.from<null>({ length: Math.max(0, 3 - otherItems.length) }).fill(null)];
}

function getTenorRank(tenor: string) {
  const match = tenor.toLowerCase().match(/^(\d+)([dwm])$/);
  if (!match) {
    return Number.POSITIVE_INFINITY;
  }
  const amount = Number.parseInt(match[1], 10);
  const unit = match[2];
  const unitRank = unit === "d" ? 0 : unit === "w" ? 1 : 2;
  return unitRank * 1000 + amount;
}

function mixColor(startColor: number[], endColor: number[], ratio: number) {
  const channel = (index: number) => Math.round(startColor[index] + (endColor[index] - startColor[index]) * ratio);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

function getRateColor(value: number | null, min: number, benchmark: number, max: number) {
  if (value === null) {
    return "#f2f4f8";
  }
  if (max <= min) {
    return "#ffffff";
  }

  const lowColor = [119, 174, 226];
  const midColor = [255, 255, 255];
  const highColor = [239, 137, 137];

  if (value === benchmark) {
    return "#ffffff";
  }

  if (value < benchmark) {
    const ratio = benchmark <= min ? 1 : Math.max(0, Math.min(1, (value - min) / (benchmark - min)));
    return mixColor(lowColor, midColor, ratio);
  }

  const ratio = benchmark >= max ? 1 : Math.max(0, Math.min(1, (value - benchmark) / (max - benchmark)));
  return mixColor(midColor, highColor, ratio);
}

function getDisplayMedian(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  const sortedValues = [...values].sort((left, right) => left - right);
  return sortedValues[Math.floor(sortedValues.length / 2)];
}

type HeatmapValue = {
  interest_rate: number;
  min_amount: number | null;
  deposit_page_url: string;
  source_tenor: string;
  currency: string;
};

type HeatmapRow = {
  bank_code: string;
  bank_name_en: string;
  tenor: string;
  values: Map<string, HeatmapValue>;
};

type HeatmapScale = {
  minRate: number;
  benchmarkRate: number;
  maxRate: number;
};

function buildRateHistoryRows(
  snapshots: LatestRatesResponse[],
  selectedDimensions: string[],
  selectedCurrency: string | null,
  selectedTmdType: string,
  dimensionMode: DimensionMode,
) {
  const rowLookup = new Map<string, HeatmapRow>();
  const valuesByTenor = new Map<string, number[]>();
  const orderedSnapshots = [...snapshots].filter((snapshot) => snapshot.snapshot_date).sort((left, right) =>
    (left.snapshot_date ?? "").localeCompare(right.snapshot_date ?? ""),
  );
  const latestSnapshot = orderedSnapshots.length > 0 ? orderedSnapshots[orderedSnapshots.length - 1] : null;

  orderedSnapshots.forEach((snapshot) => {
    const snapshotDate = snapshot.snapshot_date;
    if (!snapshotDate) {
      return;
    }

    snapshot.items
      .filter((item) => {
        if (selectedCurrency && item.currency !== selectedCurrency) {
          return false;
        }
        if (item.tmd_type !== selectedTmdType) {
          return false;
        }
        return matchesTenorSelection(selectedDimensions, getItemDimensionLabel(item, dimensionMode));
      })
      .forEach((item) => {
        const displayDimension = getItemDimensionLabel(item, dimensionMode);
        const key = `${displayDimension}|${item.bank_code}`;
        if (!rowLookup.has(key)) {
          rowLookup.set(key, {
            bank_code: item.bank_code,
            bank_name_en: item.bank_name_en,
            tenor: displayDimension,
            values: new Map(),
          });
        }
        const row = rowLookup.get(key)!;
        const current = row.values.get(snapshotDate);
        if (current === undefined || item.interest_rate > current.interest_rate) {
          row.values.set(snapshotDate, {
            interest_rate: item.interest_rate,
            min_amount: item.min_amount,
            deposit_page_url: item.deposit_page_url,
            source_tenor: item.tenor,
            currency: item.currency,
          });
        }
      });
  });

  rowLookup.forEach((row) => {
    row.values.forEach((value) => {
      if (!valuesByTenor.has(row.tenor)) {
        valuesByTenor.set(row.tenor, []);
      }
      valuesByTenor.get(row.tenor)!.push(value.interest_rate);
    });
  });

  const rows = Array.from(rowLookup.values()).sort((left, right) => {
    const dimensionDiff = compareDimensions(left.tenor, right.tenor);
    if (dimensionDiff !== 0) {
      return dimensionDiff;
    }
    const bankDiff = getBankDisplayRank(left.bank_code) - getBankDisplayRank(right.bank_code);
    if (bankDiff !== 0) {
      return bankDiff;
    }
    return left.bank_name_en.localeCompare(right.bank_name_en);
  });

  const latestHsbcRatesByTenor = new Map<string, number>();
  (latestSnapshot?.items ?? [])
    .filter((item) => (!selectedCurrency || item.currency === selectedCurrency) && item.tmd_type === selectedTmdType && item.bank_code === "hsbc_hk")
    .forEach((item) => {
      const dimension = getItemDimensionLabel(item, dimensionMode);
      const current = latestHsbcRatesByTenor.get(dimension);
      if (current === undefined || item.interest_rate > current) {
        latestHsbcRatesByTenor.set(dimension, item.interest_rate);
      }
    });

  function getBenchmarkRate(tenor: string, values: number[]) {
    const exactRate = latestHsbcRatesByTenor.get(tenor);
    if (exactRate !== undefined) {
      return exactRate;
    }

    const tenorRank = getTenorRank(getDimensionTenor(tenor));
    const currency = getDimensionCurrency(tenor);
    const candidates = Array.from(latestHsbcRatesByTenor.entries())
      .filter(([hsbcTenor]) => !currency || getDimensionCurrency(hsbcTenor) === currency)
      .map(([hsbcTenor, rate]) => ({
        rate,
        distance: Math.abs(getTenorRank(getDimensionTenor(hsbcTenor)) - tenorRank),
      }))
      .filter((entry) => Number.isFinite(entry.distance));
    const fallbackCandidates = Array.from(latestHsbcRatesByTenor.entries())
      .map(([hsbcTenor, rate]) => ({
        rate,
        distance: Math.abs(getTenorRank(getDimensionTenor(hsbcTenor)) - tenorRank),
      }))
      .filter((entry) => Number.isFinite(entry.distance));
    const nearestHsbcRate = (candidates.length > 0 ? candidates : fallbackCandidates)
      .sort((left, right) => left.distance - right.distance)[0]?.rate;

    return nearestHsbcRate ?? getDisplayMedian(values);
  }

  const scalesByTenor = new Map<string, HeatmapScale>();
  valuesByTenor.forEach((values, tenor) => {
    const benchmarkRate = getBenchmarkRate(tenor, values);
    scalesByTenor.set(tenor, {
      minRate: Math.min(...values, benchmarkRate),
      benchmarkRate,
      maxRate: Math.max(...values, benchmarkRate),
    });
  });

  return {
    rows,
    scalesByTenor,
  };
}

type TrendPoint = {
  date: string;
  value: number | null;
  leader_bank_codes: string[];
  leader_bank_names: string[];
};

type TrendSeries = {
  tenor: string;
  points: TrendPoint[];
  legendLabel?: string;
  tooltipLabel?: string;
  sourceLabel?: string;
  color?: string;
};

type TrendAnnotationReason = "max" | "min" | "latest-max" | "latest-min";

type TrendAnnotation = {
  point: TrendPoint;
  pointIndex: number;
  seriesIndex: number;
  reasons: TrendAnnotationReason[];
};

type LeaderBank = {
  bank_code: string;
  bank_name_en: string;
};

function pickLeadingBanks(items: RateItem[]) {
  const bankMaxRates = new Map<string, { bank_name_en: string; interest_rate: number }>();

  items.forEach((item) => {
    const current = bankMaxRates.get(item.bank_code);
    if (!current || item.interest_rate > current.interest_rate) {
      bankMaxRates.set(item.bank_code, {
        bank_name_en: item.bank_name_en,
        interest_rate: item.interest_rate,
      });
    }
  });

  const entries = Array.from(bankMaxRates.entries()).map(([bankCode, value]) => ({
    bank_code: bankCode,
    bank_name_en: value.bank_name_en,
    interest_rate: value.interest_rate,
  }));

  if (entries.length === 0) {
    return {
      value: null as number | null,
      leaders: [] as LeaderBank[],
    };
  }

  const maxRate = Math.max(...entries.map((entry) => entry.interest_rate));
  const leaders = entries
    .filter((entry) => entry.interest_rate === maxRate)
    .sort((left, right) => {
      if (left.bank_code === "hsbc_hk" && right.bank_code !== "hsbc_hk") {
        return -1;
      }
      if (right.bank_code === "hsbc_hk" && left.bank_code !== "hsbc_hk") {
        return 1;
      }
      const bankDiff = getBankDisplayRank(left.bank_code) - getBankDisplayRank(right.bank_code);
      if (bankDiff !== 0) {
        return bankDiff;
      }
      return left.bank_name_en.localeCompare(right.bank_name_en);
    })
    .map(({ bank_code, bank_name_en }) => ({ bank_code, bank_name_en }));

  return {
    value: maxRate,
    leaders,
  };
}

function buildRateTrendSeries(snapshots: LatestRatesResponse[], tmdType: string, dimensions: string[], currency: string | null, dimensionMode: DimensionMode): TrendSeries[] {
  return dimensions.map((dimension) => ({
    tenor: dimension,
    points: snapshots.map((snapshot) => {
      const leader = pickLeadingBanks(
        snapshot.items.filter((item) => {
          if (currency && item.currency !== currency) {
            return false;
          }
          if (item.tmd_type !== tmdType) {
            return false;
          }
          return dimension === "best" ? true : getItemDimensionLabel(item, dimensionMode) === dimension;
        }),
      );
      return {
        date: snapshot.snapshot_date ?? "",
        value: leader.value,
        leader_bank_codes: leader.leaders.map((bank) => bank.bank_code),
        leader_bank_names: leader.leaders.map((bank) => bank.bank_name_en),
      };
    }),
  }));
}

function buildOvernightBidRateSeries(snapshots: LatestRatesResponse[], bidRates: BidRateHkdPoint[]): TrendSeries[] {
  const bidRatesByDate = new Map(bidRates.map((point) => [point.rate_date, point.bid_rate]));
  const points = snapshots.map((snapshot) => {
    const snapshotDate = snapshot.snapshot_date ?? "";
    return {
      date: snapshotDate,
      value: bidRatesByDate.get(snapshotDate) ?? null,
      leader_bank_codes: [],
      leader_bank_names: [],
    };
  });

  if (!points.some((point) => point.value !== null)) {
    return [];
  }

  return [
    {
      tenor: overnightBidRateSeriesKey,
      legendLabel: "Overnight Bid Rate",
      tooltipLabel: "Overnight Bid Rate",
      sourceLabel: "HKAB HKD HIBOR",
      color: "#c0c0c0",
      points,
    },
  ];
}

function getTrendSeriesLabel(line: TrendSeries) {
  if (line.legendLabel) {
    return line.legendLabel;
  }
  return line.tenor === "best" ? "All Tenor" : line.tenor;
}

function getRateTrendAnnotationsBySeries(series: TrendSeries[], latestIndex: number) {
  const validPoints = series.flatMap((line, seriesIndex) =>
    line.points.map((point, pointIndex) => ({
      point,
      pointIndex,
      seriesIndex,
    })),
  ).filter((entry): entry is { point: TrendPoint & { value: number }; pointIndex: number; seriesIndex: number } => entry.point.value !== null);
  const annotations = new Map<string, TrendAnnotation>();

  function annotationKey(entry: { pointIndex: number; seriesIndex: number }) {
    return `${entry.seriesIndex}:${entry.pointIndex}`;
  }

  function addAnnotation(entry: { point: TrendPoint; pointIndex: number; seriesIndex: number } | undefined, reason: TrendAnnotationReason) {
    if (!entry) {
      return;
    }
    const key = annotationKey(entry);
    const current = annotations.get(key);
    if (current) {
      if (!current.reasons.includes(reason)) {
        current.reasons.push(reason);
      }
      return;
    }
    annotations.set(key, {
      point: entry.point,
      pointIndex: entry.pointIndex,
      seriesIndex: entry.seriesIndex,
      reasons: [reason],
    });
  }

  function latestEntryForValue(value: number) {
    return validPoints
      .filter((entry) => entry.point.value === value)
      .sort((left, right) => right.pointIndex - left.pointIndex || left.seriesIndex - right.seriesIndex)[0];
  }

  if (validPoints.length > 0) {
    const values = validPoints.map((entry) => entry.point.value);
    addAnnotation(latestEntryForValue(Math.max(...values)), "max");
    addAnnotation(latestEntryForValue(Math.min(...values)), "min");

    const latestPoints = validPoints.filter((entry) => entry.pointIndex === latestIndex);
    if (latestPoints.length > 0) {
      const latestValues = latestPoints.map((entry) => entry.point.value);
      const latestMax = Math.max(...latestValues);
      const latestMin = Math.min(...latestValues);
      addAnnotation(latestPoints.filter((entry) => entry.point.value === latestMax).sort((left, right) => left.seriesIndex - right.seriesIndex)[0], "latest-max");
      addAnnotation(latestPoints.filter((entry) => entry.point.value === latestMin).sort((left, right) => left.seriesIndex - right.seriesIndex)[0], "latest-min");
    }
  }

  return Array.from(annotations.values()).reduce((groups, annotation) => {
    const group = groups.get(annotation.seriesIndex) ?? [];
    group.push(annotation);
    groups.set(annotation.seriesIndex, group);
    return groups;
  }, new Map<number, TrendAnnotation[]>());
}

function RateTrendChart({
  snapshots,
  tmdType,
  dimensions,
  title,
  currency,
  dimensionMode = "tenor",
  variant = "detail",
  supplementalSeries = [],
}: {
  snapshots: LatestRatesResponse[];
  tmdType: string;
  dimensions: string[];
  title: string;
  currency: string | null;
  dimensionMode?: DimensionMode;
  variant?: "overview" | "detail";
  supplementalSeries?: TrendSeries[];
}) {
  const marketSeries = buildRateTrendSeries(snapshots, tmdType, dimensions, currency, dimensionMode);
  const series = [...marketSeries, ...supplementalSeries];
  const includedBanks = useMemo(() => {
    const banks = new Map<string, string>();
    snapshots.forEach((snapshot) => {
      snapshot.items
        .filter((item) => {
          if (currency && item.currency !== currency) {
            return false;
          }
          if (item.tmd_type !== tmdType) {
            return false;
          }
          return dimensions.some((dimension) => dimension === "best" || getItemDimensionLabel(item, dimensionMode) === dimension);
        })
        .forEach((item) => {
          banks.set(item.bank_code, item.bank_name_en);
        });
    });
    return sortByFixedBankOrder(
      Array.from(banks.entries()).map(([bankCode, bankName]) => ({
        bank_code: bankCode,
        bank_name_en: bankName,
      })),
    ).map((bank) => getBankLabel(bank.bank_name_en));
	  }, [currency, dimensionMode, dimensions, snapshots, tmdType]);
	  const svgRef = useRef<SVGSVGElement | null>(null);
	  const markerIdBase = useId().replace(/:/g, "");
	  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; date: string; tenor: string; value: number | null; leaders: string[]; sourceLabel?: string } | null>(null);
	  const chartWidth = variant === "overview" ? 700 : 720;
	  const chartHeight = variant === "overview" ? 270 : 230;
  const padding = variant === "overview" ? { top: 72, right: 32, bottom: 74, left: 66 } : { top: 68, right: 34, bottom: 72, left: 62 };
  const values = series.flatMap((line) => line.points.map((point) => point.value).filter((value): value is number => value !== null));

  if (snapshots.length === 0 || values.length === 0) {
    return <div className="panel-note chart-empty">No historical data available for the trend chart.</div>;
  }

  const rawMinRate = Math.min(...values);
  const rawMaxRate = Math.max(...values);
  const ratePadding = Math.max(0.05, (rawMaxRate - rawMinRate) * 0.08);
  const minRate = Math.max(0, Math.floor((rawMinRate - ratePadding) * 10) / 10);
  const maxRate = Math.ceil((rawMaxRate + ratePadding) * 10) / 10;
  const plotWidth = chartWidth - padding.left - padding.right;
	  const plotHeight = chartHeight - padding.top - padding.bottom;
	  const xForIndex = (index: number) => padding.left + (snapshots.length <= 1 ? plotWidth / 2 : (index / (snapshots.length - 1)) * plotWidth);
	  const yForValue = (value: number) => padding.top + ((maxRate - value) / Math.max(maxRate - minRate, 0.01)) * plotHeight;
	  const bottomTick = minRate;
	  const latestSnapshotIndex = snapshots.length - 1;
	  const visibleXIndexes = new Set(
    variant === "overview"
      ? snapshots.length <= 4
        ? snapshots.map((_, index) => index)
        : Array.from(new Set([0, ...Array.from({ length: 4 }, (_, index) => Math.round(((index + 1) * (snapshots.length - 1)) / 5)), snapshots.length - 1]))
      : snapshots.length <= 6
      ? snapshots.map((_, index) => index)
      : Array.from(new Set([0, ...Array.from({ length: 4 }, (_, index) => Math.round(((index + 1) * (snapshots.length - 1)) / 5)), snapshots.length - 1])),
  );
  const colorPalette = ["#d63c3c", "#2e7d57", "#2e6fd8", "#c79535", "#8b5fbf", "#008c95", "#b45b3e", "#596579", "#b04f84", "#668b34"];
	  const getSeriesColor = (line: TrendSeries, index: number) => {
      if (line.color) {
        return line.color;
      }
      const dimension = line.tenor;
	    if (dimension === "best") {
	      return colorPalette[0];
	    }
	    return colorPalette[index % colorPalette.length];
	  };
	  const trendAnnotationsBySeries = getRateTrendAnnotationsBySeries(series, latestSnapshotIndex);
	  const annotationArrowLength = variant === "overview" ? 23 : 28;
	  const annotationPointGap = 10;
	  const annotationLabelGap = 4;

	  return (
	    <div className={`rate-trend-card rate-trend-card-${variant}`}>
      <div className="chart-title-row">
        <div className="chart-legend">
          {series.map((line, index) => (
            <span key={line.tenor}>
              <i style={{ background: getSeriesColor(line, index) }} />
              {getTrendSeriesLabel(line)}
            </span>
          ))}
        </div>
	      </div>
	      <svg ref={svgRef} className="rate-trend-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={`${currency} ${title}`}>
	        <defs>
	          {series.map((line, lineIndex) => {
	            const lineColor = getSeriesColor(line, lineIndex);
	            return (
	              <marker key={`${line.tenor}-marker`} id={`${markerIdBase}-arrow-${lineIndex}`} markerWidth="5" markerHeight="5" refX="4.2" refY="2.5" orient="auto" markerUnits="strokeWidth">
	                <path d="M0,0 L5,2.5 L0,5 Z" fill={lineColor} />
	              </marker>
	            );
	          })}
	        </defs>
	        <g>
	          <line x1={padding.left} x2={chartWidth - padding.right} y1={yForValue(bottomTick)} y2={yForValue(bottomTick)} className="chart-grid-line" />
	          <text x={padding.left - 14} y={yForValue(bottomTick) + 4} textAnchor="end" className="chart-axis-label">
	            {formatRateAxisPercent(bottomTick)}
	          </text>
	        </g>
        {snapshots.map((snapshot, index) =>
          visibleXIndexes.has(index) ? (
            <text key={snapshot.snapshot_date ?? index} x={xForIndex(index)} y={chartHeight - 3} textAnchor="middle" className="chart-axis-label">
              {(snapshot.snapshot_date ?? "").slice(5)}
            </text>
          ) : null,
        )}
	          {series.map((line, lineIndex) => {
	            const lineColor = getSeriesColor(line, lineIndex);
	            const annotations = trendAnnotationsBySeries.get(lineIndex) ?? [];
	            let startedPath = false;
	            const path = line.points
            .map((point, index) => {
              if (point.value === null) {
                return "";
              }
              const command = startedPath ? "L" : "M";
              startedPath = true;
              return `${command} ${xForIndex(index)} ${yForValue(point.value)}`;
            })
            .filter(Boolean)
            .join(" ");
            return (
              <g key={line.tenor}>
                <path d={path} fill="none" stroke={lineColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                {line.points.map((point, index) => {
                  if (point.value === null) {
                    return null;
                  }
                  const pointX = xForIndex(index);
                  const pointY = yForValue(point.value);
                  return (
                    <g key={`${line.tenor}-${point.date}`}>
                      <circle
                        cx={pointX}
                        cy={pointY}
                        r="8"
                        fill="transparent"
                        stroke="none"
                        pointerEvents="all"
                        onMouseEnter={(event) => {
                          const rect = svgRef.current?.getBoundingClientRect();
                          if (!rect) {
                            return;
                          }
                          setHoveredPoint({
                            x: event.clientX - rect.left + 12,
                            y: event.clientY - rect.top + 12,
                            date: point.date,
                            tenor: line.tooltipLabel ?? getTrendSeriesLabel(line),
                            value: point.value,
                            leaders: point.leader_bank_names.map(getBankLabel),
                            sourceLabel: line.sourceLabel,
                          });
                        }}
                        onMouseMove={(event) => {
                          const rect = svgRef.current?.getBoundingClientRect();
                          if (!rect) {
                            return;
                          }
                          setHoveredPoint((current) =>
                            current
                              ? {
                                  ...current,
                                  x: event.clientX - rect.left + 12,
                                  y: event.clientY - rect.top + 12,
                                }
                              : current,
                          );
                        }}
                        onMouseLeave={() => setHoveredPoint(null)}
                      />
	                    </g>
	                  );
	                })}
	                {annotations.map((annotation) => {
	                  if (annotation.point.value === null) {
	                    return null;
	                  }
                    const pointX = xForIndex(annotation.pointIndex);
                    const pointY = yForValue(annotation.point.value);
                    const hasMaxReason = annotation.reasons.includes("max") || annotation.reasons.includes("latest-max");
                    const hasMinReason = annotation.reasons.includes("min") || annotation.reasons.includes("latest-min");
                    const verticalDirection = hasMinReason && !hasMaxReason ? 1 : -1;
                    const labelX = pointX;
                    const arrowStartX = pointX;
                    const arrowEndX = pointX;
                    const arrowStartY = pointY + verticalDirection * (annotationPointGap + annotationArrowLength);
                    const arrowEndY = pointY + verticalDirection * annotationPointGap;
                    const labelY = arrowStartY + verticalDirection * annotationLabelGap;
                    const labelBaseline = verticalDirection < 0 ? "text-after-edge" : "text-before-edge";
		                  return (
	                    <g key={`${line.tenor}-${annotation.point.date || annotation.pointIndex}-annotation`} className="chart-rate-callout">
	                      <line
	                        x1={arrowStartX}
	                        y1={arrowStartY}
	                        x2={arrowEndX}
	                        y2={arrowEndY}
	                        stroke={lineColor}
	                        strokeWidth="1.2"
	                        markerEnd={`url(#${markerIdBase}-arrow-${lineIndex})`}
	                      />
		                      <text x={labelX} y={labelY} textAnchor="middle" dominantBaseline={labelBaseline} fill={lineColor}>
	                        {formatRateCalloutPercent(annotation.point.value)}
	                      </text>
	                    </g>
	                  );
	                })}
	              </g>
	            );
	          })}
      </svg>
      {hoveredPoint ? (
        <div className="chart-tooltip" style={{ left: hoveredPoint.x, top: hoveredPoint.y }}>
          <strong>{hoveredPoint.date}</strong>
          <span>Tenor: {hoveredPoint.tenor}</span>
          <span>{formatPercent(hoveredPoint.value)}</span>
          {hoveredPoint.sourceLabel ? <span>Source: {hoveredPoint.sourceLabel}</span> : <span>Leading banks: {hoveredPoint.leaders.join(", ") || "-"}</span>}
        </div>
      ) : null}
      <p className="chart-market-note">Market includes: {includedBanks.join(", ") || "-"}</p>
    </div>
  );
}

function groupHeatmapRows(rows: HeatmapRow[]) {
  const groupedRows = new Map<string, HeatmapRow[]>();
  rows.forEach((row) => {
    if (!groupedRows.has(row.tenor)) {
      groupedRows.set(row.tenor, []);
    }
    groupedRows.get(row.tenor)!.push(row);
  });
  groupedRows.forEach((tenorRows, tenor) => {
    groupedRows.set(tenor, sortByFixedBankOrder(tenorRows));
  });
  return Array.from(groupedRows.entries()).sort((left, right) => compareDimensions(left[0], right[0]));
}

function getHeatmapRowUrl(row: HeatmapRow, fallbackUrls?: Map<string, string>) {
  const values = Array.from(row.values.entries()).sort((left, right) => right[0].localeCompare(left[0]));
  const directUrl = values.find(([, value]) => value.deposit_page_url)?.[1].deposit_page_url ?? "";
  if (directUrl) {
    return normalizeExternalUrl(directUrl);
  }
  return normalizeExternalUrl(fallbackUrls?.get(`${row.tenor}|${row.bank_code}`) ?? fallbackUrls?.get(`*|${row.bank_code}`) ?? "");
}

function normalizeExternalUrl(url: string) {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    return "";
  }
  if (/^https?:\/\//i.test(trimmedUrl)) {
    return trimmedUrl;
  }
  return `https://${trimmedUrl}`;
}

function parseAiSummary(content: string, dimensions: AiSummaryDimension[]) {
  const lines = content.split("\n").filter((line) => line.trim());

  const last7DaysTrend: string[] = [];
  const last7DaysTrendByDimension = new Map<string, Record<AiSummaryTrendSource, string[]>>(
    dimensions.map((dimension) => [dimension.key, { hsbc: [], market: [] }]),
  );
  const keyMovesByDimension = new Map<string, string[]>(
    dimensions.map((dimension) => [dimension.key, []]),
  );
  let currentSection: "last7DaysTrend" | "keyMoves" | null = null;
  let currentLast7DaysTrendDimension: string | null = null;
  let currentKeyMovesDimension: string | null = null;
  let isReadingLast7DaysTrendTable = false;
  let isReadingKeyMovesTable = false;

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    const normalized = line.toLowerCase();
    if (normalized.includes("last 7") && normalized.includes("trend")) {
      currentSection = "last7DaysTrend";
      currentLast7DaysTrendDimension = null;
      currentKeyMovesDimension = null;
      isReadingLast7DaysTrendTable = false;
      isReadingKeyMovesTable = false;
      return;
    }
    if (normalized.includes("key moves")) {
      currentSection = "keyMoves";
      currentLast7DaysTrendDimension = null;
      currentKeyMovesDimension = null;
      isReadingLast7DaysTrendTable = false;
      isReadingKeyMovesTable = false;
      return;
    }
    if (currentSection === "last7DaysTrend" && isAiSummaryDimensionTableHeader(line, dimensions)) {
      isReadingLast7DaysTrendTable = true;
      currentLast7DaysTrendDimension = null;
      return;
    }
    if (currentSection === "last7DaysTrend" && isReadingLast7DaysTrendTable) {
      if (!line.startsWith("|")) {
        isReadingLast7DaysTrendTable = false;
      } else {
        parseAiSummaryTrendTableRow(line, last7DaysTrendByDimension, dimensions);
        return;
      }
    }
    if (currentSection === "keyMoves" && isAiSummaryDimensionTableHeader(line, dimensions)) {
      isReadingKeyMovesTable = true;
      currentKeyMovesDimension = null;
      return;
    }
    if (currentSection === "keyMoves" && isReadingKeyMovesTable) {
      if (!line.startsWith("|")) {
        isReadingKeyMovesTable = false;
      } else {
        parseAiSummaryKeyMovesTableRow(line, keyMovesByDimension, dimensions);
        return;
      }
    }
    const bullet = cleanAiSummaryLine(line);
    if (!bullet) {
      return;
    }
    if (currentSection === "last7DaysTrend") {
      last7DaysTrend.push(bullet);
      currentLast7DaysTrendDimension = addAiSummaryTrendLine(bullet, last7DaysTrendByDimension, currentLast7DaysTrendDimension, dimensions);
      return;
    }
    if (currentSection === "keyMoves") {
      const keyMovesDimension = getAiSummaryDimension(bullet, dimensions);
      if (keyMovesDimension && isAiSummaryDimensionHeading(bullet, keyMovesDimension, dimensions)) {
        currentKeyMovesDimension = keyMovesDimension;
        return;
      }
      const explicitDimension = keyMovesDimension ?? currentKeyMovesDimension;
      if (explicitDimension) {
        const movement = cleanAiSummaryKeyMoveLine(stripAiSummaryDimensionPrefix(bullet, explicitDimension, dimensions));
        if (movement) {
          keyMovesByDimension.get(explicitDimension)?.push(movement);
        }
      }
    }
  });

  return {
    last7DaysTrend,
    last7DaysTrendByDimension: dimensions.map((dimension) => ({
      ...dimension,
      hsbcLines: last7DaysTrendByDimension.get(dimension.key)?.hsbc ?? [],
      marketLines: last7DaysTrendByDimension.get(dimension.key)?.market ?? [],
    })),
    keyMovesByDimension: dimensions.map((dimension) => ({
      ...dimension,
      lines: keyMovesByDimension.get(dimension.key) ?? [],
    })),
  };
}

function addAiSummaryTrendLine(
  line: string,
  trendByDimension: Map<string, Record<AiSummaryTrendSource, string[]>>,
  currentDimension: string | null,
  dimensions: AiSummaryDimension[],
) {
  const explicitDimension = getAiSummaryDimension(line, dimensions);
  if (explicitDimension && isAiSummaryDimensionHeading(line, explicitDimension, dimensions)) {
    return explicitDimension;
  }

  const dimension = explicitDimension ?? currentDimension;
  if (!dimension) {
    return currentDimension;
  }

  splitAiSummaryTrendLine(line).forEach((segment) => {
    const cleanedLine = cleanAiSummaryTrendLine(segment.line, dimension, segment.source, dimensions);
    if (cleanedLine) {
      trendByDimension.get(dimension)?.[segment.source].push(cleanedLine);
    }
  });
  return dimension;
}

function splitAiSummaryTrendLine(line: string): Array<{ source: AiSummaryTrendSource; line: string }> {
  const hsbcIndex = line.search(/\bhsbc\b/i);
  const marketIndex = line.search(/\bmarket\b/i);
  if (hsbcIndex >= 0 && marketIndex > hsbcIndex) {
    const segments: Array<{ source: AiSummaryTrendSource; line: string }> = [
      { source: "hsbc", line: line.slice(0, marketIndex).replace(/[;\s]+$/, "") },
      { source: "market", line: line.slice(marketIndex).replace(/^[;\s]+/, "") },
    ];
    return segments.filter((segment) => segment.line.trim());
  }

  const source = getAiSummaryTrendSource(line);
  return source ? [{ source, line }] : [];
}

function getAiSummaryTrendSource(line: string): AiSummaryTrendSource | null {
  const hsbcIndex = line.search(/\bhsbc\b/i);
  const marketIndex = line.search(/\bmarket\b/i);
  if (hsbcIndex >= 0 && (marketIndex < 0 || hsbcIndex <= marketIndex)) {
    return "hsbc";
  }
  if (marketIndex >= 0) {
    return "market";
  }
  return null;
}

function cleanAiSummaryTrendLine(line: string, dimensionKey: string, source: AiSummaryTrendSource, dimensions: AiSummaryDimension[]) {
  const dimensionLabel = dimensions.find((item) => item.key === dimensionKey)?.label ?? dimensionKey;
  const sourceLabel = source === "hsbc" ? "HSBC" : "Market";
  return stripAiSummaryDimensionPrefix(cleanAiSummaryLine(line), dimensionKey, dimensions)
    .replace(new RegExp(`^${escapeRegExp(dimensionLabel)}\\s*[:|-]\\s*`, "i"), "")
    .replace(new RegExp(`^${sourceLabel}\\s*(?:trend)?\\s*[:|-]\\s*`, "i"), "")
    .replace(/;+\s*$/, "")
    .trim();
}

function formatAiSummaryTrendDisplayLine(line: string, source: AiSummaryTrendSource) {
  const sourceLabel = source === "hsbc" ? "HSBC" : "Market";
  const fallbackLine = line || "-";
  return new RegExp(`\\b${escapeRegExp(sourceLabel)}\\b`, "i").test(fallbackLine) ? fallbackLine : `${sourceLabel} ${fallbackLine}`;
}

function getAiSummaryDimension(line: string, dimensions: AiSummaryDimension[]) {
  const normalized = line
    .replace(/:+$/, "")
    .trim()
    .toLowerCase();
  for (const dimension of dimensions) {
    if (dimension.aliases.some((alias) => normalized === alias.toLowerCase())) {
      return dimension.key;
    }
  }

  for (const dimension of dimensions) {
    const aliases = [...dimension.aliases, dimension.label, dimension.key].sort((left, right) => right.length - left.length);
    if (aliases.some((alias) => new RegExp(`^${escapeRegExp(alias)}\\b\\s*(?::|-)?`, "i").test(line.trim()))) {
      return dimension.key;
    }
  }
  return null;
}

function isAiSummaryDimensionHeading(line: string, dimensionKey: string, dimensions: AiSummaryDimension[]) {
  const dimension = dimensions.find((item) => item.key === dimensionKey);
  if (!dimension) {
    return false;
  }
  const normalized = cleanAiSummaryLine(line)
    .replace(/:+$/, "")
    .trim()
    .toLowerCase();
  return [...dimension.aliases, dimension.label, dimension.key].some((alias) => normalized === alias.toLowerCase());
}

function stripAiSummaryDimensionPrefix(line: string, dimensionKey: string, dimensions: AiSummaryDimension[]) {
  const dimension = dimensions.find((item) => item.key === dimensionKey);
  if (!dimension) {
    return line;
  }
  return [...dimension.aliases, dimension.label, dimension.key]
    .sort((left, right) => right.length - left.length)
    .reduce((currentLine, alias) => currentLine.replace(new RegExp(`^${escapeRegExp(alias)}\\b\\s*[:|-]\\s*`, "i"), ""), line)
    .trim();
}

function isAiSummaryDimensionTableHeader(line: string, dimensions: AiSummaryDimension[]) {
  const cells = getAiSummaryTableCells(line).map((cell) => cell.toLowerCase());
  if (cells.length < dimensions.length) {
    return false;
  }
  const hasDimensionCells = (startIndex: number) =>
    dimensions.every((dimension, index) => {
      const cell = cells[startIndex + index] ?? "";
      return [...dimension.aliases, dimension.label, dimension.key].some((alias) => cell.includes(alias.toLowerCase()));
    });
  return hasDimensionCells(0) || hasDimensionCells(1);
}

function parseAiSummaryKeyMovesTableRow(line: string, keyMovesByDimension: Map<string, string[]>, dimensions: AiSummaryDimension[]) {
  const cells = getAiSummaryTableCells(line);
  if (cells.length < dimensions.length || cells.every((cell) => /^:?-{3,}:?$/.test(cell))) {
    return;
  }
  const cellOffset = cells.length > dimensions.length ? 1 : 0;
  dimensions.forEach((dimension, index) => {
    const movement = cleanAiSummaryKeyMoveLine(cells[index + cellOffset] ?? "");
    if (movement) {
      keyMovesByDimension.get(dimension.key)?.push(movement);
    }
  });
}

function parseAiSummaryTrendTableRow(line: string, trendByDimension: Map<string, Record<AiSummaryTrendSource, string[]>>, dimensions: AiSummaryDimension[]) {
  const cells = getAiSummaryTableCells(line);
  if (cells.length < dimensions.length || cells.every((cell) => /^:?-{3,}:?$/.test(cell))) {
    return;
  }

  const source = getAiSummaryTrendSource(cells[0]) ?? getAiSummaryTrendSource(line);
  if (!source) {
    return;
  }

  const trendCells = cells.length > dimensions.length ? cells.slice(1, dimensions.length + 1) : cells.slice(0, dimensions.length);
  dimensions.forEach((dimension, index) => {
    const trendLine = cleanAiSummaryTrendLine(trendCells[index] ?? "", dimension.key, source, dimensions);
    if (trendLine) {
      trendByDimension.get(dimension.key)?.[source].push(trendLine);
    }
  });
}

function getAiSummaryTableCells(line: string) {
  const trimmedLine = line.trim();
  if (!trimmedLine.startsWith("|")) {
    return [];
  }
  return trimmedLine
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cleanAiSummaryLine(cell));
}

function cleanAiSummaryLine(line: string) {
  return line
    .replace(/^#{1,6}\s*/, "")
    .replace(/^(?:[*-]|\d+\.)\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .trim();
}

function cleanAiSummaryKeyMoveLine(line: string) {
  return cleanAiSummaryLine(line).replace(/;+\s*$/, "");
}

function isNoBankChangesLine(line: string) {
  return /^no bank changes\.?$/i.test(line.trim());
}

function renderAiSummaryLine(line: string, options: { emphasizeMarket?: boolean } = {}): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  const pattern = options.emphasizeMarket ? new RegExp(`${aiSummaryHighlightPattern.source}|(\\bmarket\\b)`, "gi") : aiSummaryHighlightPattern;

  Array.from(line.matchAll(pattern)).forEach((match, index) => {
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      nodes.push(line.slice(lastIndex, matchIndex));
    }

    const [matchedText, bankName, bpChange, toPrefix, targetRate, marketWord] = match;
    if (bankName) {
      nodes.push(
        <strong key={`bank-${index}`} className="ai-summary-bank">
          {matchedText}
        </strong>,
      );
    } else if (bpChange) {
      nodes.push(
        <strong key={`bp-${index}`} className={`ai-summary-bp-change ${bpChange.trim().startsWith("+") ? "is-positive" : "is-negative"}`}>
          {matchedText}
        </strong>,
      );
    } else if (marketWord) {
      nodes.push(
        <strong key={`market-${index}`} className="ai-summary-market">
          {matchedText}
        </strong>,
      );
    } else if (toPrefix && targetRate) {
      nodes.push(toPrefix);
      nodes.push(
        <strong key={`target-${index}`} className="ai-summary-target-rate">
          {targetRate}
        </strong>,
      );
    }

    lastIndex = matchIndex + matchedText.length;
  });

  if (lastIndex < line.length) {
    nodes.push(line.slice(lastIndex));
  }

  return nodes;
}

function getHeatmapChangeDirection(currentRate: number | null, previousRate: number | null) {
  if (currentRate === null || previousRate === null) {
    return "";
  }
  if (currentRate > previousRate) {
    return "is-up-change";
  }
  if (currentRate < previousRate) {
    return "is-down-change";
  }
  return "";
}

function RateHeatmap({
  dates,
  snapshots,
  selectedDimensions,
  selectedCurrency,
  selectedTmdType,
  dimensionMode,
  title,
  fallbackUrls,
}: {
  dates: string[];
  snapshots: LatestRatesResponse[];
  selectedDimensions: string[];
  selectedCurrency: string | null;
  selectedTmdType: HeatmapView;
  dimensionMode: DimensionMode;
  title: string;
  fallbackUrls: Map<string, string>;
  onSelectedTenorsChange: (tenors: string[]) => void;
  onSelectedTmdTypeChange: (tmdType: HeatmapView) => void;
  availableTypes: HeatmapView[];
  tenorTabs: Array<{ label: string; tenor: string }>;
}) {
  const heatmapScrollRef = useRef<HTMLDivElement | null>(null);
  const [heatmapDayColumnWidth, setHeatmapDayColumnWidth] = useState(44);
  const [heatmapTooltip, setHeatmapTooltip] = useState<{
    x: number;
    y: number;
    rate: number | null;
    bankName: string;
    tenor: string;
    type: HeatmapView;
    currency: string;
    minAmount: number | null;
    date: string;
  } | null>(null);
  const { rows, scalesByTenor } = buildRateHistoryRows(snapshots, selectedDimensions, selectedCurrency, selectedTmdType, dimensionMode);
  const groupedRows = groupHeatmapRows(rows);
  const selectedDimensionKey = selectedDimensions.join("|");
  const latestDateIndex = dates.length - 1;
  const visibleDateIndexes = new Set(dates.map((_, index) => index).filter((index) => (latestDateIndex - index) % 2 === 0));
  const weeklyDateIndexes = new Set(dates.map((_, index) => index).filter((index) => (latestDateIndex - index) % 7 === 0));

  useEffect(() => {
    const element = heatmapScrollRef.current;
    if (!element) {
      return;
    }

    const updateColumnWidth = () => {
      setHeatmapDayColumnWidth(Math.max(30, Math.floor((element.clientWidth - heatmapBankColumnWidth) / heatmapVisibleDateColumnCount)));
    };

    updateColumnWidth();
    if (!("ResizeObserver" in window)) {
      return;
    }

    const resizeObserver = new ResizeObserver(updateColumnWidth);
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, [heatmapBankColumnWidth, heatmapVisibleDateColumnCount]);

  useEffect(() => {
    const element = heatmapScrollRef.current;
    if (!element) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      element.scrollLeft = element.scrollWidth - element.clientWidth;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [dates.length, dimensionMode, heatmapDayColumnWidth, rows.length, selectedCurrency, selectedDimensionKey, selectedTmdType]);

  function getTooltipPosition(event: ReactMouseEvent<HTMLDivElement>) {
    const tooltipWidth = 300;
    const tooltipHeight = 220;
    const margin = 10;
    return {
      x: Math.min(Math.max(event.clientX + 14, margin), window.innerWidth - tooltipWidth - margin),
      y: Math.min(Math.max(event.clientY + 14, margin), window.innerHeight - tooltipHeight - margin),
    };
  }

  return (
    <section className="heatmap-band">
      <div className="section-head compact">
        <div>
          <h2>{title}</h2>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="panel-note">No historical rows available for heatmap.</div>
      ) : (
        <div className="heatmap-scroll" ref={heatmapScrollRef}>
          <div className="heatmap-grid" style={{ gridTemplateColumns: `${heatmapBankColumnWidth}px repeat(${dates.length}, ${heatmapDayColumnWidth}px)` }}>
            <div className="heatmap-corner heatmap-corner-bank" aria-hidden="true" />
            {dates.map((date, index) => (
              <div key={date} className={`heatmap-date ${weeklyDateIndexes.has(index) ? "is-week-marker" : ""}`}>
                {visibleDateIndexes.has(index) ? date.slice(5) : ""}
              </div>
            ))}
            {groupedRows.map(([tenor, tenorRows]) =>
              [
                <div key={`${tenor}-label`} className="heatmap-tenor-strip" style={{ gridColumn: `1 / span ${dates.length + 1}` }}>
                  <span className="heatmap-tenor-label" style={{ width: heatmapBankColumnWidth }}>
                    {tenor}
                  </span>
                </div>,
                ...tenorRows.map((row) => (
                <div className="heatmap-row" key={`${row.tenor}-${row.bank_code}`} style={{ display: "contents" }}>
                  <div className="heatmap-label">
                    {getHeatmapRowUrl(row, fallbackUrls) ? (
                      <a href={getHeatmapRowUrl(row, fallbackUrls)} target="_blank" rel="noreferrer">
                        {getBankLabel(row.bank_name_en)}
                      </a>
                    ) : (
                      <span>{getBankLabel(row.bank_name_en)}</span>
                    )}
                  </div>
                  {dates.map((date, currentIndex) => {
                    const value = row.values.get(date) ?? null;
                    const previousDate = currentIndex > 0 ? dates[currentIndex - 1] : null;
                    const previousValue = previousDate ? row.values.get(previousDate) ?? null : null;
                    const changeDirection = getHeatmapChangeDirection(value?.interest_rate ?? null, previousValue?.interest_rate ?? null);
                    const tenorScale = scalesByTenor.get(row.tenor);
                    const minRate = tenorScale?.minRate ?? 0;
                    const benchmarkRate = tenorScale?.benchmarkRate ?? 0;
                    const maxRate = tenorScale?.maxRate ?? 0;
                    return (
                      <div
                        key={`${row.tenor}-${row.bank_code}-${date}`}
                        className={`heatmap-cell ${value === null ? "is-empty" : ""} ${changeDirection} ${weeklyDateIndexes.has(currentIndex) ? "is-week-marker" : ""}`}
                        style={{
                          background: getRateColor(value?.interest_rate ?? null, minRate, benchmarkRate, maxRate),
                        }}
                        onMouseEnter={(event) => {
                          if (!value) {
                            return;
                          }
                          const position = getTooltipPosition(event);
                          setHeatmapTooltip({
                            ...position,
                            rate: value.interest_rate,
                            bankName: row.bank_name_en,
                            tenor: value.source_tenor && value.source_tenor !== row.tenor ? `${row.tenor} bucket (${value.source_tenor})` : row.tenor,
                            type: selectedTmdType,
                            currency: value.currency ?? selectedCurrency ?? "-",
                            minAmount: value.min_amount,
                            date,
                          });
                        }}
                        onMouseMove={(event) => {
                          if (!value) {
                            return;
                          }
                          const position = getTooltipPosition(event);
                          setHeatmapTooltip((current) => (current ? { ...current, ...position } : current));
                        }}
                        onMouseLeave={() => setHeatmapTooltip(null)}
                      >
                        <span className="heatmap-cell-fill" aria-hidden="true" />
                        <span className="heatmap-cell-rate">{value ? formatPercent(value.interest_rate) : ""}</span>
                      </div>
                    );
                  })}
                </div>
              )),
              ],
            )}
          </div>
        </div>
      )}
      {heatmapTooltip
        ? createPortal(
            <div className="tmd-portal heatmap-tooltip" style={{ left: heatmapTooltip.x, top: heatmapTooltip.y }}>
              <strong>{formatPercent(heatmapTooltip.rate)}</strong>
              <span>Bank: {heatmapTooltip.bankName}</span>
              <span>Tenor: {heatmapTooltip.tenor}</span>
              <span>Type: {getTmdTypeLabel(heatmapTooltip.type)}</span>
              <span>Currency: {heatmapTooltip.currency}</span>
              <span>Min amount: {formatMoney(heatmapTooltip.minAmount)}</span>
              <span>Date: {heatmapTooltip.date}</span>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}

export type TmdAppProps = {
  activePage?: DashboardView;
  onPageChange?: (page: DashboardView) => void;
  hideSidebar?: boolean;
};

export function App({ activePage: controlledActivePage, onPageChange, hideSidebar = false }: TmdAppProps = {}) {
  const initialCache = useMemo(() => readTmdSessionCache(), []);
  const hasCachedDashboardData = Boolean(initialCache?.latestRates || initialCache?.snapshotDates?.length);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsedPreference);
  const [uncontrolledActivePage, setUncontrolledActivePage] = useState<DashboardView>(DEFAULT_TMD_PAGE);
  const activePage = controlledActivePage ?? uncontrolledActivePage;
  const setActivePage = useCallback(
    (nextPage: DashboardView) => {
      if (controlledActivePage === undefined) {
        setUncontrolledActivePage(nextPage);
      }
      onPageChange?.(nextPage);
    },
    [controlledActivePage, onPageChange],
  );
  const [heroSnapshotDate, setHeroSnapshotDate] = useState<string | null>(initialCache?.heroSnapshotDate ?? null);
  const [aiSummaryByKey, setAiSummaryByKey] = useState<Record<string, AiSummaryResponse | null>>(initialCache?.aiSummaryByKey ?? {});
  const [latestMarketRates, setLatestMarketRates] = useState<LatestRatesResponse | null>(initialCache?.latestMarketRates ?? null);
  const [filters, setFilters] = useState<FiltersResponse | null>(initialCache?.filters ?? null);
  const [latestRates, setLatestRates] = useState<LatestRatesResponse | null>(initialCache?.latestRates ?? null);
  const [snapshotDates, setSnapshotDates] = useState<string[]>(initialCache?.snapshotDates ?? []);
  const [historicalRates, setHistoricalRates] = useState<LatestRatesResponse[]>(initialCache?.historicalRates ?? []);
  const [newFundHistoryByCurrency, setNewFundHistoryByCurrency] = useState<Record<string, LatestRatesResponse[]>>(initialCache?.newFundHistoryByCurrency ?? {});
  const [fxTmdHistory, setFxTmdHistory] = useState<LatestRatesResponse[] | null>(initialCache?.fxTmdHistory ?? null);
  const [bidRateHkdHistory, setBidRateHkdHistory] = useState<BidRateHkdPoint[]>(initialCache?.bidRateHkdHistory ?? []);
  const [isBidRateHkdLoaded, setIsBidRateHkdLoaded] = useState(Boolean(initialCache?.isBidRateHkdLoaded));
  const [heatmapView, setHeatmapView] = useState<HeatmapView>("New Fund");
  const [heatmapNewFundTenors, setHeatmapNewFundTenors] = useState<string[]>([]);
  const [heatmapFxTmdTenors, setHeatmapFxTmdTenors] = useState<string[]>([]);
  const [tableSnapshotDate, setTableSnapshotDate] = useState(initialCache?.tableSnapshotDate ?? "");
  const [filterState, setFilterState] = useState<FilterState>(initialFilters);
  const [rateView, setRateView] = useState<RateView>("New Fund");
  const [highlightThreshold, setHighlightThreshold] = useState("");
  const [isLoading, setIsLoading] = useState(!hasCachedDashboardData);
  const [isTableLoading, setIsTableLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const historyRequestsRef = useRef<Partial<Record<OverviewHistoryKey, Promise<LatestRatesResponse[]>>>>({});
  const bidRateHkdRequestRef = useRef<Promise<BidRateHkdPoint[]> | null>(null);
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((current) => !current);
  }, []);

  async function loadTableData(snapshotDate: string) {
    const ratesPayload = await fetchLatestRates({
      snapshot_date: snapshotDate,
    });
    const filtersPayload = buildFiltersResponse(ratesPayload.snapshot_date, ratesPayload.items);
    return { filtersPayload, ratesPayload };
  }

  async function loadInitialData() {
    setIsLoading(true);
    setError(null);
    try {
      const bootstrapPayload = await fetchDashboardBootstrap();
      const availableSnapshotDates = bootstrapPayload.snapshot_dates;
      const latestSnapshot = bootstrapPayload.summary.snapshot_date ?? bootstrapPayload.latest_rates.snapshot_date ?? "";

      setSnapshotDates(availableSnapshotDates);
      setHeroSnapshotDate(latestSnapshot || null);
      setTableSnapshotDate(latestSnapshot || "");
      setLatestMarketRates(bootstrapPayload.latest_rates);
      setFilters(bootstrapPayload.filters);
      setLatestRates(bootstrapPayload.latest_rates);

    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load dashboard data.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (hasCachedDashboardData) {
      return;
    }
    void loadInitialData();
  }, [hasCachedDashboardData]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(tmdSidebarCollapsedStorageKey, String(sidebarCollapsed));
    } catch {
      // Ignore storage failures; the sidebar still works for the current session.
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    writeTmdSessionCache({
      heroSnapshotDate,
      aiSummaryByKey,
      latestMarketRates,
      filters,
      latestRates,
      snapshotDates,
      historicalRates,
      newFundHistoryByCurrency,
      fxTmdHistory,
      bidRateHkdHistory,
      isBidRateHkdLoaded,
      tableSnapshotDate,
    });
  }, [
    aiSummaryByKey,
    filters,
    fxTmdHistory,
    heroSnapshotDate,
    historicalRates,
    bidRateHkdHistory,
    isBidRateHkdLoaded,
    latestMarketRates,
    latestRates,
    newFundHistoryByCurrency,
    snapshotDates,
    tableSnapshotDate,
  ]);

  const activeNewFundPage = newFundPageConfigs.find((page) => page.key === activePage) ?? null;
  const isFxTmdPage = activePage === fxTmdPageConfig.key;
  const activeOverviewPage = activeNewFundPage ?? (isFxTmdPage ? fxTmdPageConfig : null);
  const overviewCurrency = activeNewFundPage?.currency ?? null;
  const overviewCurrencyLabel = overviewCurrency ?? "1 week tenor";
  const overviewPageTitle = activeOverviewPage?.label ?? "New Fund - HKD";
  const activePageTitle = tmdNavItems.find((page) => page.key === activePage)?.label ?? overviewPageTitle;
  const overviewTmdType: HeatmapView = isFxTmdPage ? "FX TMD" : "New Fund";
  const overviewDimensionMode: DimensionMode = isFxTmdPage ? "tenor-currency" : "tenor";
  const activeNewFundCurrency = activeNewFundPage?.currency ?? "";
  const activeNewFundSnapshots = activeNewFundCurrency ? newFundHistoryByCurrency[activeNewFundCurrency] : undefined;
  const activeOverviewSnapshots = isFxTmdPage ? fxTmdHistory ?? undefined : activeNewFundSnapshots;
  const activeOverviewHistoryKey: OverviewHistoryKey | "" = isFxTmdPage
    ? "fx-tmd"
    : activeNewFundCurrency
    ? getNewFundHistoryKey(activeNewFundCurrency)
    : "";
  const activeAiSummaryTmdType = isFxTmdPage ? "FX TMD" : activeNewFundCurrency ? "New Fund" : "";
  const activeAiSummaryCurrency = isFxTmdPage ? "ALL" : activeNewFundCurrency;
  const activeAiSummaryKey =
    activeAiSummaryTmdType && activeAiSummaryCurrency && heroSnapshotDate ? `${activeAiSummaryTmdType}|${activeAiSummaryCurrency}|${heroSnapshotDate}` : "";
  const aiSummary = activeAiSummaryKey ? aiSummaryByKey[activeAiSummaryKey] ?? null : null;
  const activeOverviewHistoryKeyRef = useRef<OverviewHistoryKey | "">(activeOverviewHistoryKey);
  const overviewHistoryKeys = useMemo<OverviewHistoryKey[]>(
    () => [
      ...newFundPageConfigs.map((page) => getNewFundHistoryKey(page.currency)),
      "fx-tmd",
    ],
    [],
  );

  const applyOverviewSnapshots = useCallback((snapshots: LatestRatesResponse[]) => {
    if (snapshots.length === 0) {
      return;
    }
    const latestOverviewSnapshot = snapshots[snapshots.length - 1];
    setHistoricalRates((current) => (current === snapshots ? current : snapshots));
    setLatestMarketRates((current) => (current === latestOverviewSnapshot ? current : latestOverviewSnapshot));
    setHeroSnapshotDate((current) => {
      const nextSnapshotDate = latestOverviewSnapshot.snapshot_date ?? null;
      return current === nextSnapshotDate ? current : nextSnapshotDate;
    });
  }, []);

  useEffect(() => {
    activeOverviewHistoryKeyRef.current = activeOverviewHistoryKey;
  }, [activeOverviewHistoryKey]);

  useEffect(() => {
    if (activeOverviewHistoryKey !== "newfund:HKD" || isBidRateHkdLoaded) {
      return;
    }

    if (!bidRateHkdRequestRef.current) {
      bidRateHkdRequestRef.current = fetchBidRateHkdHistory("overnight")
        .then((payload) => {
          setBidRateHkdHistory(payload.items);
          setIsBidRateHkdLoaded(true);
          return payload.items;
        })
        .catch((requestError) => {
          setIsBidRateHkdLoaded(true);
          setError(requestError instanceof Error ? requestError.message : "Failed to load HKD overnight bid rate.");
          throw requestError;
        })
        .finally(() => {
          bidRateHkdRequestRef.current = null;
        });
    }

    void bidRateHkdRequestRef.current.catch(() => undefined);
  }, [activeOverviewHistoryKey, isBidRateHkdLoaded]);

  const hasCachedOverviewHistory = useCallback(
    (key: OverviewHistoryKey) => {
      if (key === "fx-tmd") {
        return Boolean(fxTmdHistory);
      }
      return Boolean(newFundHistoryByCurrency[getCurrencyFromHistoryKey(key)]);
    },
    [fxTmdHistory, newFundHistoryByCurrency],
  );

  const requestOverviewHistory = useCallback(
    (key: OverviewHistoryKey) => {
      const existingRequest = historyRequestsRef.current[key];
      if (existingRequest) {
        return existingRequest;
      }

      const request = (isNewFundHistoryKey(key)
        ? fetchNewFundHistory(getCurrencyFromHistoryKey(key))
        : fetchFxTmdHistory()
      )
        .then((historyPayload) => {
          const snapshots = historyPayload.snapshots;
          if (snapshots.length === 0) {
            return snapshots;
          }

          if (key === "fx-tmd") {
            setFxTmdHistory((current) => (current === snapshots ? current : snapshots));
          } else {
            const currency = getCurrencyFromHistoryKey(key);
            setNewFundHistoryByCurrency((current) =>
              current[currency] === snapshots
                ? current
                : {
                    ...current,
                    [currency]: snapshots,
                  },
            );
          }

          if (activeOverviewHistoryKeyRef.current === key) {
            setError(null);
            applyOverviewSnapshots(snapshots);
          }
          return snapshots;
        })
        .catch((requestError) => {
          if (activeOverviewHistoryKeyRef.current === key) {
            setError(requestError instanceof Error ? requestError.message : `Failed to load ${getOverviewHistoryLabel(key)}.`);
          }
          throw requestError;
        })
        .finally(() => {
          delete historyRequestsRef.current[key];
        });

      historyRequestsRef.current[key] = request;
      return request;
    },
    [applyOverviewSnapshots],
  );

  useEffect(() => {
    if (!activeOverviewHistoryKey) {
      return;
    }

    if (activeOverviewSnapshots) {
      applyOverviewSnapshots(activeOverviewSnapshots);
      return;
    }

    void requestOverviewHistory(activeOverviewHistoryKey).catch(() => undefined);
  }, [activeOverviewHistoryKey, activeOverviewSnapshots, applyOverviewSnapshots, requestOverviewHistory]);

  useEffect(() => {
    if (activeOverviewHistoryKey && !activeOverviewSnapshots) {
      return;
    }

    overviewHistoryKeys.forEach((key) => {
      if (key === activeOverviewHistoryKey || hasCachedOverviewHistory(key)) {
        return;
      }
      void requestOverviewHistory(key).catch(() => undefined);
    });
  }, [activeOverviewHistoryKey, activeOverviewSnapshots, hasCachedOverviewHistory, overviewHistoryKeys, requestOverviewHistory]);

  useEffect(() => {
    if (!activeAiSummaryTmdType || !activeAiSummaryCurrency || !heroSnapshotDate || activeAiSummaryKey in aiSummaryByKey) {
      return;
    }

    let cancelled = false;
    void fetchLatestAiSummary({
      snapshot_date: heroSnapshotDate,
      tmd_type: activeAiSummaryTmdType,
      currency: activeAiSummaryCurrency,
    })
      .then((aiSummaryPayload) => {
        if (cancelled) {
          return;
        }
        setAiSummaryByKey((current) => ({
          ...current,
          [activeAiSummaryKey]: aiSummaryPayload.content_markdown ? aiSummaryPayload : null,
        }));
      })
      .catch(() => {
        if (!cancelled) {
          setAiSummaryByKey((current) => ({
            ...current,
            [activeAiSummaryKey]: null,
          }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeAiSummaryCurrency, activeAiSummaryKey, activeAiSummaryTmdType, aiSummaryByKey, heroSnapshotDate]);

  useEffect(() => {
    if (!tableSnapshotDate) {
      return;
    }

    if (latestRates?.snapshot_date === tableSnapshotDate) {
      return;
    }

    let cancelled = false;

    async function reloadTable() {
      setIsTableLoading(true);
      try {
        const { filtersPayload, ratesPayload } = await loadTableData(tableSnapshotDate);
        if (!cancelled) {
          setFilters(filtersPayload);
          setLatestRates(ratesPayload);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "Failed to refresh competitor rates.");
        }
      } finally {
        if (!cancelled) {
          setIsTableLoading(false);
        }
      }
    }

    void reloadTable();

    return () => {
      cancelled = true;
    };
  }, [latestRates?.snapshot_date, tableSnapshotDate]);

  const highlightValue = Number.parseFloat(highlightThreshold);
  const hasHighlightValue = !Number.isNaN(highlightValue);
  const bestOverviewItems = useMemo(() => {
    return (latestMarketRates?.items ?? []).filter((item) => {
      if (item.tmd_type !== overviewTmdType) {
        return false;
      }
      if (overviewCurrency && item.currency !== overviewCurrency) {
        return false;
      }
      return isFxTmdPage ? (item.tenor_bucket || item.tenor) === "1w" : overviewTenors.includes(item.tenor_bucket || item.tenor);
    });
  }, [isFxTmdPage, latestMarketRates?.items, overviewCurrency, overviewTmdType]);
  const aiSummaryDimensions = isFxTmdPage ? fxTmdAiSummaryDimensions : newFundAiSummaryDimensions;
  const parsedAiSummary = useMemo(() => (aiSummary ? parseAiSummary(aiSummary.content_markdown, aiSummaryDimensions) : null), [aiSummary, aiSummaryDimensions]);
  const overviewDimensions = useMemo(() => {
    if (!isFxTmdPage) {
      return overviewTenors;
    }
    return fxTmdOverviewDimensions;
  }, [isFxTmdPage]);
  const overviewTrendDimensions = useMemo(() => {
    if (!isFxTmdPage) {
      return overviewTenors;
    }
    return fxTmdOverviewDimensions;
  }, [isFxTmdPage]);
  const overviewSupplementalTrendSeries = useMemo(() => {
    if (activeOverviewHistoryKey !== "newfund:HKD") {
      return [];
    }
    return buildOvernightBidRateSeries(historicalRates, bidRateHkdHistory);
  }, [activeOverviewHistoryKey, bidRateHkdHistory, historicalRates]);
  const bestOverviewSlotsByDimension = useMemo(() => {
    return overviewDimensions.map((dimension) => ({
      dimension,
      slots: getBestRateSlots(bestOverviewItems.filter((item) => getItemDimensionLabel(item, overviewDimensionMode) === dimension)),
    }));
  }, [bestOverviewItems, overviewDimensionMode, overviewDimensions]);
  const availableHeatmapViews = useMemo<HeatmapView[]>(() => {
    const items = historicalRates.flatMap((snapshot) => snapshot.items);
    return sortTmdTypes(
      rateViewDisplayOrder.filter((type): type is HeatmapView => type !== "Existing Fund" && items.some((item) => item.tmd_type === type)),
    );
  }, [historicalRates]);
  const heatmapTenorTabs = useMemo(() => {
    const relevantItems = historicalRates
      .flatMap((snapshot) => snapshot.items)
      .filter((item) => item.tmd_type === overviewTmdType && (!overviewCurrency || item.currency === overviewCurrency));
    return buildDimensionTabs(relevantItems, overviewDimensionMode);
  }, [historicalRates, overviewCurrency, overviewDimensionMode, overviewTmdType]);
  const heatmapFallbackUrls = useMemo(() => {
    const lookup = new Map<string, string>();
    (latestMarketRates?.items ?? [])
      .filter((item) => item.tmd_type === overviewTmdType && (!overviewCurrency || item.currency === overviewCurrency) && item.deposit_page_url)
      .forEach((item) => {
        const exactKey = `${getItemDimensionLabel(item, overviewDimensionMode)}|${item.bank_code}`;
        const bankFallbackKey = `*|${item.bank_code}`;
        if (!lookup.has(exactKey)) {
          lookup.set(exactKey, item.deposit_page_url);
        }
        if (!lookup.has(bankFallbackKey)) {
          lookup.set(bankFallbackKey, item.deposit_page_url);
        }
      });
    return lookup;
  }, [latestMarketRates?.items, overviewCurrency, overviewDimensionMode, overviewTmdType]);
  const heatmapAvailableTenors = useMemo(() => getSpecificTenorsFromTabs(heatmapTenorTabs), [heatmapTenorTabs]);
  const selectedHeatmapDimensions = isFxTmdPage ? [""] : heatmapNewFundTenors;
  const overviewSnapshotDates = useMemo(
    () => historicalRates.map((snapshot) => snapshot.snapshot_date).filter((date): date is string => Boolean(date)),
    [historicalRates],
  );

  const rateViewItems = useMemo(() => {
    return (latestRates?.items ?? []).filter((item) => item.tmd_type === rateView);
  }, [latestRates?.items, rateView]);
  const availableRateViews = useMemo<RateView[]>(() => {
    const sourceItems = latestRates?.items ?? [];
    return sortTmdTypes(rateViewDisplayOrder.filter((type) => sourceItems.some((item) => item.tmd_type === type)));
  }, [latestRates?.items]);

  const matchesFilterState = (item: RateItem, state: FilterState, exclude?: keyof FilterState) => {
    if (exclude !== "currencies" && state.currencies.length > 0 && !state.currencies.includes(item.currency)) {
      return false;
    }
    if (exclude !== "tenors" && state.tenors.length > 0 && !state.tenors.includes(item.tenor)) {
      return false;
    }
    if (exclude !== "bank_codes" && state.bank_codes.length > 0 && !state.bank_codes.includes(item.bank_code)) {
      return false;
    }
    if (exclude !== "customer_segments" && state.customer_segments.length > 0 && !state.customer_segments.includes(item.customer_segment)) {
      return false;
    }
    return true;
  };

  const linkedFilterOptions = useMemo(() => {
    const allCurrencies = sortCurrencyOptions(filters?.currencies ?? []);
    const allBanks = filters?.banks ?? [];
    const allSegments = filters?.customer_segments ?? [];

    const availableCurrencyValues = new Set(rateViewItems.filter((item) => matchesFilterState(item, filterState, "currencies")).map((item) => item.currency));
    const availableBankValues = new Set(rateViewItems.filter((item) => matchesFilterState(item, filterState, "bank_codes")).map((item) => item.bank_code));
    const availableSegmentValues = new Set(
      rateViewItems.filter((item) => matchesFilterState(item, filterState, "customer_segments")).map((item) => item.customer_segment),
    );
    const availableTenors = new Set(rateViewItems.filter((item) => matchesFilterState(item, filterState, "tenors")).map((item) => item.tenor));

    return {
      currencies: allCurrencies.filter((option) => availableCurrencyValues.has(option.value)),
      banks: allBanks.filter((option) => availableBankValues.has(option.value)),
      customerSegments: allSegments.filter((option) => availableSegmentValues.has(option.value)),
      availableTenors,
    };
  }, [filterState, filters?.banks, filters?.currencies, filters?.customer_segments, rateViewItems]);

  useEffect(() => {
    setFilterState((current) => {
      const nextTenors = current.tenors.filter((value) => linkedFilterOptions.availableTenors.has(value));
      const normalizedTenors =
        nextTenors.length > 0 ? nextTenors : getDefaultTenors(linkedFilterOptions.availableTenors);

      const nextState = {
        currencies: current.currencies.filter((value) => linkedFilterOptions.currencies.some((option) => option.value === value)),
        tenors: normalizedTenors,
        bank_codes: current.bank_codes.filter((value) => linkedFilterOptions.banks.some((option) => option.value === value)),
        customer_segments: current.customer_segments.filter((value) =>
          linkedFilterOptions.customerSegments.some((option) => option.value === value),
        ),
      };

      const unchanged =
        nextState.currencies.length === current.currencies.length &&
        nextState.tenors.length === current.tenors.length &&
        nextState.bank_codes.length === current.bank_codes.length &&
        nextState.customer_segments.length === current.customer_segments.length &&
        nextState.currencies.every((value, index) => value === current.currencies[index]) &&
        nextState.tenors.every((value, index) => value === current.tenors[index]) &&
        nextState.bank_codes.every((value, index) => value === current.bank_codes[index]) &&
        nextState.customer_segments.every((value, index) => value === current.customer_segments[index]);

      return unchanged ? current : nextState;
    });
  }, [linkedFilterOptions]);

  useEffect(() => {
    if (availableHeatmapViews.length === 0) {
      return;
    }
    if (!availableHeatmapViews.includes(heatmapView)) {
      setHeatmapView(availableHeatmapViews[0]);
    }
  }, [availableHeatmapViews, heatmapView]);

  useEffect(() => {
    if (heatmapTenorTabs.length === 0 || heatmapAvailableTenors.length === 0) {
      return;
    }
    if (isFxTmdPage) {
      return;
    }

    const normalizedSelection = normalizeTenorSelection(heatmapNewFundTenors, heatmapAvailableTenors);
    if (normalizedSelection.length > 0 && normalizedSelection.length === heatmapNewFundTenors.length && normalizedSelection.every((value, index) => value === heatmapNewFundTenors[index])) {
      return;
    }
    const defaults = ["3m", "6m", "12m"].filter((tenor) => heatmapAvailableTenors.includes(tenor));
    setHeatmapNewFundTenors(normalizedSelection.length > 0 ? normalizedSelection : defaults.length > 0 ? defaults : [heatmapAvailableTenors[0]]);
  }, [heatmapAvailableTenors, heatmapNewFundTenors, heatmapTenorTabs.length, isFxTmdPage]);

  useEffect(() => {
    if (availableRateViews.length === 0) {
      return;
    }
    if (!availableRateViews.includes(rateView)) {
      setRateView(availableRateViews[0]);
    }
  }, [availableRateViews, rateView]);

  const competitorMatrix = useMemo(() => {
    const filteredItems = rateViewItems.filter((item) => {
      if (filterState.currencies.length > 0 && !filterState.currencies.includes(item.currency)) {
        return false;
      }
      if (filterState.tenors.length > 0 && !filterState.tenors.includes(item.tenor)) {
        return false;
      }
      if (filterState.bank_codes.length > 0 && !filterState.bank_codes.includes(item.bank_code)) {
        return false;
      }
      if (filterState.customer_segments.length > 0 && !filterState.customer_segments.includes(item.customer_segment)) {
        return false;
      }
      return true;
    });

    const bankLookup = new Map<string, string>();
    const matrix = new Map<string, Map<string, number>>();

    filteredItems.forEach((item) => {
      bankLookup.set(item.bank_code, item.bank_name_en);
      const rowKey = `${item.currency}|${item.tenor}`;
      if (!matrix.has(rowKey)) {
        matrix.set(rowKey, new Map());
      }
      const row = matrix.get(rowKey)!;
      const currentMax = row.get(item.bank_code);
      if (currentMax === undefined || item.interest_rate > currentMax) {
        row.set(item.bank_code, item.interest_rate);
      }
    });

    const bankHeaders = sortByFixedBankOrder(
      (filters?.banks ?? [])
        .filter((bank) => bankLookup.has(bank.value))
        .map((bank) => ({
          bank_code: bank.value,
          bank_name_en: bank.label,
        })),
    );

    if (bankHeaders.length === 0) {
      sortByFixedBankOrder(
        Array.from(bankLookup.entries()).map(([bankCode, bankName]) => ({
          bank_code: bankCode,
          bank_name_en: bankName,
        })),
      ).forEach((bank) => {
        bankHeaders.push(bank);
      });
    }

    const rows = Array.from(matrix.entries())
      .map(([rowKey, rates]) => {
        const [currency, tenor] = rowKey.split("|");
        return {
          currency,
          tenor,
          rates,
        };
      })
      .sort((left, right) => {
        const currencyDiff = compareCurrencies(left.currency, right.currency);
        if (currencyDiff !== 0) {
          return currencyDiff;
        }
        return compareTenors(left.tenor, right.tenor);
      });

    return { bankHeaders, rows };
  }, [filterState.bank_codes, filterState.currencies, filterState.customer_segments, filterState.tenors, filters?.banks, rateViewItems]);

  const headerSection = (
    <section className="hero-band hero-band-compact">
      <div className="hero-header-row">
        <div className="hero-copy">
          <p className="hero-eyebrow">Pricing Radar</p>
          <h1>{activePageTitle}</h1>
          <p className="hero-snapshot-line">
            {formatSnapshotLabel(heroSnapshotDate)}
          </p>
        </div>
      </div>
    </section>
  );

  const bestRateSection = (
    <section className="best-band">
      <div className="section-head compact">
        <div>
          <h2>Best Rate - {overviewCurrencyLabel}</h2>
        </div>
      </div>
      <div className="offer-board">
        {bestOverviewSlotsByDimension.map(({ dimension, slots }) => (
        <div className="offer-row" key={`best-${dimension}`}>
          <div className="offer-row-title">{dimension}</div>
          <div className="offer-grid">
            {slots.map((row, index) =>
              row ? (
                <div className={`top-offer small-offer ${index === 0 ? "is-hsbc-slot" : ""}`} key={`${dimension}-${row.bank_code}-${index}`}>
                  <span className="top-rank">{index === 0 ? "HSBC" : `Rank ${index}`}</span>
                  <strong>{formatPercent(row.interest_rate)}</strong>
                  <p className="offer-bank">{getBankLabel(row.bank_name_en)}</p>
                  <span className="offer-meta">
                    {getItemDimensionLabel(row, overviewDimensionMode) === dimension ? dimension : `${dimension} (${row.tenor})`} · Min {formatCompactMoney(row.min_amount)}
                  </span>
                </div>
              ) : (
                <div className="top-offer small-offer is-empty" key={`${dimension}-empty-${index}`} aria-hidden="true" />
              ),
            )}
          </div>
        </div>
        ))}
      </div>
    </section>
  );

  const heatmapSection = (
    <RateHeatmap
      dates={overviewSnapshotDates}
      snapshots={historicalRates}
      selectedDimensions={selectedHeatmapDimensions}
      selectedCurrency={overviewCurrency}
      selectedTmdType={overviewTmdType}
      dimensionMode={overviewDimensionMode}
      title={`Rate Heatmap - ${isFxTmdPage ? "FX TMD" : overviewCurrencyLabel}`}
      fallbackUrls={heatmapFallbackUrls}
      onSelectedTenorsChange={setHeatmapNewFundTenors}
      onSelectedTmdTypeChange={setHeatmapView}
      availableTypes={availableHeatmapViews}
      tenorTabs={heatmapTenorTabs}
    />
  );

  const recentChangeChartsOverview = (
    <div className="trend-grid">
      <RateTrendChart
        snapshots={historicalRates}
        tmdType={overviewTmdType}
        dimensions={overviewTrendDimensions}
        title={overviewPageTitle}
        currency={overviewCurrency}
        dimensionMode={overviewDimensionMode}
        variant="overview"
        supplementalSeries={overviewSupplementalTrendSeries}
      />
    </div>
  );

  const competitorRatesSection = (
    <section className="rates-panel">
      <div className="section-head">
        <h2>Competitor Rates</h2>
        <button
          type="button"
          className="ghost-button"
          onClick={() => {
            setFilterState(initialFilters);
            setRateView("New Fund");
            setHighlightThreshold("");
          }}
        >
          <Filter size={16} />
          <span>Reset</span>
        </button>
      </div>

      <div className="rate-view-tags">
        {availableRateViews.map((type) => (
          <button
            key={type}
            type="button"
            className={`rate-view-tag ${rateView === type ? "is-active" : ""}`}
            onClick={() => setRateView(type)}
          >
            {getTmdTypeLabel(type)}
          </button>
        ))}
      </div>

      <div className="matrix-filter-stack">
        <div className="matrix-filter-row matrix-filter-row-primary">
          <FilterSelect
            label="Snapshot"
            value={tableSnapshotDate}
            options={snapshotDates.map((value) => ({ label: value, value })).reverse()}
            includeAll={false}
            onChange={(value) => setTableSnapshotDate(value)}
          />
          <MultiSelectMenu
            label="Currency"
            values={filterState.currencies}
            options={linkedFilterOptions.currencies}
            onChange={(value) => setFilterState((current) => ({ ...current, currencies: value }))}
          />
          <MultiSelectMenu
            label="Bank"
            values={filterState.bank_codes}
            options={linkedFilterOptions.banks}
            onChange={(value) => setFilterState((current) => ({ ...current, bank_codes: value }))}
          />
          <MultiSelectMenu
            label="Segment"
            values={filterState.customer_segments}
            options={linkedFilterOptions.customerSegments}
            onChange={(value) => setFilterState((current) => ({ ...current, customer_segments: value }))}
          />
        </div>
        <div className="matrix-filter-row matrix-filter-row-single">
          <TenorToggleGroup
            value={filterState.tenors}
            availableTenors={linkedFilterOptions.availableTenors}
            onChange={(value) => setFilterState((current) => ({ ...current, tenors: value }))}
          />
        </div>
        <div className="matrix-filter-row matrix-filter-row-single">
          <label className="filter-field highlight-field">
            <span>Highlight Rate≥</span>
            <div className="threshold-input-wrap">
              <input
                className="threshold-input"
                value={highlightThreshold}
                onChange={(event) => setHighlightThreshold(event.target.value)}
                placeholder="e.g. 2"
              />
              <span className="threshold-suffix">%</span>
            </div>
          </label>
        </div>
      </div>

      <div className="table-wrap">
        <table className="matrix-table">
          <thead>
            <tr>
              <th className="sticky-col sticky-col-1">Currency</th>
              <th className="sticky-col sticky-col-2">Tenor</th>
              {competitorMatrix.bankHeaders.map((bank) => (
                <th key={bank.bank_code}>{getBankLabel(bank.bank_name_en)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {competitorMatrix.rows.map((row) => (
              <tr key={`${row.currency}-${row.tenor}`}>
                <td className="sticky-col sticky-col-1">{row.currency}</td>
                <td className="sticky-col sticky-col-2">{row.tenor}</td>
                {competitorMatrix.bankHeaders.map((bank) => {
                  const rate = row.rates.get(bank.bank_code) ?? null;
                  const isHighlighted = hasHighlightValue && rate !== null && rate >= highlightValue;
                  return (
                    <td key={`${row.currency}-${row.tenor}-${bank.bank_code}`} className={`rate-cell ${isHighlighted ? "is-highlighted-rate" : ""}`}>
                      {formatPercent(rate)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!isTableLoading && competitorMatrix.rows.length === 0 ? <div className="panel-note">No rows match the current rate filters.</div> : null}
      </div>
    </section>
  );

  const overviewPage = (
    <section className="overview-layout">
      <section className="ai-summary-panel overview-summary-panel">
        <div className="section-head compact">
          <div>
            <h2>At a Glance</h2>
          </div>
        </div>
        {aiSummary ? (
          <>
            <div className="ai-summary-content ai-summary-content-compact">
              <div className="ai-summary-column">
                <h3>Last 7 Days Trend</h3>
                <div className={`ai-summary-key-moves-grid ai-summary-trend-grid ${isFxTmdPage ? "is-four-column" : ""}`}>
                  {(parsedAiSummary?.last7DaysTrendByDimension ?? aiSummaryDimensions.map((dimension) => ({ ...dimension, hsbcLines: [], marketLines: [] }))).map((group) => (
                    <div key={group.key} className="ai-summary-key-move-group ai-summary-trend-group">
                      <h4>{group.label}</h4>
                      <div className="ai-summary-key-move-list">
                        {group.hsbcLines.length > 0 ? (
                          group.hsbcLines.map((line, index) => (
                            <p key={`${group.key}-hsbc-${line}-${index}`} className="ai-summary-bullet ai-summary-key-move-item">
                              {renderAiSummaryLine(formatAiSummaryTrendDisplayLine(line, "hsbc"), { emphasizeMarket: true })}
                            </p>
                          ))
                        ) : (
                          <p className="ai-summary-bullet ai-summary-key-move-item is-empty">HSBC -</p>
                        )}
                        {group.marketLines.map((line, index) => (
                          <p key={`${group.key}-market-${line}-${index}`} className="ai-summary-bullet ai-summary-key-move-item">
                            {renderAiSummaryLine(formatAiSummaryTrendDisplayLine(line, "market"), { emphasizeMarket: true })}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="ai-summary-column">
                <h3>Competitor Key Moves</h3>
                <div className={`ai-summary-key-moves-grid ${isFxTmdPage ? "is-four-column" : ""}`}>
                  {(parsedAiSummary?.keyMovesByDimension ?? aiSummaryDimensions.map((dimension) => ({ ...dimension, lines: [] }))).map((group) => (
                    <div key={group.key} className="ai-summary-key-move-group">
                      <h4>{group.label}</h4>
                      <div className="ai-summary-key-move-list">
                        {group.lines.map((line, index) => (
                          <p
                            key={`${group.key}-${line}-${index}`}
                            className={`ai-summary-bullet ai-summary-key-move-item ${isNoBankChangesLine(line) ? "is-no-bank-changes" : ""}`}
                          >
                            {renderAiSummaryLine(line)}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="ai-summary-disclaimer">This conclusion is AI-generated and is for reference only.</p>
          </>
        ) : (
          <div className="panel-note">AI summary is not available for the latest snapshot yet.</div>
        )}
      </section>
      <div className="overview-main-grid">
        <div className="overview-main-column">
          {bestRateSection}
          <section className="changes-panel overview-changes-panel">
            <div className="section-head compact">
              <div>
                <h2>Market Highest Rate Trend - {overviewCurrencyLabel}</h2>
              </div>
            </div>
            {recentChangeChartsOverview}
          </section>
        </div>
        <div className="overview-side-column">{heatmapSection}</div>
      </div>
    </section>
  );

  return (
    <div className="tmd-app app-shell">
      <div className="background-grid" />
      <div
        className={`dashboard-frame ${hideSidebar ? "dashboard-frame-no-sidebar" : ""} ${
          !hideSidebar && sidebarCollapsed ? "dashboard-frame-sidebar-collapsed" : ""
        }`}
      >
        {hideSidebar ? null : (
          <TmdSidebar
            activePage={activePage}
            collapsed={sidebarCollapsed}
            items={tmdNavItems}
            onPageChange={setActivePage}
            onToggle={toggleSidebar}
          />
        )}
        <main className="dashboard-page">
          {headerSection}

          {error ? (
            <section className="status-band status-error">
              <CircleAlert size={18} />
              <span>{error}</span>
            </section>
          ) : null}

          {activeOverviewPage ? overviewPage : null}
          {activePage === "detail-data" ? competitorRatesSection : null}
        </main>
      </div>
    </div>
  );
}

export { App as TmdApp };
