import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createTransfer, invalidateTransferQueries, TransferApiError } from "../api/transfers";
import { formatRupiah } from "../lib/formatters";
import { closeDialog } from "../lib/motion";
import { jakartaToday } from "../lib/transactions";
import { transferPayload, validateTransfer } from "../lib/transfers";
import type { TransferDraft, TransferFieldErrors } from "../lib/transfers";
import type { WalletItem } from "../lib/wallets";

export function TransferModal({
  wallets,
  defaultFromWalletId,
  onCancel,
  onSaved,
}: {
  wallets: WalletItem[];
  defaultFromWalletId?: number;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const locked = useRef(false);
  const focusAfterSubmit = useRef(false);

  const initialFromId = defaultFromWalletId
    ? String(defaultFromWalletId)
    : wallets.length > 0
    ? String(wallets[0].id)
    : "";
  const initialToId = wallets.find((w) => String(w.id) !== initialFromId)
    ? String(wallets.find((w) => String(w.id) !== initialFromId)?.id)
    : "";

  const [draft, setDraft] = useState<TransferDraft>(() => ({
    from_wallet_id: initialFromId,
    to_wallet_id: initialToId,
    amount_rupiah: "",
    date: jakartaToday(),
    description: "Transfer Antar Dompet",
    notes: "",
  }));
  const [errors, setErrors] = useState<TransferFieldErrors>({});

  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => createTransfer(transferPayload(draft)),
    onSuccess: async () => {
      await invalidateTransferQueries(client);
      closeDialog(dialog.current, onSaved);
    },
  });

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    form.current?.querySelector<HTMLInputElement>("[name=amount_rupiah]")?.focus();
    return () => element?.close();
  }, []);

  function focusError(next: TransferFieldErrors) {
    const field = Object.keys(next)[0];
    if (field) form.current?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
  }

  useEffect(() => {
    if (!mutation.isPending && focusAfterSubmit.current) {
      focusAfterSubmit.current = false;
      focusError(errors);
    }
  }, [mutation.isPending, errors]);

  function change(field: keyof TransferDraft, value: string) {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    mutation.reset();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    const next = validateTransfer(draft, wallets);
    setErrors(next);
    if (Object.keys(next).length > 0) {
      focusError(next);
      return;
    }
    locked.current = true;
    try {
      await mutation.mutateAsync();
    } catch (error) {
      if (error instanceof TransferApiError) {
        focusAfterSubmit.current = true;
        setErrors(error.fieldErrors);
      }
    } finally {
      locked.current = false;
    }
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="transfer-modal-title"
      className="transaction-dialog max-w-lg"
      onCancel={(e) => {
        e.preventDefault();
        if (!locked.current) closeDialog(dialog.current, onCancel);
      }}
    >
      <h2 id="transfer-modal-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
        Transfer Antar Dompet
      </h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Pindahkan dana antar rekening atau dompet Anda tanpa mempengaruhi laporan pemasukan/pengeluaran bersih.
      </p>

      <form ref={form} noValidate onSubmit={submit} className="mt-5 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="transfer-from" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Dompet Asal
            </label>
            <select
              id="transfer-from"
              name="from_wallet_id"
              value={draft.from_wallet_id}
              onChange={(e) => change("from_wallet_id", e.target.value)}
              aria-invalid={Boolean(errors.from_wallet_id)}
              aria-describedby={errors.from_wallet_id ? "transfer-from-error" : undefined}
              className="transaction-input mt-1 w-full"
            >
              <option value="">Pilih Dompet Asal</option>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({formatRupiah(w.current_balance_rupiah)})
                </option>
              ))}
            </select>
            {errors.from_wallet_id && (
              <span id="transfer-from-error" className="transaction-field-error">
                {errors.from_wallet_id}
              </span>
            )}
          </div>

          <div>
            <label htmlFor="transfer-to" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Dompet Tujuan
            </label>
            <select
              id="transfer-to"
              name="to_wallet_id"
              value={draft.to_wallet_id}
              onChange={(e) => change("to_wallet_id", e.target.value)}
              aria-invalid={Boolean(errors.to_wallet_id)}
              aria-describedby={errors.to_wallet_id ? "transfer-to-error" : undefined}
              className="transaction-input mt-1 w-full"
            >
              <option value="">Pilih Dompet Tujuan</option>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({formatRupiah(w.current_balance_rupiah)})
                </option>
              ))}
            </select>
            {errors.to_wallet_id && (
              <span id="transfer-to-error" className="transaction-field-error">
                {errors.to_wallet_id}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="transfer-amount" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Nominal Transfer (Rp)
            </label>
            <input
              id="transfer-amount"
              name="amount_rupiah"
              type="text"
              inputMode="numeric"
              required
              value={draft.amount_rupiah}
              onChange={(e) => change("amount_rupiah", e.target.value)}
              placeholder="Contoh: 100000"
              aria-invalid={Boolean(errors.amount_rupiah)}
              aria-describedby={errors.amount_rupiah ? "transfer-amount-error" : undefined}
              className="transaction-input mt-1 w-full font-mono"
            />
            {errors.amount_rupiah && (
              <span id="transfer-amount-error" className="transaction-field-error">
                {errors.amount_rupiah}
              </span>
            )}
          </div>

          <div>
            <label htmlFor="transfer-date" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Tanggal
            </label>
            <input
              id="transfer-date"
              name="date"
              type="date"
              required
              value={draft.date}
              onChange={(e) => change("date", e.target.value)}
              aria-invalid={Boolean(errors.date)}
              aria-describedby={errors.date ? "transfer-date-error" : undefined}
              className="transaction-input mt-1 w-full"
            />
            {errors.date && (
              <span id="transfer-date-error" className="transaction-field-error">
                {errors.date}
              </span>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="transfer-desc" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Keterangan
          </label>
          <input
            id="transfer-desc"
            name="description"
            type="text"
            maxLength={200}
            value={draft.description}
            onChange={(e) => change("description", e.target.value)}
            placeholder="Keterangan singkat transfer"
            aria-invalid={Boolean(errors.description)}
            aria-describedby={errors.description ? "transfer-desc-error" : undefined}
            className="transaction-input mt-1 w-full"
          />
          {errors.description && (
            <span id="transfer-desc-error" className="transaction-field-error">
              {errors.description}
            </span>
          )}
        </div>

        <div>
          <label htmlFor="transfer-notes" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Catatan Tambahan (Opsional)
          </label>
          <textarea
            id="transfer-notes"
            name="notes"
            rows={2}
            value={draft.notes ?? ""}
            onChange={(e) => change("notes", e.target.value)}
            placeholder="Catatan tambahan bila diperlukan"
            className="transaction-input mt-1 w-full"
          />
        </div>

        {mutation.error && (
          <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">
            {mutation.error.message}
          </p>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-3 pt-2">
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
            type="submit"
            disabled={mutation.isPending || wallets.length < 2}
            className="transaction-button transaction-primary"
          >
            {mutation.isPending ? "Mentransfer…" : "Kirim Transfer"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
