import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { deleteWallet, invalidateWalletQueries } from "../api/wallets";
import { formatRupiah } from "../lib/formatters";
import { closeDialog } from "../lib/motion";
import type { WalletItem } from "../lib/wallets";

export function DeleteWalletDialog({
  wallet,
  onCancel,
  onDeleted,
}: {
  wallet: WalletItem;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const locked = useRef(false);
  const client = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => deleteWallet(wallet.id),
    onSuccess: async () => {
      await invalidateWalletQueries(client);
      closeDialog(dialog.current, onDeleted);
    },
  });

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    cancel.current?.focus();
    return () => element?.close();
  }, []);

  async function confirm() {
    if (locked.current || dialog.current?.dataset.closing) return;
    locked.current = true;
    try {
      await mutation.mutateAsync();
    } catch {
      // Keep error message visible in dialog
    } finally {
      locked.current = false;
    }
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="delete-wallet-title"
      aria-describedby="delete-wallet-desc"
      className="transaction-dialog max-w-md"
      onCancel={(e) => {
        e.preventDefault();
        if (!locked.current) closeDialog(dialog.current, onCancel);
      }}
    >
      <h2 id="delete-wallet-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
        Hapus Dompet?
      </h2>
      <p id="delete-wallet-desc" className="mt-3 text-sm text-slate-600 dark:text-slate-400">
        Apakah Anda yakin ingin menghapus dompet <strong>{wallet.name}</strong> dengan saldo saat ini{" "}
        <strong className="font-mono text-slate-900 dark:text-slate-100">
          {formatRupiah(wallet.current_balance_rupiah)}
        </strong>
        ?
      </p>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Catatan: Dompet tidak dapat dihapus jika masih memiliki riwayat transaksi atau transfer yang terhubung.
      </p>

      {mutation.error && (
        <p role="alert" className="mt-3 text-sm font-medium text-rose-700 dark:text-rose-400">
          {mutation.error.message}
        </p>
      )}

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button
          ref={cancel}
          type="button"
          disabled={mutation.isPending}
          className="transaction-button"
          onClick={() => closeDialog(dialog.current, onCancel)}
        >
          Batal
        </button>
        <button
          type="button"
          disabled={mutation.isPending}
          className="transaction-button transaction-danger"
          onClick={() => void confirm()}
        >
          {mutation.isPending ? "Menghapus…" : "Hapus Dompet"}
        </button>
      </div>
    </dialog>
  );
}
