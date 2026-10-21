import type {
  AiSummaryResponse,
  BidRateHkdResponse,
  DashboardBootstrapResponse,
  LatestRatesResponse,
  RateHistoryResponse,
} from "./types";

type LatestRateParams = {
  snapshot_date?: string;
  currency?: string;
  tenor?: string;
  bank_code?: string;
  customer_segment?: string;
  tmd_type?: string;
  sort_by?: string;
  sort_order?: string;
};

function buildQuery(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      search.set(key, value);
    }
  });
  return search.toString();
}

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function fetchDashboardBootstrap() {
  return requestJson<DashboardBootstrapResponse>("/api/v1/rates/bootstrap");
}

export function fetchLatestAiSummary(params: { snapshot_date?: string; tmd_type?: string; currency?: string } = {}) {
  const query = buildQuery(params);
  return requestJson<AiSummaryResponse>(`/api/v1/rates/ai-summary/latest${query ? `?${query}` : ""}`);
}

export function fetchLatestRates(params: LatestRateParams) {
  const query = buildQuery(params);
  return requestJson<LatestRatesResponse>(`/api/v1/rates/latest${query ? `?${query}` : ""}`);
}

export function fetchNewFundHistory(currency: string) {
  const query = buildQuery({ currency });
  return requestJson<RateHistoryResponse>(`/api/v1/rates/newfund?${query}`);
}

export function fetchBidRateHkdHistory(tenor = "overnight") {
  const query = buildQuery({ tenor });
  return requestJson<BidRateHkdResponse>(`/api/v1/rates/bid-rate-hkd${query ? `?${query}` : ""}`);
}

export function fetchFxTmdHistory() {
  return requestJson<RateHistoryResponse>("/api/v1/rates/fxtmd");
}
