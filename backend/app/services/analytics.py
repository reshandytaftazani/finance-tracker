"""Exact monthly aggregates; SQLite SUM(integer) can overflow int64."""

from datetime import date

from sqlalchemy import and_
from sqlmodel import Session, select

from app.models import Category, Transaction
from app.schemas import (
    AnalyticsByCategory,
    AnalyticsForecast,
    AnalyticsInsights,
    AnalyticsSummary,
    BacktestEvaluation,
    CashFlowInsight,
    CategoryExpense,
    HistoricalMonthExpense,
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


def previous_calendar_month(month: int, year: int) -> tuple[int, int]:
    return (12, year - 1) if month == 1 else (month - 1, year)


def get_prior_months(month: int, year: int, count: int) -> list[tuple[int, int]]:
    """Returns prior calendar months in chronological order: [T-count, ..., T-1]."""
    cur_m, cur_y = month, year
    result: list[tuple[int, int]] = []
    for _ in range(count):
        cur_m, cur_y = previous_calendar_month(cur_m, cur_y)
        result.append((cur_m, cur_y))
    result.reverse()
    return result


def monthly_transaction_stats(
    session: Session, owner_id: int, month: int, year: int
) -> tuple[int, int]:
    """Returns (expense_rupiah, total_transaction_count)."""
    rows = session.exec(
        select(Transaction.type, Transaction.amount_rupiah).where(
            *monthly_predicates(owner_id, month, year)
        )
    )
    count = 0
    expense = 0
    for kind, amount in rows:
        count += 1
        if kind == "expense":
            expense += amount
    return expense, count


def exact_round_div(numerator: int, denominator: int) -> int:
    """Exact half-up integer division: round(numerator / denominator)."""
    if denominator <= 0:
        return 0
    return (2 * numerator + denominator) // (2 * denominator)


def monthly_forecast(
    session: Session, owner_id: int, month: int, year: int
) -> AnalyticsForecast:
    prior_3 = get_prior_months(month, year, 3)

    # 1. Fetch data for the 3 months directly preceding the target month
    historical_months: list[HistoricalMonthExpense] = []
    has_sufficient = True
    expenses: list[int] = []

    for pm, py in prior_3:
        exp, cnt = monthly_transaction_stats(session, owner_id, pm, py)
        historical_months.append(
            HistoricalMonthExpense(
                month=pm,
                year=py,
                expense=str(exp),
                transaction_count=cnt,
            )
        )
        if cnt == 0:
            has_sufficient = False
        expenses.append(exp)

    if not has_sufficient:
        return AnalyticsForecast(
            month=month,
            year=year,
            status="insufficient_data",
            message="Dibutuhkan minimal 3 bulan riwayat transaksi berturut-turut untuk menghasilkan proyeksi.",
            has_sufficient_data=False,
            historical_months=historical_months,
            forecast_expense=None,
            baseline_expense=None,
            evaluation=None,
        )

    # 2. Compute 3-Month Moving Average & Naive Baseline
    # prior_3 is [T-3, T-2, T-1], expenses is [E3, E2, E1]
    e_sum = sum(expenses)
    ma3_forecast = exact_round_div(e_sum, 3)
    baseline_naive = expenses[-1]  # E_{t-1}

    # 3. Temporal Backtesting (Strictly on history prior to target month)
    earliest_tx = session.exec(
        select(Transaction.date)
        .where(Transaction.owner_id == owner_id)
        .order_by(Transaction.date.asc())
        .limit(1)
    ).first()

    backtest_eval: BacktestEvaluation | None = None
    if earliest_tx is not None:
        start_year = earliest_tx.year
        start_month = earliest_tx.month

        # Collect candidate historical evaluation months strictly before target
        candidate_test_months: list[tuple[int, int]] = []
        cur_m, cur_y = previous_calendar_month(month, year)
        while True:
            if cur_y < start_year or (cur_y == start_year and cur_m < start_month):
                break
            candidate_test_months.append((cur_m, cur_y))
            if len(candidate_test_months) >= 12:
                break
            cur_m, cur_y = previous_calendar_month(cur_m, cur_y)

        # For each candidate test month k, check if k has 3 preceding months with data
        ma_errors: list[int] = []
        naive_errors: list[int] = []

        for tm, ty in candidate_test_months:
            k_prior_3 = get_prior_months(tm, ty, 3)
            k_expenses: list[int] = []
            k_sufficient = True
            for kpm, kpy in k_prior_3:
                k_exp, k_cnt = monthly_transaction_stats(session, owner_id, kpm, kpy)
                if k_cnt == 0:
                    k_sufficient = False
                    break
                k_expenses.append(k_exp)

            if k_sufficient and len(k_expenses) == 3:
                actual_exp, actual_cnt = monthly_transaction_stats(session, owner_id, tm, ty)
                if actual_cnt > 0:
                    k_ma3_pred = exact_round_div(sum(k_expenses), 3)
                    k_naive_pred = k_expenses[-1]
                    ma_errors.append(abs(actual_exp - k_ma3_pred))
                    naive_errors.append(abs(actual_exp - k_naive_pred))

        if len(ma_errors) > 0:
            test_count = len(ma_errors)
            ma_mae = exact_round_div(sum(ma_errors), test_count)
            naive_mae = exact_round_div(sum(naive_errors), test_count)
            if ma_mae < naive_mae:
                better = "ma3"
                explanation = (
                    f"Model Moving Average 3-bulan lebih akurat dengan rata-rata galat (MAE) "
                    f"Rp {ma_mae} dibanding baseline naive Rp {naive_mae} pada {test_count} periode historis."
                )
            elif naive_mae < ma_mae:
                better = "naive"
                explanation = (
                    f"Baseline naive (bulan sebelumnya) lebih akurat dengan rata-rata galat (MAE) "
                    f"Rp {naive_mae} dibanding Moving Average Rp {ma_mae} pada {test_count} periode historis."
                )
            else:
                better = "tie"
                explanation = (
                    f"Performa Moving Average dan baseline naive seimbang dengan rata-rata galat (MAE) "
                    f"Rp {ma_mae} pada {test_count} periode historis."
                )

            backtest_eval = BacktestEvaluation(
                has_backtest=True,
                test_points_count=test_count,
                ma_mae=str(ma_mae),
                naive_mae=str(naive_mae),
                better_model=better,
                explanation=explanation,
            )
        else:
            backtest_eval = BacktestEvaluation(
                has_backtest=False,
                test_points_count=0,
                ma_mae=None,
                naive_mae=None,
                better_model=None,
                explanation="Dibutuhkan minimal 4 bulan data representatif untuk evaluasi backtest temporal.",
            )

    return AnalyticsForecast(
        month=month,
        year=year,
        status="sufficient_data",
        message="Proyeksi berhasil dihitung menggunakan rata-rata bergerak 3 bulan.",
        has_sufficient_data=True,
        historical_months=historical_months,
        forecast_expense=str(ma3_forecast),
        baseline_expense=str(baseline_naive),
        evaluation=backtest_eval,
    )

