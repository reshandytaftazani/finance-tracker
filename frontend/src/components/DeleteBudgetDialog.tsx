import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { deleteBudget, invalidateBudgetQueries } from "../api/budgets";
import { formatDate, formatRupiah } from "../lib/formatters";
import type { BudgetStatusItem } from "../lib/budgets";

export function DeleteBudgetDialog({ budget, period, onCancel, onDeleted }: {
  budget: BudgetStatusItem; period: string; onCancel: () => void; onDeleted: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const locked = useRef(false);
  const client = useQueryClient();
  const mutation = useMutation({ mutationFn: () => deleteBudget(budget.id), onSuccess: async () => { await invalidateBudgetQueries(client); onDeleted(); } });
  useEffect(() => {
    const element = dialog.current;
    element?.showModal(); cancel.current?.focus();
    return () => element?.close();
  }, []);
  async function confirm() {
    if (locked.current) return;
    locked.current = true;
    try { await mutation.mutateAsync(); } catch { /* Keep the confirmation and error visible for retry. */ }
    finally { locked.current = false; }
  }
  return <dialog ref={dialog} aria-labelledby="delete-budget-title" aria-describedby="delete-budget-description" className="transaction-dialog" onCancel={(event) => { event.preventDefault(); if (!locked.current) onCancel(); }}>
    <h2 id="delete-budget-title" className="text-lg font-semibold text-slate-900">Hapus budget?</h2>
    <p id="delete-budget-description" className="mt-3 break-words text-slate-700">Budget <strong>{budget.category_name}</strong> senilai <strong className="tabular-nums">{formatRupiah(budget.budget)}</strong> untuk {formatDate(`${period}-01`).replace(/^1 /, "")} akan dihapus permanen. Transaksi tetap tersimpan.</p>
    {mutation.error && <p role="alert" className="mt-3 text-sm text-red-700">{mutation.error.message}</p>}
    <div className="mt-6 flex flex-wrap gap-3">
      <button ref={cancel} type="button" disabled={mutation.isPending} className="transaction-button" onClick={onCancel}>Batal</button>
      <button type="button" disabled={mutation.isPending} className="transaction-button transaction-danger" onClick={() => void confirm()}>{mutation.isPending ? "Menghapus…" : "Hapus budget"}</button>
    </div>
  </dialog>;
}
