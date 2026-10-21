export type FilterOption = {
  label: string;
  value: string;
};

export type FiltersResponse = {
  snapshot_date: string | null;
  currencies: FilterOption[];
  tenors: FilterOption[];
  banks: FilterOption[];
  customer_segments: FilterOption[];
  tmd_types: FilterOption[];
};

export type BestRateCard = {
  currency: string;
  bank_code: string;
  bank_name_en: string;
  interest_rate: number;
  tenor: string;
  customer_segment: string;
  min_amount: number | null;
};

export type SummaryResponse = {
  snapshot_date: string | null;
  bank_count: number;
  currency_count: number;
  record_count: number;
  best_rates: BestRateCard[];
};

export type RateItem = {
  bank_code: string;
  bank_name_en: string;
  tmd_type: string;
  customer_segment: string;
  currency: string;
  tenor: string;
  tenor_bucket: string;
  min_amount: number | null;
  interest_rate: number;
  channel: string;
  special_qualifiers: string;
  review_date: string | null;
  deposit_page_url: string;
  status: string;
};

export type LatestRatesResponse = {
  snapshot_date: string | null;
  total: number;
  items: RateItem[];
};

export type RateHistoryResponse = {
  snapshots: LatestRatesResponse[];
};

export type BidRateHkdPoint = {
  rate_date: string;
  tenor: string;
  bid_rate: number;
};

export type BidRateHkdResponse = {
  items: BidRateHkdPoint[];
};

export type DashboardBootstrapResponse = {
  summary: SummaryResponse;
  snapshot_dates: string[];
  filters: FiltersResponse;
  latest_rates: LatestRatesResponse;
};

export type AiSummaryResponse = {
  snapshot_date: string | null;
  summary_type: string;
  tmd_type: string;
  currency: string;
  model_name: string;
  prompt_version: string;
  status: string;
  content_markdown: string;
  generated_at: string | null;
};
