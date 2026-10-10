import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { BudgetApiError, invalidateBudgetQueries, saveBudget } from "../api/budgets";
import { budgetPayload, validateBudget } from "../lib/budgets";
import type { BudgetDraft, BudgetFieldErrors, BudgetStatusItem } from "../lib/budgets";
import type { Category } from "../lib/transactions";

export function BudgetForm({ budget, period, categories, categoriesReady, onCancel, onSaved }: {
  budget: BudgetStatusItem | null; period: string; categories: Category[];
  categoriesReady: boolean; onCancel: () => void; onSaved: (period: string) => void;
}) {
  const [draft, setDraft] = useState<BudgetDraft>(() => ({ period, category_id: budget ? String(budget.category_id) : "", amount_rupiah: budget?.budget ?? "" }));
  const [errors, setErrors] = useState<BudgetFieldErrors>({});
  const form = useRef<HTMLFormElement>(null);
  const locked = useRef(false);
  const focusAfterSubmit = useRef(false);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => saveBudget(budgetPayload(draft), budget?.id),
    onSuccess: async () => { await invalidateBudgetQueries(client); onSaved(draft.period); },
  });
  function focusError(next: BudgetFieldErrors) {
    const field = Object.keys(next)[0];
    if (field) form.current?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
  }
  useEffect(() => { form.current?.querySelector<HTMLInputElement>("[name=period]")?.focus(); }, []);
  useEffect(() => {
    if (!mutation.isPending && focusAfterSubmit.current) {
      focusAfterSubmit.current = false; focusError(errors);
    }
  }, [mutation.isPending, errors]);
  function change(field: keyof BudgetDraft, value: string) {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
    mutation.reset();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || !categoriesReady) return;
    const next = validateBudget(draft, categories);
    setErrors(next);
    if (Object.keys(next).length) { focusError(next); return; }
    locked.current = true;
    try { await mutation.mutateAsync(); }
    catch (error) {
      if (error instanceof BudgetApiError) { focusAfterSubmit.current = true; setErrors(error.fieldErrors); }
    } finally { locked.current = false; }
  }
  const attributes = (field: keyof BudgetDraft) => ({
    id: `budget-${field}`, name: field, "aria-invalid": Boolean(errors[field]),
    "aria-describedby": `budget-${field}-error${field === "amount_rupiah" ? " budget-amount-hint" : ""}`,
  });
  const errorText = (field: keyof BudgetDraft) => <span id={`budget-${field}-error`} className="transaction-field-error">{errors[field]}</span>;

  return <section aria-labelledby="budget-form-title" className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6">
    <h2 id="budget-form-title" className="text-lg font-semibold text-slate-900">{budget ? "Edit budget" : "Tambah budget"}</h2>
    <p className="mt-1 text-sm text-slate-600">Satu batas pengeluaran per kategori dan bulan. Transaksi yang sudah dicatat tidak diubah.</p>
    <form ref={form} noValidate onSubmit={submit} className="mt-5 space-y-5">
      <fieldset disabled={mutation.isPending} className="grid gap-5 sm:grid-cols-3">
        <div className="transaction-field">
          <label htmlFor="budget-period">Bulan budget</label>
          <input {...attributes("period")} type="month" min="0001-01" max="9999-12" required className="transaction-control" value={draft.period} onChange={(event) => change("period", event.target.value)} />
          {errorText("period")}
        </div>
        <div className="transaction-field">
          <label htmlFor="budget-category_id">Kategori pengeluaran</label>
          <select {...attributes("category_id")} required className="transaction-control" disabled={!categoriesReady || mutation.isPending} value={draft.category_id} onChange={(event) => change("category_id", event.target.value)}>
            <option value="">Pilih kategori</option>
            {categories.filter((category) => category.type === "expense").map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          {errorText("category_id")}
          {categoriesReady && !categories.some((category) => category.type === "expense") && <p className="text-sm text-slate-600">Belum ada kategori pengeluaran. Siapkan kategori melalui API sebelum membuat budget.</p>}
        </div>
        <div className="transaction-field">
          <label htmlFor="budget-amount_rupiah">Nominal budget (Rp)</label>
          <input {...attributes("amount_rupiah")} type="text" inputMode="numeric" required autoComplete="off" className="transaction-control tabular-nums" value={draft.amount_rupiah} onChange={(event) => change("amount_rupiah", event.target.value)} />
          <p id="budget-amount-hint" className="text-sm text-slate-600">Contoh: 150000. Rupiah utuh, tanpa titik atau koma.</p>
          {errorText("amount_rupiah")}
        </div>
      </fieldset>
      {mutation.error && <p role="alert" className="text-sm text-red-700">{mutation.error.message}</p>}
      {!categoriesReady && <p className="text-sm text-slate-600">Simpan setelah kategori berhasil dimuat. Isian Anda tetap tersimpan di form ini.</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={mutation.isPending || !categoriesReady} className="transaction-button transaction-primary">{mutation.isPending ? "Menyimpan…" : budget ? "Simpan perubahan" : "Simpan budget"}</button>
        <button type="button" disabled={mutation.isPending} onClick={onCancel} className="transaction-button">Batal</button>
      </div>
    </form>
  </section>;
}
