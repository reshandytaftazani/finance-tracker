import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ApiError, invalidateTransactionQueries, saveTransaction } from "../api/transactions";
import { jakartaToday, transactionPayload, validateTransaction } from "../lib/transactions";
import type { Category, FieldErrors, Transaction, TransactionDraft } from "../lib/transactions";

interface Props {
  transaction: Transaction | null;
  categories: Category[];
  categoriesReady: boolean;
  onCancel: () => void;
  onSaved: () => void;
}

export function TransactionForm({ transaction, categories, categoriesReady, onCancel, onSaved }: Props) {
  const [draft, setDraft] = useState<TransactionDraft>(() => transaction ? {
    date: transaction.date, type: transaction.type, category_id: String(transaction.category_id),
    amount_rupiah: transaction.amount_rupiah, description: transaction.description,
  } : { date: jakartaToday(), type: "expense", category_id: "", amount_rupiah: "", description: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const locked = useRef(false);
  const focusAfterSubmit = useRef(false);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => saveTransaction(transactionPayload(draft), transaction?.id),
    onSuccess: async () => {
      await invalidateTransactionQueries(client);
      onSaved();
    },
  });
  useEffect(() => { formRef.current?.querySelector<HTMLInputElement>("[name=date]")?.focus(); }, []);
  useEffect(() => {
    // Server errors arrive while the fieldset may still be disabled. Focus only
    // after React has committed the enabled controls and their inline errors.
    if (!mutation.isPending && focusAfterSubmit.current) {
      focusAfterSubmit.current = false;
      focusError(errors);
    }
  }, [mutation.isPending, errors]);

  function change(field: keyof TransactionDraft, value: string) {
    setDraft((previous) => ({ ...previous, [field]: value, ...(field === "type" ? { category_id: "" } : {}) }));
    setErrors((previous) => ({ ...previous, [field]: undefined, ...(field === "type" ? { category_id: undefined } : {}) }));
    mutation.reset();
  }

  function focusError(next: FieldErrors) {
    const first = Object.keys(next)[0];
    if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || !categoriesReady) return;
    const next = validateTransaction(draft, categories);
    setErrors(next);
    if (Object.keys(next).length) { focusError(next); return; }
    locked.current = true;
    try {
      await mutation.mutateAsync();
    } catch (error) {
      if (error instanceof ApiError) {
        focusAfterSubmit.current = true;
        setErrors(error.fieldErrors);
      }
    } finally { locked.current = false; }
  }

  const attributes = (field: keyof TransactionDraft) => ({
    id: `transaction-${field}`, name: field, "aria-invalid": Boolean(errors[field]),
    "aria-describedby": `${field}-error${field === "amount_rupiah" || field === "description" ? ` ${field}-hint` : ""}`,
  });
  const errorText = (field: keyof TransactionDraft) => <span id={`${field}-error`} className="transaction-field-error">{errors[field]}</span>;

  return (
    <section aria-labelledby="transaction-form-title" className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6">
      <h2 id="transaction-form-title" className="text-lg font-semibold text-slate-900">{transaction ? "Edit transaksi" : "Tambah transaksi"}</h2>
      <p className="mt-1 text-sm text-slate-600">Catat rupiah utuh. Tanggal mengikuti kalender lokal, bukan waktu UTC.</p>
      <form ref={formRef} noValidate onSubmit={submit} className="mt-5 space-y-5">
        <fieldset disabled={mutation.isPending} className="grid gap-5 sm:grid-cols-2">
          <div className="transaction-field">
            <label htmlFor="transaction-date">Tanggal</label>
            <input {...attributes("date")} className="transaction-control" type="date" min="0001-01-01" max="9999-12-31" required value={draft.date} onChange={(event) => change("date", event.target.value)} />
            {errorText("date")}
          </div>
          <div className="transaction-field">
            <label htmlFor="transaction-type">Tipe</label>
            <select {...attributes("type")} className="transaction-control" value={draft.type} onChange={(event) => change("type", event.target.value)}>
              <option value="expense">Pengeluaran</option><option value="income">Pemasukan</option>
            </select>
            {errorText("type")}
          </div>
          <div className="transaction-field">
            <label htmlFor="transaction-category_id">Kategori</label>
            <select {...attributes("category_id")} className="transaction-control" required disabled={!categoriesReady || mutation.isPending} value={draft.category_id} onChange={(event) => change("category_id", event.target.value)}>
              <option value="">Pilih kategori</option>
              {categories.filter((category) => category.type === draft.type).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            {errorText("category_id")}
            {categoriesReady && !categories.some((category) => category.type === draft.type) && <p className="text-sm text-slate-600">Belum ada kategori untuk tipe ini. Siapkan kategori melalui API sebelum mencatat transaksi.</p>}
          </div>
          <div className="transaction-field">
            <label htmlFor="transaction-amount_rupiah">Nominal (Rp)</label>
            <input {...attributes("amount_rupiah")} className="transaction-control tabular-nums" type="text" inputMode="numeric" required autoComplete="off" value={draft.amount_rupiah} onChange={(event) => change("amount_rupiah", event.target.value)} />
            <p id="amount_rupiah-hint" className="text-sm text-slate-600">Contoh: 150000. Tanpa titik, koma, atau pecahan.</p>
            {errorText("amount_rupiah")}
          </div>
          <div className="transaction-field sm:col-span-2">
            <label htmlFor="transaction-description">Deskripsi <span className="font-normal text-slate-600">(opsional)</span></label>
            <textarea {...attributes("description")} className="transaction-control min-h-24 resize-y" rows={2} value={draft.description} onChange={(event) => change("description", event.target.value)} />
            <p id="description-hint" className="text-sm text-slate-600">Maksimal 200 karakter.</p>
            {errorText("description")}
          </div>
        </fieldset>
        {mutation.error && <p role="alert" className="text-sm text-red-700">{mutation.error.message}</p>}
        {!categoriesReady && <p className="text-sm text-slate-600">Form dapat disimpan setelah kategori berhasil dimuat. Isian Anda tetap tersimpan di form ini.</p>}
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={mutation.isPending || !categoriesReady} className="transaction-button transaction-primary">{mutation.isPending ? "Menyimpan…" : transaction ? "Simpan perubahan" : "Simpan transaksi"}</button>
          <button type="button" disabled={mutation.isPending} onClick={onCancel} className="transaction-button">Batal</button>
        </div>
      </form>
    </section>
  );
}
