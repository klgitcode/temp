from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.database import get_db_session
from app.schemas.rates import (
    AiSummaryResponse,
    BidRateHkdResponse,
    DashboardBootstrapResponse,
    LatestRatesResponse,
    RateHistoryResponse,
    SnapshotDatesResponse,
    SummaryResponse,
)
from app.services.ai_summary_service import get_latest_ai_summary
from app.services.rates_service import (
    get_filter_options,
    get_bid_rate_hkd_history,
    get_fxtmd_history,
    get_latest_rates,
    get_newfund_history,
    get_newfund_hkd_history,
    get_rate_history,
    get_snapshot_dates,
    get_summary,
)


router = APIRouter(prefix="/rates", tags=["rates"])


@router.get("/summary", response_model=SummaryResponse)
def read_summary(session: Session = Depends(get_db_session)) -> SummaryResponse:
    payload = get_summary(session)
    return SummaryResponse.model_validate(payload)


@router.get("/ai-summary/latest", response_model=AiSummaryResponse)
def read_latest_ai_summary(
    snapshot_date: str | None = None,
    tmd_type: str = Query(default="New Fund", pattern="^(New Fund|FX TMD)$"),
    currency: str = Query(default="HKD", pattern="^(HKD|USD|RMB|CNY|AUD|ALL)$"),
    session: Session = Depends(get_db_session),
) -> AiSummaryResponse:
    payload = get_latest_ai_summary(session, snapshot_date=snapshot_date, tmd_type=tmd_type, currency=currency)
    if payload is None:
        return AiSummaryResponse()
    return AiSummaryResponse.model_validate(payload)


@router.get("/latest", response_model=LatestRatesResponse)
def read_latest_rates(
    snapshot_date: str | None = None,
    currency: str | None = None,
    tenor: str | None = None,
    bank_code: str | None = None,
    customer_segment: str | None = None,
    tmd_type: str | None = None,
    sort_by: str = Query(default="interest_rate"),
    sort_order: str = Query(default="desc"),
    session: Session = Depends(get_db_session),
) -> LatestRatesResponse:
    payload = get_latest_rates(
        session,
        snapshot_date=snapshot_date,
        currency=currency,
        tenor=tenor,
        bank_code=bank_code,
        customer_segment=customer_segment,
        tmd_type=tmd_type,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return LatestRatesResponse.model_validate(payload)


@router.get("/snapshots", response_model=SnapshotDatesResponse)
def read_snapshot_dates(session: Session = Depends(get_db_session)) -> SnapshotDatesResponse:
    snapshot_dates = get_snapshot_dates(session)
    return SnapshotDatesResponse(snapshot_dates=snapshot_dates)


@router.get("/history", response_model=RateHistoryResponse)
def read_rate_history(session: Session = Depends(get_db_session)) -> RateHistoryResponse:
    payload = get_rate_history(session)
    return RateHistoryResponse.model_validate(payload)


@router.get("/newfund-hkd", response_model=RateHistoryResponse)
def read_newfund_hkd_history(session: Session = Depends(get_db_session)) -> RateHistoryResponse:
    payload = get_newfund_hkd_history(session)
    return RateHistoryResponse.model_validate(payload)


@router.get("/newfund", response_model=RateHistoryResponse)
def read_newfund_history(
    currency: str = Query(default="HKD", pattern="^(HKD|USD|RMB|CNY|AUD)$"),
    session: Session = Depends(get_db_session),
) -> RateHistoryResponse:
    payload = get_newfund_history(session, currency=currency)
    return RateHistoryResponse.model_validate(payload)


@router.get("/bid-rate-hkd", response_model=BidRateHkdResponse)
def read_bid_rate_hkd_history(
    tenor: str = Query(default="overnight"),
    session: Session = Depends(get_db_session),
) -> BidRateHkdResponse:
    payload = get_bid_rate_hkd_history(session, tenor=tenor)
    return BidRateHkdResponse.model_validate(payload)


@router.get("/fxtmd", response_model=RateHistoryResponse)
def read_fxtmd_history(session: Session = Depends(get_db_session)) -> RateHistoryResponse:
    payload = get_fxtmd_history(session)
    return RateHistoryResponse.model_validate(payload)


@router.get("/bootstrap", response_model=DashboardBootstrapResponse)
def read_dashboard_bootstrap(session: Session = Depends(get_db_session)) -> DashboardBootstrapResponse:
    summary = get_summary(session)
    latest_snapshot_date = summary["snapshot_date"]
    filters = get_filter_options(session, snapshot_date=latest_snapshot_date)
    latest_rates = get_latest_rates(session, snapshot_date=latest_snapshot_date)
    snapshot_dates = get_snapshot_dates(session)
    payload = {
        "summary": summary,
        "snapshot_dates": snapshot_dates,
        "filters": filters,
        "latest_rates": latest_rates,
    }
    return DashboardBootstrapResponse.model_validate(payload)
