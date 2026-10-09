"""Exact monthly aggregates; SQLite SUM(integer) can overflow int64."""

from datetime import date

from sqlalchemy import and_
from sqlmodel import Session, select

from app.models import Category, Transaction
from app.schemas import AnalyticsByCategory, AnalyticsSummary, CategoryExpense


def monthly_predicates(owner_id: int, month: int, year: int):
    """Index-friendly calendar range shared by every monthly aggregate."""
    predicates = [
        Transaction.owner_id == owner_id,
        Transaction.date >= date(year, month, 1),
    ]
    if year == 9999 and month == 12:
        # There is no representable first day of year 10000.
        predicates.append(Transaction.date <= date.max)
    else:
        next_month = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
        predicates.append(Transaction.date < next_month)
    return predicates


def monthly_summary(
    session: Session, owner_id: int, month: int, year: int
) -> AnalyticsSummary:
    income = expense = 0
    rows = session.exec(
        select(Transaction.type, Transaction.amount_rupiah)
        .where(*monthly_predicates(owner_id, month, year))
    )
    for kind, amount in rows:
        if kind == "income":
            income += amount
        else:
            expense += amount
    return AnalyticsSummary(
        month=month, year=year, income=income, expense=expense,
        net_cash_flow=income - expense,
    )


def monthly_category_expenses(
    session: Session, owner_id: int, month: int, year: int
) -> AnalyticsByCategory:
    rows = session.exec(
        select(Category.id, Category.name, Transaction.amount_rupiah)
        .select_from(Transaction)
        .join(Category, and_(
            Category.owner_id == Transaction.owner_id,
            Category.id == Transaction.category_id,
            Category.type == Transaction.type,
        ))
        .where(*monthly_predicates(owner_id, month, year), Transaction.type == "expense")
    )
    totals: dict[tuple[int, str], int] = {}
    for category_id, name, amount in rows:
        key = (category_id, name)
        totals[key] = totals.get(key, 0) + amount
    items = [
        CategoryExpense(category_id=category_id, category_name=name, expense=amount)
        for (category_id, name), amount in totals.items()
    ]
    items.sort(key=lambda item: (-item.expense, item.category_id))
    return AnalyticsByCategory(month=month, year=year, items=items)
