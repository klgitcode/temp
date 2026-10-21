from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field


class RateItem(BaseModel):
    bank_code: str
    bank_name_en: str
    tmd_type: str
    customer_segment: str
    currency: str
    tenor: str
    tenor_bucket: str = ""
    min_amount: float | None = None
    interest_rate: float
    channel: str = ""
    special_qualifiers: str = ""
    review_date: date | None = None
    deposit_page_url: str = ""
    status: str = ""


class LatestRatesResponse(BaseModel):
    snapshot_date: date | None = None
    total: int
    items: list[RateItem]


class BestRateCard(BaseModel):
    currency: str
    bank_code: str
    bank_name_en: str
    interest_rate: float
    tenor: str
    customer_segment: str
    min_amount: float | None = None


class SummaryResponse(BaseModel):
    snapshot_date: date | None = None
    bank_count: int = 0
    currency_count: int = 0
    record_count: int = 0
    best_rates: list[BestRateCard] = Field(default_factory=list)


class SnapshotDatesResponse(BaseModel):
    snapshot_dates: list[date] = Field(default_factory=list)


class RateHistoryResponse(BaseModel):
    snapshots: list[LatestRatesResponse] = Field(default_factory=list)


class BidRateHkdPoint(BaseModel):
    rate_date: date
    tenor: str
    bid_rate: float


class BidRateHkdResponse(BaseModel):
    items: list[BidRateHkdPoint] = Field(default_factory=list)


class FilterOption(BaseModel):
    label: str
    value: str


class FiltersResponse(BaseModel):
    snapshot_date: date | None = None
    currencies: list[FilterOption] = Field(default_factory=list)
    tenors: list[FilterOption] = Field(default_factory=list)
    banks: list[FilterOption] = Field(default_factory=list)
    customer_segments: list[FilterOption] = Field(default_factory=list)
    tmd_types: list[FilterOption] = Field(default_factory=list)


class BankResponse(BaseModel):
    bank_code: str
    bank_name_en: str
    official_domain: str | None = None


class DashboardBootstrapResponse(BaseModel):
    summary: SummaryResponse
    snapshot_dates: list[date] = Field(default_factory=list)
    filters: FiltersResponse
    latest_rates: LatestRatesResponse


class AiSummaryResponse(BaseModel):
    snapshot_date: date | None = None
    summary_type: str = "daily_market_summary"
    tmd_type: str = "New Fund"
    currency: str = "HKD"
    model_name: str = ""
    prompt_version: str = ""
    status: str = ""
    content_markdown: str = ""
    generated_at: datetime | None = None
