import type {
  AiSummaryResponse,
  BidRateHkdPoint,
  FiltersResponse,
  LatestRatesResponse,
} from "../lib/types";

export type TmdSessionCacheState = {
  heroSnapshotDate: string | null;
  aiSummaryByKey: Record<string, AiSummaryResponse | null>;
  latestMarketRates: LatestRatesResponse | null;
  filters: FiltersResponse | null;
  latestRates: LatestRatesResponse | null;
  snapshotDates: string[];
  historicalRates: LatestRatesResponse[];
  newFundHistoryByCurrency: Record<string, LatestRatesResponse[]>;
  fxTmdHistory: LatestRatesResponse[] | null;
  bidRateHkdHistory: BidRateHkdPoint[];
  isBidRateHkdLoaded: boolean;
  tableSnapshotDate: string;
};

// Session-only in-memory cache.
// This intentionally survives React unmounts when AEO navigates away from Bank
// Web Data Insights and back, but it is cleared by a full browser refresh so
// TMD still reloads fresh backend data on refresh.
let tmdSessionCache: Partial<TmdSessionCacheState> | null = null;

export function readTmdSessionCache() {
  return tmdSessionCache;
}

export function writeTmdSessionCache(patch: Partial<TmdSessionCacheState>) {
  tmdSessionCache = {
    ...(tmdSessionCache ?? {}),
    ...patch,
  };
}
