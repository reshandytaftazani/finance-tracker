import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { invalidateWalletQueries, saveWallet, WalletApiError } from "../api/wallets";
import { closeDialog } from "../lib/motion";
import {
  validateWallet,
  walletPayload,
  WALLET_TYPES,
  WALLET_TYPE_LABELS,
} from "../lib/wallets";
import type {
  WalletDraft,
  WalletFieldErrors,
  WalletItem,
} from "../lib/wallets";

export function WalletFormModal({
  wallet,
  onCancel,
  onSaved,
}: {
  wallet: WalletItem | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const locked = useRef(false);
  const focusAfterSubmit = useRef(false);

  const [draft, setDraft] = useState<WalletDraft>(() => ({
    name: wallet?.name ?? "",
    type: wallet?.type ?? "bank",
    initial_balance_rupiah: wallet?.initial_balance_rupiah ?? "0",
  }));
  const [errors, setErrors] = useState<WalletFieldErrors>({});

  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => saveWallet(walletPayload(draft), wallet?.id),
    onSuccess: async () => {
      await invalidateWalletQueries(client);
      closeDialog(dialog.current, onSaved);
    },
  });

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    form.current?.querySelector<HTMLInputElement>("[name=name]")?.focus();
    return () => element?.close();
  }, []);

  function focusError(next: WalletFieldErrors) {
    const field = Object.keys(next)[0];
    if (field) form.current?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
  }

  useEffect(() => {
    if (!mutation.isPending && focusAfterSubmit.current) {
      focusAfterSubmit.current = false;
      focusError(errors);
    }
  }, [mutation.isPending, errors]);

  function change(field: keyof WalletDraft, value: string) {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    mutation.reset();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    const next = validateWallet(draft);
    setErrors(next);
    if (Object.keys(next).length > 0) {
      focusError(next);
      return;
    }
    locked.current = true;
    try {
      await mutation.mutateAsync();
    } catch (error) {
      if (error instanceof WalletApiError) {
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
      aria-labelledby="wallet-form-title"
      className="transaction-dialog max-w-lg"
      onCancel={(e) => {
        e.preventDefault();
        if (!locked.current) closeDialog(dialog.current, onCancel);
      }}
    >
      <h2 id="wallet-form-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
        {wallet ? "Edit Dompet" : "Tambah Dompet Baru"}
      </h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Kelola rekening bank, tunai, atau dompet digital Anda.
      </p>

      <form ref={form} noValidate onSubmit={submit} className="mt-5 space-y-4">
        <div>
          <label htmlFor="wallet-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Nama Dompet
          </label>
          <input
            id="wallet-name"
            name="name"
            type="text"
            required
            maxLength={50}
            value={draft.name}
            onChange={(e) => change("name", e.target.value)}
            placeholder="Misal: BCA Tabungan, Tunai Harian, GoPay"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "wallet-name-error" : undefined}
            className="transaction-input mt-1 w-full"
          />
          {errors.name && (
            <span id="wallet-name-error" className="transaction-field-error">
              {errors.name}
            </span>
          )}
        </div>

        <div>
          <label htmlFor="wallet-type" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Tipe Dompet
          </label>
          <select
            id="wallet-type"
            name="type"
            value={draft.type}
            onChange={(e) => change("type", e.target.value)}
            aria-invalid={Boolean(errors.type)}
            aria-describedby={errors.type ? "wallet-type-error" : undefined}
            className="transaction-input mt-1 w-full"
          >
            {WALLET_TYPES.map((t) => (
              <option key={t} value={t}>
                {WALLET_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          {errors.type && (
            <span id="wallet-type-error" className="transaction-field-error">
              {errors.type}
            </span>
          )}
        </div>

        <div>
          <label htmlFor="wallet-initial-balance" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Saldo Awal (Rp)
          </label>
          <input
            id="wallet-initial-balance"
            name="initial_balance_rupiah"
            type="text"
            inputMode="numeric"
            value={draft.initial_balance_rupiah}
            onChange={(e) => change("initial_balance_rupiah", e.target.value)}
            placeholder="0"
            aria-invalid={Boolean(errors.initial_balance_rupiah)}
            aria-describedby={errors.initial_balance_rupiah ? "wallet-initial-balance-error" : "wallet-initial-balance-hint"}
            className="transaction-input mt-1 w-full font-mono"
          />
          <span id="wallet-initial-balance-hint" className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
            Hanya angka tanpa titik atau koma. Masukkan 0 jika tidak ada saldo awal.
          </span>
          {errors.initial_balance_rupiah && (
            <span id="wallet-initial-balance-error" className="transaction-field-error">
              {errors.initial_balance_rupiah}
            </span>
          )}
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
            disabled={mutation.isPending}
            className="transaction-button transaction-primary"
          >
            {mutation.isPending ? "Menyimpan…" : wallet ? "Perbarui Dompet" : "Simpan Dompet"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
