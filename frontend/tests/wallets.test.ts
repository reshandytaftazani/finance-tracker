import assert from "node:assert/strict";
import { test } from "node:test";
import * as lib from "../src/lib/wallets.ts";
import * as api from "../src/api/wallets.ts";

const draft = { name: "BCA Tabungan", type: "bank", initial_balance_rupiah: "500000" };
const walletItem = {
  id: 1,
  name: "BCA Tabungan",
  type: "bank" as const,
  initial_balance_rupiah: "500000",
  current_balance_rupiah: "1500000",
  created_at: "2026-10-19T00:00:00Z",
  updated_at: "2026-10-19T00:00:00Z",
};

test("wallet validates name, type, and integer initial balance rupiah", () => {
  assert.deepEqual(lib.validateWallet(draft), {});
  assert.deepEqual(lib.walletPayload(draft), {
    name: "BCA Tabungan",
    type: "bank",
    initial_balance_rupiah: "500000",
  });

  for (const name of ["", "   ", "a".repeat(51), "Dompet\0Test"]) {
    assert.ok(lib.validateWallet({ ...draft, name }).name);
  }
  for (const type of ["", "crypto", "invalid"]) {
    assert.ok(lib.validateWallet({ ...draft, type }).type);
  }
  for (const initial_balance_rupiah of ["-1", "1.5", "1e3", "abc", "10000000000000"]) {
    assert.ok(lib.validateWallet({ ...draft, initial_balance_rupiah }).initial_balance_rupiah);
  }
  // 0 is valid for initial balance
  assert.deepEqual(lib.validateWallet({ ...draft, initial_balance_rupiah: "0" }), {});
});

test("fetchWallets parses items and total net worth correctly", async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(new URL(String(url)).pathname, "/api/v1/wallets");
    assert.equal(options.signal, controller.signal);
    return Response.json({
      items: [walletItem],
      total_balance_rupiah: "1500000",
    });
  });

  const res = await api.fetchWallets(controller.signal);
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].current_balance_rupiah, "1500000");
  assert.equal(res.total_balance_rupiah, "1500000");
});

test("wallet save and delete operations preserve string money and reject unsafe IDs", async (t) => {
  const requests: unknown[] = [];
  const payload = lib.walletPayload(draft);
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push([new URL(String(url)).pathname, options.method, options.body && JSON.parse(options.body)]);
    return options.method === "DELETE" ? new Response(null, { status: 204 }) : Response.json({ ...walletItem, ...payload });
  });

  await api.saveWallet(payload);
  await api.saveWallet(payload, 1);
  await api.deleteWallet(1);
  assert.deepEqual(requests, [
    ["/api/v1/wallets", "POST", payload],
    ["/api/v1/wallets/1", "PATCH", payload],
    ["/api/v1/wallets/1", "DELETE", undefined],
  ]);

  await assert.rejects(api.deleteWallet(9007199254740992), /ID.*aman/i);
  await assert.rejects(api.saveWallet(payload, 9007199254740992), /ID.*aman/i);
});
