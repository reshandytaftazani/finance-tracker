"""Synchronous monthly budget CRUD and exact owner-scoped spending status."""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import func
from sqlmodel import select

from app.api.common import (
    OwnerDep,
    PageNumber,
    PageSize,
    ResourceID,
    SessionDep,
    commit_or_conflict,
    find_category,
)
from app.models import Budget, utc_now
from app.schemas import (
    BudgetCreate,
    BudgetPage,
    BudgetRead,
    BudgetStatus,
    BudgetStatusItem,
    BudgetUpdate,
)
from app.services.analytics import monthly_category_expenses

router = APIRouter(prefix="/api/v1/budgets", tags=["budgets"])
MonthQuery = Annotated[int, Query(ge=1, le=12)]
YearQuery = Annotated[int, Query(ge=1, le=9999)]


def find_budget(session, owner_id, budget_id):
    budget = session.exec(
        select(Budget).where(Budget.owner_id == owner_id, Budget.id == budget_id)
    ).first()
    if budget is None:
        raise HTTPException(status_code=404, detail="Budget not found")
    return budget


def validate_expense_category(session, owner_id, category_id):
    category = find_category(session, owner_id, category_id)
    if category.type != "expense":
        raise HTTPException(
            status_code=422, detail="Budget requires an expense category"
        )


@router.get("", response_model=BudgetPage)
def list_budgets(
    session: SessionDep,
    owner: OwnerDep,
    month: MonthQuery | None = None,
    year: YearQuery | None = None,
    category_id: Annotated[int | None, Query(ge=1, le=2**63 - 1)] = None,
    page: PageNumber = 1,
    page_size: PageSize = 20,
):
    predicates = [Budget.owner_id == owner.id]
    if month is not None:
        predicates.append(Budget.month == month)
    if year is not None:
        predicates.append(Budget.year == year)
    if category_id is not None:
        find_category(session, owner.id, category_id)
        predicates.append(Budget.category_id == category_id)
    total = session.exec(
        select(func.count()).select_from(Budget).where(*predicates)
    ).one()
    items = session.exec(
        select(Budget)
        .where(*predicates)
        .order_by(Budget.year.desc(), Budget.month.desc(), Budget.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("", response_model=BudgetRead, status_code=201)
def create_budget(payload: BudgetCreate, session: SessionDep, owner: OwnerDep):
    validate_expense_category(session, owner.id, payload.category_id)
    budget = Budget(owner_id=owner.id, **payload.model_dump())
    session.add(budget)
    commit_or_conflict(session)
    session.refresh(budget)
    return budget


@router.get("/status", response_model=BudgetStatus)
def budget_status(
    session: SessionDep, owner: OwnerDep, month: MonthQuery, year: YearQuery
):
    budgets = session.exec(
        select(Budget)
        .where(Budget.owner_id == owner.id, Budget.month == month, Budget.year == year)
        .order_by(Budget.id)
    ).all()
    expenses = {
        item.category_id: item.expense
        for item in monthly_category_expenses(session, owner.id, month, year).items
    }
    items = []
    for budget in budgets:
        spent = expenses.get(budget.category_id, 0)
        amount = budget.amount_rupiah
        # Half-up rounding to hundredths of a percent; never convert money to float.
        hundredths = (spent * 20000 + amount) // (2 * amount)
        status = (
            "over_budget"
            if spent >= amount
            else "warning"
            if spent * 100 >= amount * 80
            else "normal"
        )
        category = find_category(session, owner.id, budget.category_id)
        items.append(
            BudgetStatusItem(
                id=budget.id,
                category_id=budget.category_id,
                category_name=category.name,
                budget=amount,
                spent=spent,
                remaining=amount - spent,
                percentage=f"{hundredths // 100}.{hundredths % 100:02d}",
                status=status,
            )
        )
    return BudgetStatus(month=month, year=year, items=items)


@router.get("/{budget_id}", response_model=BudgetRead)
def read_budget(budget_id: ResourceID, session: SessionDep, owner: OwnerDep):
    return find_budget(session, owner.id, budget_id)


@router.patch("/{budget_id}", response_model=BudgetRead)
def update_budget(
    budget_id: ResourceID, payload: BudgetUpdate, session: SessionDep, owner: OwnerDep
):
    budget = find_budget(session, owner.id, budget_id)
    changes = payload.model_dump(exclude_unset=True)
    if changes:
        validate_expense_category(
            session, owner.id, changes.get("category_id", budget.category_id)
        )
        budget.sqlmodel_update(changes)
        budget.updated_at = utc_now()
        session.add(budget)
        commit_or_conflict(session)
        session.refresh(budget)
    return budget


@router.delete("/{budget_id}", status_code=204)
def delete_budget(budget_id: ResourceID, session: SessionDep, owner: OwnerDep):
    budget = find_budget(session, owner.id, budget_id)
    session.delete(budget)
    commit_or_conflict(session)
    return Response(status_code=204)
