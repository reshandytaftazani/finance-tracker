import { API_BASE_URL } from "./client.ts";
import { ApiError } from "./transactions.ts";
import type { Page } from "./transactions.ts";
import { monthRange } from "../lib/transactions.ts";
import type { Transaction } from "../lib/transactions.ts";

export interface AnalyticsSummary {
  month: number;
  year: number;
  income: string;
  expense: string;
  net_cash_flow: string;
}

export interface CategoryBreakdownItem {
  category_id: number;
  category_name: string;
  expense: string;
}

export interface AnalyticsCategoryBreakdown {
  month: number;
  year: number;
  items: CategoryBreakdownItem[];
}

function assertSafeIdentifier(id: unknown): asserts id is number {
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) {
    throw new Error(
      "ID data berada di luar batas integer aman browser. Data tidak dapat ditampilkan atau diubah agar tidak menyasar catatan yang salah."
    );
  }
}

function validatePeriod(month: number, year: number): void {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Bulan harus di antara 1 dan 12.");
  }
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new Error("Tahun harus di antara 1 dan 9999.");
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.method ? { "Content-Type": "application/json" } : {}),
      },
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error("Tidak dapat terhubung ke backend. Pastikan backend berjalan, lalu coba lagi.");
  }

  if (!response.ok) {
    const message =
      response.status === 422
        ? "Periode bulan atau tahun tidak valid."
        : response.status === 404
        ? "Data tidak ditemukan."
        : response.status === 503
        ? "Backend belum siap. Jalankan migration dan seed sesuai README, lalu coba lagi."
        : response.status === 403
        ? "Akses ditolak. Pastikan aplikasi dibuka melalui alamat lokal yang diizinkan."
        : "Permintaan analytics gagal. Coba lagi setelah memastikan backend berjalan.";
    throw new ApiError(response.status, message);
  }

  return JSON.parse(await response.text(), (key, value) => {
    if (key === "id" || key === "category_id") assertSafeIdentifier(value);
    return value;
  });
}

export async function fetchAnalyticsSummary(
  month: number,
  year: number,
  signal?: AbortSignal
): Promise<AnalyticsSummary> {
  validatePeriod(month, year);
  return request<AnalyticsSummary>(`/api/v1/analytics/summary?month=${month}&year=${year}`, {
    signal,
  });
}

export async function fetchAnalyticsByCategory(
  month: number,
  year: number,
  signal?: AbortSignal
): Promise<AnalyticsCategoryBreakdown> {
  validatePeriod(month, year);
  return request<AnalyticsCategoryBreakdown>(
    `/api/v1/analytics/by-category?month=${month}&year=${year}`,
    { signal }
  );
}

export async function fetchRecentTransactions(
  month: number,
  year: number,
  signal?: AbortSignal
): Promise<Transaction[]> {
  validatePeriod(month, year);
  const padMonth = String(month).padStart(2, "0");
  const range = monthRange(`${String(year).padStart(4, "0")}-${padMonth}`);
  if (!range) throw new Error("Pilih periode bulan yang valid.");

  const params = new URLSearchParams({
    start_date: range.start_date,
    end_date: range.end_date,
    page: "1",
    page_size: "5",
  });
  const result = await request<Page<Transaction>>(`/api/v1/transactions?${params}`, { signal });
  return result.items;
}
