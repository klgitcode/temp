from __future__ import annotations

import csv
from functools import lru_cache
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

WEB_MIN_SNAPSHOT_DATE = "2026-04-30"
PROJECT_ROOT = Path(__file__).resolve().parents[3]
SOURCE_REGISTRY_PATH = PROJECT_ROOT / "input" / "Source Registry 20260417.csv"


def is_snapshot_visible(snapshot_date: str | None) -> bool:
    return bool(snapshot_date and snapshot_date >= WEB_MIN_SNAPSHOT_DATE)


def get_latest_snapshot_date(session: Session) -> str | None:
    query = text(
        """
        select max(snapshot_date)::text as snapshot_date
        from rate_snapshots
        where snapshot_date >= cast(:min_snapshot_date as date)
        """
    )
    row = session.execute(query, {"min_snapshot_date": WEB_MIN_SNAPSHOT_DATE}).mappings().first()
    return row["snapshot_date"] if row and row["snapshot_date"] else None


def get_snapshot_dates(session: Session) -> list[str]:
    query = text(
        """
        select distinct snapshot_date::text as snapshot_date
        from rate_snapshots
        where snapshot_date >= cast(:min_snapshot_date as date)
        order by snapshot_date asc
        """
    )
    return [row["snapshot_date"] for row in session.execute(query, {"min_snapshot_date": WEB_MIN_SNAPSHOT_DATE}).mappings()]


def get_summary(session: Session) -> dict[str, Any]:
    latest_snapshot_date = get_latest_snapshot_date(session)
    if not latest_snapshot_date:
        return {
            "snapshot_date": None,
            "bank_count": 0,
            "currency_count": 0,
            "record_count": 0,
            "best_rates": [],
        }

    stats_query = text(
        """
        select
            count(*)::int as record_count,
            count(distinct bank_code)::int as bank_count,
            count(distinct currency)::int as currency_count
        from rate_snapshots
        where snapshot_date = :snapshot_date
          and snapshot_date >= cast(:min_snapshot_date as date)
        """
    )
    stats = session.execute(stats_query, {"snapshot_date": latest_snapshot_date, "min_snapshot_date": WEB_MIN_SNAPSHOT_DATE}).mappings().one()

    return {
        "snapshot_date": latest_snapshot_date,
        "bank_count": stats["bank_count"],
        "currency_count": stats["currency_count"],
        "record_count": stats["record_count"],
        "best_rates": [],
    }


def get_latest_rates(
    session: Session,
    *,
    snapshot_date: str | None = None,
    currency: str | None = None,
    tenor: str | None = None,
    bank_code: str | None = None,
    customer_segment: str | None = None,
    tmd_type: str | None = None,
    sort_by: str = "interest_rate",
    sort_order: str = "desc",
) -> dict[str, Any]:
    effective_snapshot_date = snapshot_date or get_latest_snapshot_date(session)
    if not effective_snapshot_date or not is_snapshot_visible(effective_snapshot_date):
        return {"snapshot_date": None, "total": 0, "items": []}

    allowed_sort_columns = {
        "interest_rate": "interest_rate",
        "bank_name_en": "bank_name_en",
        "min_amount": "min_amount",
        "currency": "currency",
        "tenor": "tenor",
    }
    order_column = allowed_sort_columns.get(sort_by, "interest_rate")
    order_direction = "asc" if sort_order.lower() == "asc" else "desc"

    filters = ["snapshot_date = :snapshot_date", "snapshot_date >= cast(:min_snapshot_date as date)"]
    params: dict[str, Any] = {"snapshot_date": effective_snapshot_date}
    params["min_snapshot_date"] = WEB_MIN_SNAPSHOT_DATE

    if currency:
        filters.append("currency = :currency")
        params["currency"] = currency
    if tenor:
        filters.append("tenor = :tenor")
        params["tenor"] = tenor
    if bank_code:
        filters.append("bank_code = :bank_code")
        params["bank_code"] = bank_code
    if customer_segment:
        filters.append("customer_segment = :customer_segment")
        params["customer_segment"] = customer_segment
    if tmd_type:
        filters.append("tmd_type = :tmd_type")
        params["tmd_type"] = tmd_type

    where_clause = " and ".join(filters)
    query = text(
        f"""
        select
            bank_code,
            bank_name_en,
            tmd_type,
            customer_segment,
            currency,
            tenor,
            tenor_bucket,
            min_amount,
            interest_rate,
            channel,
            special_qualifiers,
            review_date,
            deposit_page_url,
            status
        from rate_snapshots
        where {where_clause}
        order by {order_column} {order_direction}, bank_name_en asc, tenor asc
        """
    )
    items = [dict(row) for row in session.execute(query, params).mappings()]

    return {
        "snapshot_date": effective_snapshot_date,
        "total": len(items),
        "items": items,
    }


def get_rate_history(session: Session) -> dict[str, Any]:
    snapshot_dates = get_snapshot_dates(session)
    if not snapshot_dates:
        return {"snapshots": []}

    query = text(
        """
        with ranked_rows as (
            select
                snapshot_date::text as snapshot_date,
                bank_code,
                bank_name_en,
                tmd_type,
                customer_segment,
                currency,
                tenor,
                tenor_bucket,
                min_amount,
                interest_rate,
                channel,
                special_qualifiers,
                review_date,
                deposit_page_url,
                status,
                row_number() over (
                    partition by snapshot_date, bank_code, bank_name_en, tmd_type, currency, tenor
                    order by interest_rate desc, min_amount asc nulls last, review_date desc nulls last
                ) as row_priority
            from rate_snapshots
            where snapshot_date = any(cast(:snapshot_dates as date[]))
              and snapshot_date >= cast(:min_snapshot_date as date)
        )
        select
            snapshot_date,
            bank_code,
            bank_name_en,
            tmd_type,
            customer_segment,
            currency,
            tenor,
            tenor_bucket,
            min_amount,
            interest_rate,
            channel,
            special_qualifiers,
            review_date,
            deposit_page_url,
            status
        from ranked_rows
        where row_priority = 1
        order by snapshot_date asc, bank_name_en asc, currency asc, tenor asc, min_amount asc nulls first
        """
    )
    rows = session.execute(query, {"snapshot_dates": snapshot_dates, "min_snapshot_date": WEB_MIN_SNAPSHOT_DATE}).mappings().all()

    snapshots: dict[str, dict[str, Any]] = {
        snapshot_date: {
            "snapshot_date": snapshot_date,
            "total": 0,
            "items": [],
        }
        for snapshot_date in snapshot_dates
    }

    for row in rows:
        snapshot = snapshots[row["snapshot_date"]]
        snapshot["items"].append(dict(row))

    for snapshot in snapshots.values():
        snapshot["total"] = len(snapshot["items"])

    return {"snapshots": [snapshots[snapshot_date] for snapshot_date in snapshot_dates]}


def get_newfund_hkd_history(session: Session) -> dict[str, Any]:
    return get_newfund_history(session, currency="HKD")


NEWFUND_VIEW_BY_CURRENCY = {
    "HKD": "mv_newfund_hkd",
    "USD": "mv_newfund_usd",
    "RMB": "mv_newfund_cny",
    "CNY": "mv_newfund_cny",
    "AUD": "mv_newfund_aud",
}


def get_newfund_history(session: Session, *, currency: str) -> dict[str, Any]:
    requested_currency = currency.upper()
    normalized_currency = "RMB" if requested_currency == "CNY" else requested_currency
    view_name = NEWFUND_VIEW_BY_CURRENCY.get(requested_currency)
    if view_name is None:
        raise ValueError(f"Unsupported New Fund currency: {currency}")
    return get_dashboard_materialized_history(session, view_name=view_name, currency=normalized_currency)


def get_fxtmd_history(session: Session) -> dict[str, Any]:
    return get_dashboard_materialized_history(session, view_name="mv_fxtmd")


def get_bid_rate_hkd_history(session: Session, *, tenor: str = "overnight") -> dict[str, Any]:
    query = text(
        """
        select
            rate_date::text as rate_date,
            tenor,
            bid_rate
        from bid_rate_hkd
        where rate_date >= cast(:min_snapshot_date as date)
          and lower(tenor) = lower(:tenor)
        order by rate_date asc
        """
    )
    rows = session.execute(query, {"min_snapshot_date": WEB_MIN_SNAPSHOT_DATE, "tenor": tenor}).mappings().all()
    return {"items": [dict(row) for row in rows]}


@lru_cache(maxsize=1)
def get_bank_tmd_urls() -> dict[tuple[str, str], str]:
    if not SOURCE_REGISTRY_PATH.exists():
        return {}

    urls: dict[tuple[str, str], str] = {}
    with SOURCE_REGISTRY_PATH.open(newline="", encoding="utf-8-sig") as source_file:
        for row in csv.DictReader(source_file):
            bank_code = (row.get("bank_code") or "").strip()
            tmd_type = (row.get("tmd_type") or "").strip()
            deposit_page_url = (row.get("deposit_page_url") or "").strip()
            if bank_code and tmd_type and deposit_page_url:
                urls.setdefault((bank_code, tmd_type), deposit_page_url)
    return urls


def get_dashboard_materialized_history(session: Session, *, view_name: str, currency: str | None = None) -> dict[str, Any]:
    allowed_views = {
        "mv_newfund_hkd",
        "mv_newfund_usd",
        "mv_newfund_cny",
        "mv_newfund_aud",
        "mv_fxtmd",
    }
    if view_name not in allowed_views:
        raise ValueError(f"Unsupported dashboard materialized view: {view_name}")

    filters = ["v.snapshot_date >= cast(:min_snapshot_date as date)"]
    params: dict[str, Any] = {"min_snapshot_date": WEB_MIN_SNAPSHOT_DATE}
    if currency:
        filters.append("v.currency = :currency")
        params["currency"] = currency
    where_clause = " and ".join(filters)

    query = text(
        f"""
        select
            v.snapshot_date::text as snapshot_date,
            v.bank_code,
            v.bank_name_en,
            v.tmd_type,
            'Best available' as customer_segment,
            v.currency,
            v.tenor,
            v.tenor_bucket,
            v.min_amount,
            v.interest_rate,
            '' as channel,
            '' as special_qualifiers,
            v.snapshot_date as review_date,
            '' as deposit_page_url,
            'aggregated' as status
        from {view_name} v
        where {where_clause}
        order by v.snapshot_date asc, v.bank_name_en asc, v.currency asc, v.tenor_bucket asc
        """
    )
    rows = session.execute(query, params).mappings().all()
    bank_tmd_urls = get_bank_tmd_urls()
    snapshots: dict[str, dict[str, Any]] = {}

    for row in rows:
        item = dict(row)
        item["deposit_page_url"] = bank_tmd_urls.get((item["bank_code"], item["tmd_type"]), "")
        snapshot_date = row["snapshot_date"]
        if snapshot_date not in snapshots:
            snapshots[snapshot_date] = {
                "snapshot_date": snapshot_date,
                "total": 0,
                "items": [],
            }
        snapshots[snapshot_date]["items"].append(item)

    for snapshot in snapshots.values():
        snapshot["total"] = len(snapshot["items"])

    return {"snapshots": list(snapshots.values())}


def get_filter_options(session: Session, *, snapshot_date: str | None = None) -> dict[str, Any]:
    effective_snapshot_date = snapshot_date or get_latest_snapshot_date(session)
    if not effective_snapshot_date or not is_snapshot_visible(effective_snapshot_date):
        return {
            "snapshot_date": None,
            "currencies": [],
            "tenors": [],
            "banks": [],
            "customer_segments": [],
            "tmd_types": [],
        }

    query = text(
        """
        select
            currency,
            tenor,
            bank_code,
            bank_name_en,
            customer_segment,
            tmd_type
        from rate_snapshots
        where snapshot_date = :snapshot_date
          and snapshot_date >= cast(:min_snapshot_date as date)
        """
    )
    rows = session.execute(query, {"snapshot_date": effective_snapshot_date, "min_snapshot_date": WEB_MIN_SNAPSHOT_DATE}).mappings().all()

    def _sorted_options(items: set[tuple[str, str]]) -> list[dict[str, str]]:
        return [{"value": value, "label": label} for value, label in sorted(items, key=lambda item: item[1])]

    return {
        "snapshot_date": effective_snapshot_date,
        "currencies": _sorted_options({(row["currency"], row["currency"]) for row in rows}),
        "tenors": _sorted_options({(row["tenor"], row["tenor"]) for row in rows}),
        "banks": _sorted_options({(row["bank_code"], row["bank_name_en"]) for row in rows}),
        "customer_segments": _sorted_options({(row["customer_segment"], row["customer_segment"]) for row in rows}),
        "tmd_types": _sorted_options({(row["tmd_type"], row["tmd_type"]) for row in rows}),
    }


def get_banks(session: Session) -> list[dict[str, Any]]:
    query = text(
        """
        select bank_code, bank_name_en, official_domain
        from banks
        where is_active = true
        order by bank_name_en asc
        """
    )
    return [dict(row) for row in session.execute(query).mappings()]
