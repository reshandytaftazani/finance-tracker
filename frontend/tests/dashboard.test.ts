import assert from "node:assert/strict";
import { test } from "node:test";
import { formatRupiah } from "../src/lib/formatters.ts";
import {
  fetchAnalyticsByCategory,
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
