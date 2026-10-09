"""Synchronous analytics using the same explicit month/year and server owner."""

from typing import Annotated

from fastapi import APIRouter, Query

from app.api.common import OwnerDep, SessionDep
from app.schemas import AnalyticsByCategory, AnalyticsSummary
from app.services.analytics import monthly_category_expenses, monthly_summary

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])
Month = Annotated[int, Query(ge=1, le=12)]
Year = Annotated[int, Query(ge=1, le=9999)]


@router.get("/summary", response_model=AnalyticsSummary)
def summary(session: SessionDep, owner: OwnerDep, month: Month, year: Year):
    return monthly_summary(session, owner.id, month, year)


@router.get("/by-category", response_model=AnalyticsByCategory)
def by_category(session: SessionDep, owner: OwnerDep, month: Month, year: Year):
    return monthly_category_expenses(session, owner.id, month, year)
