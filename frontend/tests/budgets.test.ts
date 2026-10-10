import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { invalidateTransactionQueries } from "../src/api/transactions.ts";
import * as lib from "../src/lib/budgets.ts";
import * as api from "../src/api/budgets.ts";
const categories = [{ id: 1, name: "Makanan", type: "expense", created_at: "", updated_at: "" }, { id: 2, name: "Gaji", type: "income", created_at: "", updated_at: "" }] as const;
const draft = { period: "2026-10", category_id: "1", amount_rupiah: "9999999999999" };
const item = { id: 1, category_id: 1, category_name: "Makanan", budget: "100", spent: "125", remaining: "-25", percentage: "125.00", status: "over_budget" };

test("budget validates expense category, exact amount and four-digit period", () => {
  assert.deepEqual(lib.validateBudget(draft, categories), {});
  assert.deepEqual(lib.budgetPayload({ ...draft, period: "0001-01" }), { category_id: 1, amount_rupiah: "9999999999999", month: 1, year: 1 });
  for (const amount_rupiah of ["", "0", "-1", "1.5", " 1", "1e3", "１２", "10000000000000"]) assert.ok(lib.validateBudget({ ...draft, amount_rupiah }, categories).amount_rupiah);
  for (const period of ["", "0000-01", "2026-13", "2026-1"]) assert.ok(lib.validateBudget({ ...draft, period }, categories).period);
  for (const category_id of ["", "2", "99", "1.0"]) assert.ok(lib.validateBudget({ ...draft, category_id }, categories).category_id);
});

test("budget progress caps display at 100 without converting large money to floats", () => {
  assert.equal(lib.budgetProgress("125", "100"), 100);
  assert.equal(lib.budgetProgress("0", "100"), 0);
  assert.equal(lib.budgetProgress("79", "100"), 79);
  assert.equal(lib.budgetProgress("7999999999999", "9999999999999"), 79.99);
  assert.equal(lib.budgetProgress("9223399999999077660", "9999999999999"), 100);
});

test("budget status request has abort signal, exact totals and validated period", async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(new URL(String(url)).pathname, "/api/v1/budgets/status");
    assert.deepEqual(Object.fromEntries(new URL(String(url)).searchParams), { month: "1", year: "1" });
    assert.equal(options.signal, controller.signal);
    return Response.json({ month: 1, year: 1, items: [{ ...item, spent: "9223399999999077660", remaining: "-9223399999999077560", percentage: "9223399999999077660.00" }] });
  });
  assert.equal((await api.fetchBudgetStatus("0001-01", controller.signal)).items[0].spent, "9223399999999077660");
  t.mock.method(globalThis, "fetch", async () => { assert.fail("invalid period reached network"); });
  await assert.rejects(api.fetchBudgetStatus("0000-01"), /bulan|periode/i);
});

test("budget POST PATCH DELETE preserve string money and reject unsafe identifiers", async (t) => {
  const requests: unknown[] = [];
  const payload = lib.budgetPayload(draft);
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push([new URL(String(url)).pathname, options.method, options.body && JSON.parse(options.body)]);
    return options.method === "DELETE" ? new Response(null, { status: 204 }) : Response.json({ id: 1, ...payload, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" });
  });
  await api.saveBudget(payload);
  await api.saveBudget(payload, 1);
  await api.deleteBudget(1);
  assert.deepEqual(requests, [["/api/v1/budgets", "POST", payload], ["/api/v1/budgets/1", "PATCH", payload], ["/api/v1/budgets/1", "DELETE", undefined]]);
  t.mock.method(globalThis, "fetch", async () => { assert.fail("unsafe ID reached network"); });
  await assert.rejects(api.deleteBudget(9007199254740992), /ID.*aman/i);
  await assert.rejects(api.saveBudget(payload, 9007199254740992), /ID.*aman/i);
  await assert.rejects(api.saveBudget({ ...payload, category_id: 9007199254740992 }), /ID.*aman/i);
});

test("malformed status amounts, period and identifiers never become zero or rounded rows", async (t) => {
  for (const changes of [{ id: 9007199254740992 }, { category_id: 9007199254740992 }, { budget: "0" }, { spent: 125 }, { remaining: "x" }, { percentage: "NaN" }, { status: "other" }]) {
    t.mock.method(globalThis, "fetch", async () => Response.json({ month: 10, year: 2026, items: [{ ...item, ...changes }] }));
    await assert.rejects(api.fetchBudgetStatus("2026-10"));
  }
  t.mock.method(globalThis, "fetch", async () => Response.json({ month: 11, year: 2026, items: [item] }));
  await assert.rejects(api.fetchBudgetStatus("2026-10"), /periode|data/i);
});

test("budget server field errors and conflict retain useful recovery instructions", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ detail: [{ loc: ["body", "year"] }, { loc: ["body", "amount_rupiah"] }] }, { status: 422 }));
  await assert.rejects(api.saveBudget(lib.budgetPayload(draft)), (error) => {
    assert.ok(error instanceof api.BudgetApiError);
    assert.ok(error.fieldErrors.period && error.fieldErrors.amount_rupiah);
    return true;
  });
  t.mock.method(globalThis, "fetch", async () => new Response("", { status: 409 }));
  await assert.rejects(api.saveBudget(lib.budgetPayload(draft)), /budget.*sudah|konflik/i);
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("offline"); });
  await assert.rejects(api.fetchBudgetStatus("2026-10"), /backend/i);
});

test("transaction mutations invalidate cached budgets for every affected period", async () => {
  const client = new QueryClient();
  client.setQueryData(["budgets", "status", "2026-10"], { items: [item] });
  client.setQueryData(["budgets", "status", "2026-09"], { items: [] });
  client.setQueryData(["categories"], []);
  await invalidateTransactionQueries(client);
  assert.equal(client.getQueryState(["budgets", "status", "2026-10"])?.isInvalidated, true);
  assert.equal(client.getQueryState(["budgets", "status", "2026-09"])?.isInvalidated, true);
  assert.equal(client.getQueryState(["categories"])?.isInvalidated, false);
  client.clear();
});
