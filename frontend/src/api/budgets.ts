import type { QueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "./client.ts";
import { monthRange } from "../lib/transactions.ts";
import type { Budget, BudgetFieldErrors, BudgetPayload, BudgetStatus } from "../lib/budgets.ts";

export class BudgetApiError extends Error {
  status: number;
  fieldErrors: BudgetFieldErrors;
  constructor(status: number, message: string, fieldErrors: BudgetFieldErrors = {}) {
    super(message); this.name = "BudgetApiError"; this.status = status; this.fieldErrors = fieldErrors;
  }
}

function assertSafeIdentifier(id: unknown): asserts id is number {
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) {
    throw new Error("ID data berada di luar batas integer aman browser. Muat ulang data yang didukung agar tidak menyasar catatan yang salah.");
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/budgets${path}`, {
      ...options, headers: { Accept: "application/json", ...(options.method ? { "Content-Type": "application/json" } : {}) },
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error("Tidak dapat terhubung ke backend. Pastikan backend berjalan, lalu coba lagi.");
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const errors: BudgetFieldErrors = {};
    if (Array.isArray(data?.detail)) {
      for (const item of data.detail) {
        const field = item.loc?.[1];
        if (field === "month" || field === "year") errors.period = "Bulan budget ditolak server. Pilih bulan yang valid.";
        if (field === "category_id") errors.category_id = "Kategori ditolak server. Pilih kategori pengeluaran.";
        if (field === "amount_rupiah") errors.amount_rupiah = "Nominal ditolak server. Gunakan digit rupiah utuh dalam batas yang diizinkan.";
      }
    } else if (data?.detail === "Budget requires an expense category") errors.category_id = "Pilih kategori pengeluaran.";
    const message = response.status === 409 ? "Budget kategori/periode sudah ada atau perubahan mengalami konflik. Muat ulang data atau ubah isian, lalu coba lagi."
      : response.status === 422 ? "Periksa isian budget atau periode, lalu coba lagi."
      : response.status === 404 ? "Budget atau kategori tidak ditemukan. Muat ulang data, lalu coba lagi."
      : response.status === 503 ? "Backend belum siap. Jalankan migration dan seed sesuai README, lalu coba lagi."
      : response.status === 403 ? "Akses ditolak. Pastikan alamat lokal aplikasi dan backend sesuai."
      : "Permintaan budget gagal. Pastikan backend berjalan, lalu coba lagi.";
    throw new BudgetApiError(response.status, message, errors);
  }
  if (response.status === 204) return undefined as T;
  return JSON.parse(await response.text(), (key, value) => {
    if (key === "id" || key === "category_id") assertSafeIdentifier(value);
    return value;
  });
}

export async function fetchBudgetStatus(period: string, signal?: AbortSignal): Promise<BudgetStatus> {
  if (!monthRange(period)) throw new Error("Pilih periode bulan yang valid.");
  const month = Number(period.slice(5)), year = Number(period.slice(0, 4));
  const data = await request<BudgetStatus>(`/status?month=${month}&year=${year}`, { signal });
  const invalid = () => { throw new Error("Data budget atau periode dari backend tidak valid. Muat ulang setelah memeriksa backend."); };
  if (!data || data.month !== month || data.year !== year || !Array.isArray(data.items)) invalid();
  for (const item of data.items) {
    if (!item) invalid();
    assertSafeIdentifier(item.id); assertSafeIdentifier(item.category_id);
    if (typeof item.category_name !== "string" || typeof item.budget !== "string" || !/^[0-9]+$/.test(item.budget) || BigInt(item.budget) < 1n || BigInt(item.budget) > 9999999999999n
      || typeof item.spent !== "string" || !/^[0-9]+$/.test(item.spent)
      || typeof item.remaining !== "string" || !/^-?[0-9]+$/.test(item.remaining)
      || typeof item.percentage !== "string" || !/^[0-9]+\.[0-9]{2}$/.test(item.percentage)
      || !["normal", "warning", "over_budget"].includes(item.status)) invalid();
  }
  return data;
}

export async function saveBudget(payload: BudgetPayload, id?: number): Promise<Budget> {
  assertSafeIdentifier(payload.category_id);
  if (id !== undefined) assertSafeIdentifier(id);
  return request(id === undefined ? "" : `/${id}`, { method: id === undefined ? "POST" : "PATCH", body: JSON.stringify(payload) });
}

export async function deleteBudget(id: number): Promise<void> {
  assertSafeIdentifier(id);
  return request(`/${id}`, { method: "DELETE" });
}

export async function invalidateBudgetQueries(client: QueryClient): Promise<void> {
  await client.invalidateQueries({ queryKey: ["budgets"] });
}
