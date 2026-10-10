import { monthRange } from "./transactions.ts";
import type { Category } from "./transactions.ts";

export interface BudgetDraft { period: string; category_id: string; amount_rupiah: string }
export type BudgetFieldErrors = Partial<Record<keyof BudgetDraft, string>>;
export interface BudgetPayload { category_id: number; amount_rupiah: string; month: number; year: number }
export interface Budget extends BudgetPayload { id: number; created_at: string; updated_at: string }
export interface BudgetStatusItem {
  id: number; category_id: number; category_name: string;
  budget: string; spent: string; remaining: string; percentage: string;
  status: "normal" | "warning" | "over_budget";
}
export interface BudgetStatus { month: number; year: number; items: BudgetStatusItem[] }

export function validateBudget(draft: BudgetDraft, categories: readonly Category[]): BudgetFieldErrors {
  const errors: BudgetFieldErrors = {};
  if (!monthRange(draft.period)) errors.period = "Pilih bulan budget yang valid.";
  const category = categories.find((item) => String(item.id) === draft.category_id);
  if (!category || category.type !== "expense") errors.category_id = "Pilih kategori pengeluaran.";
  if (!/^[0-9]+$/.test(draft.amount_rupiah) || BigInt(draft.amount_rupiah) < 1n || BigInt(draft.amount_rupiah) > 9999999999999n) {
    errors.amount_rupiah = "Masukkan 1–9.999.999.999.999 rupiah, hanya digit tanpa titik atau koma.";
  }
  return errors;
}

export function budgetPayload(draft: BudgetDraft): BudgetPayload {
  return { category_id: Number(draft.category_id), amount_rupiah: draft.amount_rupiah, month: Number(draft.period.slice(5)), year: Number(draft.period.slice(0, 4)) };
}

// Only the bounded bar value becomes a Number. Actual money and percentage
// labels remain exact strings; huge aggregates cannot overflow the bar.
export function budgetProgress(spent: string, budget: string): number {
  const hundredths = BigInt(spent) * 10000n / BigInt(budget);
  return Number(hundredths > 10000n ? 10000n : hundredths) / 100;
}

export const budgetStatusLabels = { normal: "Normal", warning: "Mendekati batas", over_budget: "Over budget" } as const;
