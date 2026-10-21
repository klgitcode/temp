from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db_session
from app.schemas.rates import FiltersResponse
from app.services.rates_service import get_filter_options


router = APIRouter(tags=["filters"])


@router.get("/filters", response_model=FiltersResponse)
def read_filters(snapshot_date: str | None = None, session: Session = Depends(get_db_session)) -> FiltersResponse:
    payload = get_filter_options(session, snapshot_date=snapshot_date)
    return FiltersResponse.model_validate(payload)
