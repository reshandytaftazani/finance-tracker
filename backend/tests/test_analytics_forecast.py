"""Tests for 3-Month Moving Average forecasting and temporal backtesting."""

from datetime import date

import pytest
from sqlmodel import Session

from app.db import create_db_engine
from app.models import Category, Owner, Transaction
from app.services.analytics import monthly_forecast
from scripts.migrate import upgrade_database


@pytest.fixture
def forecast_db(tmp_path):
    engine = create_db_engine(f"sqlite:///{(tmp_path / 'forecast_test.db').as_posix()}")
    upgrade_database(engine, backup_dir=tmp_path / "backups")
    with Session(engine) as session:
        session.add_all([
            Owner(id=1, display_name="Owner 1"),
            Owner(id=2, display_name="Owner 2"),
        ])
        session.commit()
        session.add_all([
            Category(id=1, owner_id=1, name="Belanja", type="expense"),
            Category(id=2, owner_id=1, name="Gaji", type="income"),
            Category(id=3, owner_id=2, name="Lain", type="expense"),
        ])
        session.commit()
    return engine


def test_forecast_empty_history_returns_insufficient_data(forecast_db):
    with Session(forecast_db) as session:
        result = monthly_forecast(session, owner_id=1, month=5, year=2026)
        assert result.status == "insufficient_data"
        assert result.has_sufficient_data is False
        assert result.forecast_expense is None
        assert result.baseline_expense is None
        assert result.evaluation is None
        assert "minimal 3 bulan" in result.message.lower()


def test_forecast_less_than_3_months_returns_insufficient_data(forecast_db):
    with Session(forecast_db) as session:
        # Only 2 months recorded prior to May 2026: March and April
        session.add_all([
            Transaction(owner_id=1, category_id=1, type="expense", amount_rupiah=1000000, date=date(2026, 3, 10)),
            Transaction(owner_id=1, category_id=1, type="expense", amount_rupiah=1200000, date=date(2026, 4, 15)),
        ])
        session.commit()

        result = monthly_forecast(session, owner_id=1, month=5, year=2026)
        assert result.status == "insufficient_data"
        assert result.has_sufficient_data is False
        assert result.forecast_expense is None


def test_forecast_gap_in_history_returns_insufficient_data(forecast_db):
    with Session(forecast_db) as session:
        # February and April have transactions, but March (t-2) is empty
        session.add_all([
            Transaction(owner_id=1, category_id=1, type="expense", amount_rupiah=1000000, date=date(2026, 2, 10)),
            Transaction(owner_id=1, category_id=1, type="expense", amount_rupiah=1200000, date=date(2026, 4, 15)),
        ])
        session.commit()

        result = monthly_forecast(session, owner_id=1, month=5, year=2026)
        assert result.status == "insufficient_data"
        assert result.has_sufficient_data is False
        assert result.forecast_expense is None


def test_forecast_sufficient_data_calculates_exact_ma(forecast_db):
    with Session(forecast_db) as session:
        # Feb: 3.000.000, Mar: 4.000.000, Apr: 5.000.000
        session.add_all([
            Transaction(owner_id=1, category_id=1, type="expense", amount_rupiah=3000000, date=date(2026, 2, 5)),
            Transaction(owner_id=1, category_id=1, type="expense", amount_rupiah=4000000, date=date(2026, 3, 12)),
            Transaction(owner_id=1, category_id=1, type="expense", amount_rupiah=5000000, date=date(2026, 4, 20)),
        ])
        session.commit()

        result = monthly_forecast(session, owner_id=1, month=5, year=2026)
        assert result.status == "sufficient_data"
        assert result.has_sufficient_data is True
        assert result.forecast_expense == "4000000"
        assert result.baseline_expense == "5000000"
        assert len(result.historical_months) == 3
        # Historical months in chronological order
        assert [h.month for h in result.historical_months] == [2, 3, 4]
        assert [h.expense for h in result.historical_months] == ["3000000", "4000000", "5000000"]
        # With only 3 historical months, no backtest point is possible yet
        assert result.evaluation is not None
        assert result.evaluation.has_backtest is False


def test_forecast_integer_half_up_rounding(forecast_db):
    with Session(forecast_db) as session:
        # 10.000 + 10.000 + 10.002 = 30.002 / 3 = 10000.666... -> rounded half-up to 10001
        session.add_all([
            Transaction(owner_id=1, category_id=1, type="expense", amount_rupiah=10000, date=date(2026, 2, 1)),
            Transaction(owner_id=1, category_id=1, type="expense", amount_rupiah=10000, date=date(2026, 3, 1)),
            Transaction(owner_id=1, category_id=1, type="expense", amount_rupiah=10002, date=date(2026, 4, 1)),
        ])
        session.commit()

        result = monthly_forecast(session, owner_id=1, month=5, year=2026)
        assert result.status == "sufficient_data"
        assert result.forecast_expense == "10001"


def test_forecast_cross_year_boundary(forecast_db):
    with Session(forecast_db) as session:
        # Target: Feb 2026 (month 2). History needed: Nov 2025, Dec 2025, Jan 2026
        session.add_all([
            Transaction(owner_id=1, category_id=1, type="expense", amount_rupiah=2000000, date=date(2025, 11, 10)),
            Transaction(owner_id=1, category_id=1, type="expense", amount_rupiah=3000000, date=date(2025, 12, 15)),
            Transaction(owner_id=1, category_id=1, type="expense", amount_rupiah=4000000, date=date(2026, 1, 20)),
        ])
        session.commit()

        result = monthly_forecast(session, owner_id=1, month=2, year=2026)
        assert result.status == "sufficient_data"
        assert result.has_sufficient_data is True
        assert result.forecast_expense == "3000000"
        assert result.baseline_expense == "4000000"
        assert [(h.month, h.year) for h in result.historical_months] == [(11, 2025), (12, 2025), (1, 2026)]


def test_forecast_no_temporal_leakage(forecast_db):
    with Session(forecast_db) as session:
        session.add_all([
            Transaction(owner_id=1, category_id=1, type="expense", amount_rupiah=2000000, date=date(2026, 2, 5)),
            Transaction(owner_id=1, category_id=1, type="expense", amount_rupiah=2000000, date=date(2026, 3, 5)),
            Transaction(owner_id=1, category_id=1, type="expense", amount_rupiah=2000000, date=date(2026, 4, 5)),
            # Target month transaction (should not affect forecast for month 5)
            Transaction(owner_id=1, category_id=1, type="expense", amount_rupiah=99000000, date=date(2026, 5, 5)),
            # Future transaction
            Transaction(owner_id=1, category_id=1, type="expense", amount_rupiah=88000000, date=date(2026, 6, 5)),
        ])
        session.commit()

        result = monthly_forecast(session, owner_id=1, month=5, year=2026)
        assert result.status == "sufficient_data"
        assert result.forecast_expense == "2000000"
        assert result.baseline_expense == "2000000"


def test_forecast_backtest_with_4_months(forecast_db):
    with Session(forecast_db) as session:
        # History:
        # Jan 2026: 2.000.000
        # Feb 2026: 3.000.000
        # Mar 2026: 4.000.000
        # Apr 2026: 5.000.000
        # Target: May 2026
        # Backtest point for Apr 2026:
        #   Actual: 5.000.000
        #   Naive pred (from Mar): 4.000.000 (error = 1.000.000)
        #   MA-3 pred (from Jan, Feb, Mar): (2M+3M+4M)/3 = 3.000.000 (error = 2.000.000)
        session.add_all([
            Transaction(owner_id=1, category_id=1, type="expense", amount_rupiah=2000000, date=date(2026, 1, 15)),
            Transaction(owner_id=1, category_id=1, type="expense", amount_rupiah=3000000, date=date(2026, 2, 15)),
            Transaction(owner_id=1, category_id=1, type="expense", amount_rupiah=4000000, date=date(2026, 3, 15)),
            Transaction(owner_id=1, category_id=1, type="expense", amount_rupiah=5000000, date=date(2026, 4, 15)),
        ])
        session.commit()

        result = monthly_forecast(session, owner_id=1, month=5, year=2026)
        assert result.status == "sufficient_data"
        assert result.evaluation is not None
        assert result.evaluation.has_backtest is True
        assert result.evaluation.test_points_count == 1
        assert result.evaluation.naive_mae == "1000000"
        assert result.evaluation.ma_mae == "2000000"
        assert result.evaluation.better_model == "naive"


def test_forecast_owner_isolation(forecast_db):
    with Session(forecast_db) as session:
        # Owner 2 has transactions, Owner 1 has none
        session.add_all([
            Transaction(owner_id=2, category_id=3, type="expense", amount_rupiah=3000000, date=date(2026, 2, 5)),
            Transaction(owner_id=2, category_id=3, type="expense", amount_rupiah=3000000, date=date(2026, 3, 5)),
            Transaction(owner_id=2, category_id=3, type="expense", amount_rupiah=3000000, date=date(2026, 4, 5)),
        ])
        session.commit()

        result = monthly_forecast(session, owner_id=1, month=5, year=2026)
        assert result.status == "insufficient_data"
        assert result.has_sufficient_data is False
