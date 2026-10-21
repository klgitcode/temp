from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db_session
from app.schemas.rates import BankResponse
from app.services.rates_service import get_banks


router = APIRouter(prefix="/banks", tags=["banks"])


@router.get("", response_model=list[BankResponse])
def read_banks(session: Session = Depends(get_db_session)) -> list[BankResponse]:
    return [BankResponse.model_validate(row) for row in get_banks(session)]
