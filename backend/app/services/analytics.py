"""Exact monthly aggregates; SQLite SUM(integer) can overflow int64."""

from datetime import date

from sqlalchemy import and_
from sqlmodel import Session, select

from app.models import Category, Transaction
from app.schemas import (
    AnalyticsByCategory,
    AnalyticsInsights,
    AnalyticsSummary,
    CashFlowInsight,
    CategoryExpense,
    MoMComparison,
    TopCategoryInsight,
)


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


def calc_percentage_str(numerator: int, denominator: int) -> str:
    """Exact half-up percentage string to two decimals without float."""
    if denominator <= 0:
        return "0.00"
    hundredths = (numerator * 20000 + denominator) // (2 * denominator)
    return f"{hundredths // 100}.{hundredths % 100:02d}"


def monthly_insights(
    session: Session, owner_id: int, month: int, year: int
) -> AnalyticsInsights:
    current_sum = monthly_summary(session, owner_id, month, year)
    current_cat = monthly_category_expenses(session, owner_id, month, year)

    # Calculate previous period
    prev_month = 12 if month == 1 else month - 1
    prev_year = year - 1 if month == 1 else year
    prev_sum = monthly_summary(session, owner_id, prev_month, prev_year)

    # 1. MoM Comparison
    curr_exp = current_sum.expense
    prev_exp = prev_sum.expense
    if prev_exp > 0:
        diff = curr_exp - prev_exp
        pct_str = calc_percentage_str(abs(diff), prev_exp)
        if diff > 0:
            direction = "up"
        elif diff < 0:
            direction = "down"
        else:
            direction = "equal"
        comparison = MoMComparison(
            has_baseline=True,
            previous_expense=str(prev_exp),
            difference=str(diff),
            percentage=pct_str,
            direction=direction,
        )
    else:
        comparison = MoMComparison(
            has_baseline=False,
            previous_expense=None,
            difference=None,
            percentage=None,
            direction="no_baseline",
        )

    # 2. Top Category
    if current_cat.items:
        top_item = current_cat.items[0]
        top_pct = calc_percentage_str(top_item.expense, curr_exp) if curr_exp > 0 else "0.00"
        top_category = TopCategoryInsight(
            has_data=True,
            category_id=top_item.category_id,
            category_name=top_item.category_name,
            expense=str(top_item.expense),
            percentage_of_total=top_pct,
        )
    else:
        top_category = TopCategoryInsight(
            has_data=False,
            category_id=None,
            category_name=None,
            expense=None,
            percentage_of_total=None,
        )

    # 3. Cash Flow Health
    inc = current_sum.income
    net = current_sum.net_cash_flow
    if inc == 0 and curr_exp == 0:
        cf_status = "no_activity"
        savings_pct = None
    elif net > 0:
        cf_status = "surplus"
        savings_pct = calc_percentage_str(net, inc) if inc > 0 else None
    elif net < 0:
        cf_status = "deficit"
        savings_pct = None
    else:
        cf_status = "balanced"
        savings_pct = "0.00" if inc > 0 else None

    cash_flow = CashFlowInsight(
        status=cf_status,
        savings_rate_percentage=savings_pct,
    )

    # 4. Narratives
    narratives: list[str] = []
    if comparison.has_baseline and comparison.percentage is not None:
        if comparison.direction == "up":
            narratives.append(f"Pengeluaran naik {comparison.percentage}% dibanding bulan lalu.")
        elif comparison.direction == "down":
            narratives.append(f"Pengeluaran hemat {comparison.percentage}% dibanding bulan lalu.")
        else:
            narratives.append("Pengeluaran stabil sama persis dengan bulan lalu.")
    else:
        narratives.append("Belum ada data pengeluaran bulan sebelumnya sebagai pembanding.")

    if top_category.has_data and top_category.category_name:
        narratives.append(
            f"Kategori terbesar bulan ini adalah {top_category.category_name} "
            f"({top_category.percentage_of_total}% dari total pengeluaran)."
        )

    if cash_flow.status == "surplus" and cash_flow.savings_rate_percentage:
        narratives.append(f"Tingkat tabungan (savings rate) mencapai {cash_flow.savings_rate_percentage}%.")
    elif cash_flow.status == "deficit":
        narratives.append("Arus kas defisit: pengeluaran melampaui pemasukan bulan ini.")

    return AnalyticsInsights(
        month=month,
        year=year,
        comparison=comparison,
        top_category=top_category,
        cash_flow=cash_flow,
        narratives=narratives,
    )
