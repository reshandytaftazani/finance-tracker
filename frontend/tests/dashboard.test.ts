import assert from "node:assert/strict";
import { test } from "node:test";
import { formatRupiah } from "../src/lib/formatters.ts";
import {
  fetchAnalyticsByCategory,
  fetchAnalyticsForecast,
  fetchAnalyticsInsights,
  fetchAnalyticsSummary,
  fetchRecentTransactions,
} from "../src/api/analytics.ts";
import { ApiError } from "../src/api/transactions.ts";

test("formatRupiah formats exact rupiah string, negative numbers, and large integers without loss of precision", () => {
  assert.equal(formatRupiah("0").replace(/\s/g, " "), "Rp 0");
  assert.equal(formatRupiah("1000").replace(/\s/g, " "), "Rp 1.000");
  assert.equal(formatRupiah("-500").replace(/\s/g, " "), "-Rp 500");
  assert.equal(formatRupiah(-500).replace(/\s/g, " "), "-Rp 500");
  assert.equal(formatRupiah("10000000000000000000").replace(/\s/g, " "), "Rp 10.000.000.000.000.000.000");
  assert.equal(formatRupiah("invalid"), "Rp 0");
});

test("fetchAnalyticsSummary sends valid month and year and receives exact summary", async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.pathname, "/api/v1/analytics/summary");
    assert.deepEqual(Object.fromEntries(parsed.searchParams), { month: "10", year: "2026" });
    assert.equal(options.signal, controller.signal);
    return Response.json({
      month: 10,
      year: 2026,
      income: "1000",
      expense: "700",
      net_cash_flow: "300",
    });
  });

  const summary = await fetchAnalyticsSummary(10, 2026, controller.signal);
  assert.deepEqual(summary, {
    month: 10,
    year: 2026,
    income: "1000",
    expense: "700",
    net_cash_flow: "300",
  });
});

test("fetchAnalyticsSummary rejects invalid period before network call", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    assert.fail("Invalid month reached the network");
  });
  await assert.rejects(fetchAnalyticsSummary(0, 2026), /bulan/i);
  await assert.rejects(fetchAnalyticsSummary(13, 2026), /bulan/i);
  await assert.rejects(fetchAnalyticsSummary(10, 0), /tahun/i);
  await assert.rejects(fetchAnalyticsSummary(10, 10000), /tahun/i);
});

test("fetchAnalyticsByCategory returns category breakdown items", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.pathname, "/api/v1/analytics/by-category");
    assert.deepEqual(Object.fromEntries(parsed.searchParams), { month: "10", year: "2026" });
    return Response.json({
      month: 10,
      year: 2026,
      items: [
        { category_id: 3, category_name: "Transport", expense: "400" },
        { category_id: 1, category_name: "Makanan", expense: "300" },
      ],
    });
  });

  const breakdown = await fetchAnalyticsByCategory(10, 2026);
  assert.equal(breakdown.items.length, 2);
  assert.equal(breakdown.items[0].category_name, "Transport");
  assert.equal(breakdown.items[0].expense, "400");
});

test("fetchAnalyticsByCategory rejects unsafe category IDs in response", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    return new Response(
      '{"month":10,"year":2026,"items":[{"category_id":9007199254740993,"category_name":"Overflow","expense":"100"}]}',
      { headers: { "Content-Type": "application/json" } }
    );
  });

  await assert.rejects(fetchAnalyticsByCategory(10, 2026), /ID.*aman/i);
});

test("analytics API calls propagate ApiError and network error", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ detail: "Database error" }, { status: 500 }));
  await assert.rejects(fetchAnalyticsSummary(10, 2026), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 500);
    return true;
  });

  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(fetchAnalyticsSummary(10, 2026), /backend/i);
});

test("fetchRecentTransactions fetches first page limited to 5 items with date range", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.pathname, "/api/v1/transactions");
    assert.deepEqual(Object.fromEntries(parsed.searchParams), {
      start_date: "2026-10-01",
      end_date: "2026-10-31",
      page: "1",
      page_size: "5",
    });
    return Response.json({
      items: [
        {
          id: 1,
          category_id: 1,
          type: "expense",
          amount_rupiah: "50000",
          date: "2026-10-09",
          description: "Makan siang",
          notes: null,
          created_at: "2026-10-09T12:00:00Z",
          updated_at: "2026-10-09T12:00:00Z",
        },
      ],
      total: 1,
      page: 1,
      page_size: 5,
    });
  });

  const transactions = await fetchRecentTransactions(10, 2026);
  assert.equal(transactions.length, 1);
  assert.equal(transactions[0].description, "Makan siang");
});

test("recent transactions preserve four-digit years below 1000", async (t) => {
  const urls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    urls.push(String(url));
    return Response.json({ items: [], total: 0, page: 1, page_size: 5 });
  });
  for (const year of [1, 99, 999]) {
    assert.deepEqual(await fetchRecentTransactions(1, year), []);
  }
  assert.deepEqual(urls.map((url) => new URL(url).searchParams.get("start_date")), [
    "0001-01-01", "0099-01-01", "0999-01-01",
  ]);
});

test("fetchAnalyticsInsights sends valid month/year and parses response safely", async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.pathname, "/api/v1/analytics/insights");
    assert.deepEqual(Object.fromEntries(parsed.searchParams), { month: "10", year: "2026" });
    assert.equal(options.signal, controller.signal);
    return Response.json({
      month: 10,
      year: 2026,
      comparison: {
        has_baseline: true,
        previous_expense: "1000000",
        difference: "250000",
        percentage: "25.00",
        direction: "up",
      },
      top_category: {
        has_data: true,
        category_id: 1,
        category_name: "Makanan",
        expense: "800000",
        percentage_of_total: "64.00",
      },
      cash_flow: {
        status: "surplus",
        savings_rate_percentage: "40.00",
      },
      narratives: ["Pengeluaran naik 25.00%."],
    });
  });

  const insights = await fetchAnalyticsInsights(10, 2026, controller.signal);
  assert.equal(insights.month, 10);
  assert.equal(insights.comparison.direction, "up");
  assert.equal(insights.top_category.category_name, "Makanan");
  assert.equal(insights.cash_flow.status, "surplus");
});

test("fetchAnalyticsInsights rejects unsafe category IDs in response", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    return Response.json({
      month: 10,
      year: 2026,
      comparison: { has_baseline: false, previous_expense: null, difference: null, percentage: null, direction: "no_baseline" },
      top_category: { has_data: true, category_id: Number.MAX_SAFE_INTEGER + 1, category_name: "Unsafe", expense: "100", percentage_of_total: "100.00" },
      cash_flow: { status: "no_activity", savings_rate_percentage: null },
      narratives: [],
    });
  });

  await assert.rejects(fetchAnalyticsInsights(10, 2026), /batas integer aman/i);
});

test("fetchAnalyticsInsights allows null category_id when has_data is false", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    return Response.json({
      month: 10,
      year: 2026,
      comparison: { has_baseline: false, previous_expense: null, difference: null, percentage: null, direction: "no_baseline" },
      top_category: { has_data: false, category_id: null, category_name: null, expense: null, percentage_of_total: null },
      cash_flow: { status: "no_activity", savings_rate_percentage: null },
      narratives: [],
    });
  });

  const data = await fetchAnalyticsInsights(10, 2026);
  assert.equal(data.top_category.category_id, null);
  assert.equal(data.top_category.has_data, false);
});

test("fetchAnalyticsForecast sends valid month/year and parses response correctly", async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.pathname, "/api/v1/analytics/forecast");
    assert.deepEqual(Object.fromEntries(parsed.searchParams), { month: "10", year: "2026" });
    assert.equal(options.signal, controller.signal);
    return Response.json({
      month: 10,
      year: 2026,
      status: "sufficient_data",
      message: "Proyeksi berhasil dihitung menggunakan rata-rata bergerak 3 bulan.",
      has_sufficient_data: true,
      historical_months: [
        { month: 7, year: 2026, expense: "3000000", transaction_count: 5 },
        { month: 8, year: 2026, expense: "4000000", transaction_count: 6 },
        { month: 9, year: 2026, expense: "5000000", transaction_count: 4 },
      ],
      forecast_expense: "4000000",
      baseline_expense: "5000000",
      evaluation: {
        has_backtest: true,
        test_points_count: 1,
        ma_mae: "100000",
        naive_mae: "200000",
        better_model: "ma3",
        explanation: "Moving average lebih akurat",
      },
    });
  });

  const forecast = await fetchAnalyticsForecast(10, 2026, controller.signal);
  assert.equal(forecast.month, 10);
  assert.equal(forecast.status, "sufficient_data");
  assert.equal(forecast.has_sufficient_data, true);
  assert.equal(forecast.forecast_expense, "4000000");
  assert.equal(forecast.baseline_expense, "5000000");
  assert.equal(forecast.historical_months.length, 3);
  assert.equal(forecast.evaluation?.better_model, "ma3");
});

test("fetchAnalyticsForecast rejects invalid month and year", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    assert.fail("Invalid month reached the network");
  });
  await assert.rejects(fetchAnalyticsForecast(0, 2026), /bulan/i);
  await assert.rejects(fetchAnalyticsForecast(13, 2026), /bulan/i);
  await assert.rejects(fetchAnalyticsForecast(10, 0), /tahun/i);
  await assert.rejects(fetchAnalyticsForecast(10, 10000), /tahun/i);
});

