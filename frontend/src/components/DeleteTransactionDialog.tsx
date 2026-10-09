import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { deleteTransaction, invalidateTransactionQueries } from "../api/transactions";
import { formatDate, formatRupiah } from "../lib/formatters";
import type { Transaction } from "../lib/transactions";

export function DeleteTransactionDialog({ transaction, onCancel, onDeleted }: {
  transaction: Transaction; onCancel: () => void; onDeleted: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const locked = useRef(false);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => deleteTransaction(transaction.id),
    onSuccess: async () => { await invalidateTransactionQueries(client); onDeleted(); },
  });
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    cancelButton.current?.focus();
    return () => element?.close();
  }, []);

  async function confirm() {
    if (locked.current) return;
    locked.current = true;
    try { await mutation.mutateAsync(); } catch { /* mutation.error is displayed; keep confirmation open */ }
    finally { locked.current = false; }
  }

  return (
    <dialog ref={dialog} aria-labelledby="delete-title" aria-describedby="delete-description" className="transaction-dialog" onCancel={(event) => { event.preventDefault(); if (!locked.current) onCancel(); }}>
      <h2 id="delete-title" className="text-lg font-semibold text-slate-900">Hapus transaksi?</h2>
      <p id="delete-description" className="mt-3 text-slate-700">Transaksi {formatDate(transaction.date)} senilai <strong className="tabular-nums">{formatRupiah(transaction.amount_rupiah)}</strong> akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.</p>
      {transaction.description && <p className="mt-2 break-words text-sm text-slate-600">{transaction.description}</p>}
      {mutation.error && <p role="alert" className="mt-3 text-sm text-red-700">{mutation.error.message}</p>}
      <div className="mt-6 flex flex-wrap gap-3">
        <button ref={cancelButton} type="button" onClick={onCancel} disabled={mutation.isPending} className="transaction-button">Batal</button>
        <button type="button" onClick={confirm} disabled={mutation.isPending} className="transaction-button transaction-danger">{mutation.isPending ? "Menghapus…" : "Hapus transaksi"}</button>
      </div>
    </dialog>
  );
}
