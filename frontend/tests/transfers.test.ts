import assert from "node:assert/strict";
import { test } from "node:test";
import * as lib from "../src/lib/transfers.ts";
import * as api from "../src/api/transfers.ts";

const wallets = [
  { id: 1, name: "BCA Tabungan", type: "bank" as const, initial_balance_rupiah: "0", current_balance_rupiah: "100000", created_at: "", updated_at: "" },
  { id: 2, name: "Dompet Tunai", type: "cash" as const, initial_balance_rupiah: "0", current_balance_rupiah: "50000", created_at: "", updated_at: "" },
];

const draft = {
  from_wallet_id: "1",
  to_wallet_id: "2",
  amount_rupiah: "50000",
  date: "2026-10-19",
  description: "Tarik tunai ATM",
  notes: "Untuk belanja",
};

const transferItem = {
  id: 1,
  from_wallet_id: 1,
  from_wallet_name: "BCA Tabungan",
  to_wallet_id: 2,
  to_wallet_name: "Dompet Tunai",
  amount_rupiah: "50000",
  date: "2026-10-19",
  description: "Tarik tunai ATM",
  notes: "Untuk belanja",
  created_at: "2026-10-19T00:00:00Z",
  updated_at: "2026-10-19T00:00:00Z",
};

test("transfer validates distinct wallets, positive amount, and valid calendar date", () => {
  assert.deepEqual(lib.validateTransfer(draft, wallets), {});
  assert.deepEqual(lib.transferPayload(draft), {
    from_wallet_id: 1,
    to_wallet_id: 2,
    amount_rupiah: "50000",
    date: "2026-10-19",
    description: "Tarik tunai ATM",
    notes: "Untuk belanja",
  });

  // Same wallet rejected
  assert.ok(lib.validateTransfer({ ...draft, to_wallet_id: "1" }, wallets).to_wallet_id);

  // Missing or invalid wallet rejected
  assert.ok(lib.validateTransfer({ ...draft, from_wallet_id: "" }, wallets).from_wallet_id);
  assert.ok(lib.validateTransfer({ ...draft, from_wallet_id: "999" }, wallets).from_wallet_id);

  // Invalid amounts
  for (const amount_rupiah of ["0", "-500", "1.5", "abc", "10000000000000"]) {
    assert.ok(lib.validateTransfer({ ...draft, amount_rupiah }, wallets).amount_rupiah);
  }

  // Invalid date
  assert.ok(lib.validateTransfer({ ...draft, date: "2026-02-29" }, wallets).date);
});

test("createTransfer rejects same wallet client-side before network call", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    assert.fail("same-wallet transfer should not reach network");
  });

  await assert.rejects(
    api.createTransfer({
      from_wallet_id: 1,
      to_wallet_id: 1,
      amount_rupiah: "10000",
      date: "2026-10-19",
      description: "Transfer",
    }),
    /sama/i
  );
});

test("fetchTransfers and deleteTransfer work correctly and reject unsafe IDs", async (t) => {
  const requests: unknown[] = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push([new URL(String(url)).pathname, options.method]);
    return options.method === "DELETE"
      ? new Response(null, { status: 204 })
      : Response.json({ items: [transferItem], total: 1, page: 1, page_size: 20 });
  });

  const page = await api.fetchTransfers(1, 20);
  assert.equal(page.total, 1);
  assert.equal(page.items[0].from_wallet_name, "BCA Tabungan");

  await api.deleteTransfer(1);
  assert.deepEqual(requests, [
    ["/api/v1/transfers", undefined],
    ["/api/v1/transfers/1", "DELETE"],
  ]);

  await assert.rejects(api.deleteTransfer(9007199254740992), /ID.*aman/i);
});
