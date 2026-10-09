import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { formatDate } from "../src/lib/formatters.ts";
import {
  monthRange, jakartaToday, validateTransaction, transactionPayload,
} from "../src/lib/transactions.ts";
import {
  fetchTransactions, fetchCategories, saveTransaction, deleteTransaction,
  ApiError, invalidateTransactionQueries,
} from "../src/api/transactions.ts";

// These catch wrong date boundaries, lossy amount conversion, invalid category
// submission, incomplete category pagination, missing invalidation and bad errors.
const categories = [
  { id: 1, name: "Makanan", type: "expense", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
  { id: 2, name: "Gaji", type: "income", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
] as const;
const valid = { date: "2026-10-09", type: "expense", category_id: "1", amount_rupiah: "9999999999999", description: " Makan " };

test("month filter uses inclusive leap-year/year-end boundaries", () => {
  assert.deepEqual(monthRange("2024-02"), { start_date: "2024-02-01", end_date: "2024-02-29" });
  assert.deepEqual(monthRange("2026-12"), { start_date: "2026-12-01", end_date: "2026-12-31" });
  assert.deepEqual(monthRange("0001-02"), { start_date: "0001-02-01", end_date: "0001-02-28" });
  for (const month of ["", "2026-13", "0000-01", "2026-1"]) assert.equal(monthRange(month), null);
});

test("today is the Jakarta calendar day, not UTC or browser timezone", () => {
  assert.equal(jakartaToday(new Date("2026-10-08T18:00:00Z")), "2026-10-09");
});

test("table date formatting preserves calendar years below 100", () => {
  assert.equal(formatDate("0001-01-01"), "1 Januari 1");
  assert.equal(formatDate("0099-12-31"), "31 Desember 99");
});

test("valid amount stays a string in payload and notes remain absent on edit", () => {
  assert.deepEqual(validateTransaction(valid, categories), {});
  assert.deepEqual(transactionPayload(valid), { ...valid, category_id: 1, description: "Makan" });
  assert.equal(typeof transactionPayload(valid).amount_rupiah, "string");
  assert.equal("notes" in transactionPayload(valid), false);
  assert.deepEqual(validateTransaction({ ...valid, amount_rupiah: "0001", description: "" }, categories), {});
});

test("invalid amounts are rejected without rounding or stripping punctuation", () => {
  for (const amount_rupiah of ["", "0", "0000", "-1", "1.5", "1,000", " 10", "+1", "1e3", "１２", "10000000000000"]) {
    assert.ok(validateTransaction({ ...valid, amount_rupiah }, categories).amount_rupiah, amount_rupiah);
  }
});

test("calendar date, category ownership/type and description constraints are checked", () => {
  for (const date of ["", "2026-02-29", "2026-04-31", "0000-01-01", "2026-10-09T00:00:00Z"]) {
    assert.ok(validateTransaction({ ...valid, date }, categories).date, date);
  }
  assert.ok(validateTransaction({ ...valid, type: "other" }, categories).type);
  for (const category_id of ["", "2", "404", "1.0"]) {
    assert.ok(validateTransaction({ ...valid, category_id }, categories).category_id);
  }
  for (const description of ["a".repeat(201), "x\0y"]) {
    assert.ok(validateTransaction({ ...valid, description }, categories).description);
  }
  assert.deepEqual(validateTransaction({ ...valid, description: "😀".repeat(200), date: "0001-01-01" }, categories), {});
});

test("list sends only supported filters with an abort signal", async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.pathname, "/api/v1/transactions");
    assert.deepEqual(Object.fromEntries(parsed.searchParams), {
      start_date: "2024-02-01", end_date: "2024-02-29", type: "expense", category_id: "1", page: "2", page_size: "20",
    });
    assert.equal(options.signal, controller.signal);
    return Response.json({ items: [], total: 22, page: 2, page_size: 20 });
  });
  assert.equal((await fetchTransactions({ month: "2024-02", type: "expense", category_id: "1", page: 2 }, controller.signal)).total, 22);
});

test("all categories are fetched across pages, not silently capped at 100", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    const params = new URL(String(url)).searchParams;
    assert.equal(params.get("page_size"), "100");
    const page = Number(params.get("page"));
    return Response.json({ items: page === 1 ? Array.from({ length: 100 }, (_, i) => ({ ...categories[0], id: i + 1 })) : [{ ...categories[1], id: 101 }], total: 101, page, page_size: 100 });
  });
  const result = await fetchCategories();
  assert.equal(result.length, 101);
  assert.equal(result[100].name, "Gaji");
});

test("create and PATCH send JSON string amount and no notes/ownership", async (t) => {
  const requests: Array<{ path: string; method: string; body: unknown }> = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(options.headers["Content-Type"], "application/json");
    requests.push({ path: new URL(String(url)).pathname, method: options.method, body: JSON.parse(options.body) });
    return Response.json({ id: 3, ...transactionPayload(valid), notes: "preserved", created_at: "2026-10-09T00:00:00Z", updated_at: "2026-10-09T00:00:00Z" });
  });
  await saveTransaction(transactionPayload(valid));
  const updated = await saveTransaction(transactionPayload(valid), 3);
  assert.equal(updated.notes, "preserved");
  assert.deepEqual(requests, [
    { path: "/api/v1/transactions", method: "POST", body: { date: "2026-10-09", type: "expense", category_id: 1, amount_rupiah: "9999999999999", description: "Makan" } },
    { path: "/api/v1/transactions/3", method: "PATCH", body: { date: "2026-10-09", type: "expense", category_id: 1, amount_rupiah: "9999999999999", description: "Makan" } },
  ]);
});

test("DELETE handles 204 without parsing an empty body", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(new URL(String(url)).pathname, "/api/v1/transactions/3");
    assert.equal(options.method, "DELETE");
    return new Response(null, { status: 204 });
  });
  assert.equal(await deleteTransaction(3), undefined);
});

test("unsafe 64-bit identifiers from API responses are rejected, never rounded into rows", async (t) => {
  for (const field of ["id", "category_id"]) {
    t.mock.method(globalThis, "fetch", async () => new Response(`{"items":[{"${field}":9007199254740993}],"total":1,"page":1,"page_size":20}`, { headers: { "Content-Type": "application/json" } }));
    await assert.rejects(fetchTransactions({ month: "2026-10", type: "all", category_id: "all", page: 1 }), /ID.*aman/i);
    await assert.rejects(fetchCategories(), /ID.*aman/i);
  }
  t.mock.method(globalThis, "fetch", async () => new Response('{"items":[{"id":9007199254740991}],"total":1,"page":1,"page_size":20}', { headers: { "Content-Type": "application/json" } }));
  assert.equal((await fetchCategories())[0].id, 9007199254740991);
});

test("unsafe mutation and filter IDs fail before any network call", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { assert.fail("Unsafe identifier reached the network"); });
  await assert.rejects(deleteTransaction(9007199254740992), /ID.*aman/i);
  await assert.rejects(saveTransaction(transactionPayload(valid), 9007199254740992), /ID.*aman/i);
  await assert.rejects(saveTransaction({ ...transactionPayload(valid), category_id: 9007199254740992 }), /ID.*aman/i);
  await assert.rejects(fetchTransactions({ month: "2026-10", type: "all", category_id: "9007199254740993", page: 1 }), /ID.*aman/i);
});

test("server validation becomes field errors; HTTP/network errors stay errors", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ detail: [{ loc: ["body", "amount_rupiah"], msg: "Invalid amount", type: "value_error" }] }, { status: 422 }));
  await assert.rejects(saveTransaction(transactionPayload(valid)), (error) => {
    assert.ok(error instanceof ApiError);
    assert.ok(error.fieldErrors.amount_rupiah);
    return true;
  });
  t.mock.method(globalThis, "fetch", async () => Response.json({ detail: "Category type must match transaction type" }, { status: 422 }));
  await assert.rejects(saveTransaction(transactionPayload(valid)), (error) => {
    assert.ok(error instanceof ApiError && error.fieldErrors.category_id);
    return true;
  });
  for (const status of [404, 409, 503]) {
    t.mock.method(globalThis, "fetch", async () => new Response("not JSON", { status }));
    await assert.rejects(fetchTransactions({ month: "2026-10", type: "all", category_id: "all", page: 1 }), (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, status);
      assert.ok(error.message.length);
      return true;
    });
  }
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(fetchCategories(), /backend|koneksi/i);
});

test("mutation invalidates all transaction/analytics periods and refetches active lists", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  let reads = 0;
  const observer = new QueryObserver(client, { queryKey: ["transactions", { month: "2026-10" }], queryFn: async () => ++reads });
  const unsubscribe = observer.subscribe(() => {});
  await observer.refetch();
  const before = reads;
  client.setQueryData(["transactions", { month: "2026-09" }], []);
  client.setQueryData(["analytics", "summary", "2026-09"], { income: "1" });
  client.setQueryData(["categories"], []);
  await invalidateTransactionQueries(client);
  assert.equal(reads, before + 1);
  assert.equal(client.getQueryState(["transactions", { month: "2026-09" }])?.isInvalidated, true);
  assert.equal(client.getQueryState(["analytics", "summary", "2026-09"])?.isInvalidated, true);
  assert.equal(client.getQueryState(["categories"])?.isInvalidated, false);
  unsubscribe();
  client.clear();
});
