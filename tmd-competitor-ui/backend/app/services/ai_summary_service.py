from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.rates_service import get_latest_snapshot_date


def normalize_summary_currency(currency: str) -> str:
    normalized_currency = currency.upper()
    if normalized_currency == "ALL":
        return normalized_currency
    return "RMB" if normalized_currency == "CNY" else normalized_currency


def get_latest_ai_summary(
    session: Session,
    *,
    snapshot_date: str | None = None,
    summary_type: str = "daily_market_summary",
    tmd_type: str = "New Fund",
    currency: str = "HKD",
) -> dict[str, Any] | None:
    effective_snapshot_date = snapshot_date or get_latest_snapshot_date(session)
    if not effective_snapshot_date:
        return None
    normalized_currency = normalize_summary_currency(currency)

    query = text(
        """
        select
            snapshot_date::text as snapshot_date,
            summary_type,
            tmd_type,
            currency,
            model_name,
            prompt_version,
            status,
            content_markdown,
            generated_at
        from ai_summaries
        where snapshot_date = :snapshot_date
          and summary_type = :summary_type
          and tmd_type = :tmd_type
          and currency = :currency
        order by generated_at desc
        limit 1
        """
    )
    row = session.execute(
        query,
        {
            "snapshot_date": effective_snapshot_date,
            "summary_type": summary_type,
            "tmd_type": tmd_type,
            "currency": normalized_currency,
        },
    ).mappings().first()
    return dict(row) if row else None
