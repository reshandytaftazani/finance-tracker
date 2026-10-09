import assert from "node:assert/strict";
import { test } from "node:test";
import * as api from "../src/api/transactions.ts";

// These catch exporting a pagination page, dropped filters, rounded category
// IDs, lossy CSV conversion, and downloading an error page as a successful CSV.
const filters = { month: "2024-02", type: "expense", category_id: "1", page: 3 } as const;

test("export fetches all active-filter matches and keeps CSV bytes intact", async (t) => {
  const bytes = new TextEncoder().encode('\ufeff"tanggal","nominal_rupiah","deskripsi"\r\n"2024-02-29","9999999999999","café, 😀"\r\n');
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.pathname, "/api/v1/transactions/export/csv");
    assert.deepEqual(Object.fromEntries(parsed.searchParams), {
      start_date: "2024-02-01", end_date: "2024-02-29", type: "expense", category_id: "1",
    });
    assert.equal(options.signal, controller.signal);
    assert.equal(options.headers.Accept, "text/csv");
    return new Response(bytes, { headers: { "Content-Type": "text/csv; charset=utf-8" } });
  });
  const blob = await api.exportTransactions(filters, controller.signal);
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
});

test("export omits all-type/category filters and rejects invalid month/unsafe ID before fetch", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.deepEqual(Object.fromEntries(new URL(String(url)).searchParams), { start_date: "2026-12-01", end_date: "2026-12-31" });
    return new Response("header\r\n", { headers: { "Content-Type": "text/csv" } });
  });
  assert.equal(await (await api.exportTransactions({ month: "2026-12", type: "all", category_id: "all", page: 9 })).text(), "header\r\n");
  t.mock.method(globalThis, "fetch", async () => { assert.fail("Invalid export filter reached the network"); });
  await assert.rejects(api.exportTransactions({ ...filters, month: "" }), /bulan/i);
  await assert.rejects(api.exportTransactions({ ...filters, category_id: "9007199254740993" }), /ID.*aman/i);
});

test("export HTTP/network and unexpected content errors do not become downloads", async (t) => {
  for (const status of [404, 422, 503]) {
    t.mock.method(globalThis, "fetch", async () => Response.json({ detail: "Failure" }, { status }));
    await assert.rejects(api.exportTransactions(filters), (error) => {
      assert.ok(error instanceof api.ApiError);
      assert.equal(error.status, status);
      return true;
    });
  }
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("offline"); });
  await assert.rejects(api.exportTransactions(filters), /backend/i);
  t.mock.method(globalThis, "fetch", async () => new Response("<html>fallback</html>", { headers: { "Content-Type": "text/html" } }));
  await assert.rejects(api.exportTransactions(filters), /CSV/i);
});
