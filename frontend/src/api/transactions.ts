import type { QueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "./client.ts";
import { monthRange } from "../lib/transactions.ts";
import type { Category, FieldErrors, Transaction, TransactionFilters, TransactionPayload } from "../lib/transactions.ts";

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export class ApiError extends Error {
  status: number;
  fieldErrors: FieldErrors;

  constructor(status: number, message: string, fieldErrors: FieldErrors = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

// The backend permits 64-bit IDs, but JSON numbers above 2^53−1 are not exact
// in JavaScript. Fail closed instead of displaying/using a rounded identifier.
function assertSafeIdentifier(id: unknown): asserts id is number {
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) {
    throw new Error("ID data berada di luar batas integer aman browser. Data tidak dapat ditampilkan atau diubah agar tidak menyasar catatan yang salah.");
  }
}

async function requestResponse(path: string, options: RequestInit = {}, accept = "application/json"): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: { Accept: accept, ...(options.method ? { "Content-Type": "application/json" } : {}) },
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error("Tidak dapat terhubung ke backend. Pastikan backend berjalan, lalu coba lagi.");
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const errors: FieldErrors = {};
    const labels: Record<string, string> = {
      date: "Tanggal tidak valid.", type: "Tipe transaksi tidak valid.",
      category_id: "Kategori tidak valid. Pilih kategori yang sesuai dengan tipe.",
      amount_rupiah: "Nominal ditolak server. Gunakan digit rupiah utuh dalam batas yang diizinkan.",
      description: "Deskripsi ditolak server. Gunakan maksimal 200 karakter tanpa NUL.",
    };
    if (Array.isArray(data?.detail)) {
      for (const item of data.detail) {
        const field = item.loc?.[1];
        if (field in labels) errors[field as keyof FieldErrors] = labels[field];
      }
    } else if (data?.detail === "Category type must match transaction type") {
      errors.category_id = labels.category_id;
    }
    const message = response.status === 422 ? "Periksa isian transaksi, lalu coba lagi."
      : response.status === 404 ? "Data tidak ditemukan atau sudah dihapus. Muat ulang data, lalu coba lagi."
      : response.status === 409 ? "Perubahan tidak dapat disimpan karena konflik data. Muat ulang, lalu coba lagi."
      : response.status === 503 ? "Backend belum siap. Jalankan migration dan seed sesuai README, lalu coba lagi."
      : response.status === 403 ? "Akses ditolak. Pastikan aplikasi dibuka melalui alamat lokal yang diizinkan."
      : "Permintaan gagal. Coba lagi setelah memastikan backend berjalan.";
    throw new ApiError(response.status, message, errors);
  }
  return response;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await requestResponse(path, options);
  if (response.status === 204) return undefined as T;
  return JSON.parse(await response.text(), (key, value) => {
    if (key === "id" || key === "category_id") assertSafeIdentifier(value);
    return value;
  });
}

export async function fetchCategories(signal?: AbortSignal): Promise<Category[]> {
  const items: Category[] = [];
  let page = 1;
  while (true) {
    const result = await request<Page<Category>>(`/api/v1/categories?page=${page}&page_size=100`, { signal });
    items.push(...result.items);
    if (items.length >= result.total || result.items.length === 0) return items;
    page += 1;
  }
}

function filterParams(filters: TransactionFilters): URLSearchParams {
  const range = monthRange(filters.month);
  if (!range) throw new Error("Pilih bulan yang valid.");
  const params = new URLSearchParams(range);
  if (filters.type !== "all") params.set("type", filters.type);
  if (filters.category_id !== "all") {
    assertSafeIdentifier(Number(filters.category_id));
    params.set("category_id", filters.category_id);
  }
  return params;
}

export async function fetchTransactions(filters: TransactionFilters, signal?: AbortSignal): Promise<Page<Transaction>> {
  const params = filterParams(filters);
  params.set("page", String(filters.page));
  params.set("page_size", "20");
  return request(`/api/v1/transactions?${params}`, { signal });
}

export async function exportTransactions(filters: TransactionFilters, signal?: AbortSignal): Promise<Blob> {
  const params = filterParams(filters);
  const response = await requestResponse(`/api/v1/transactions/export/csv?${params}`, { signal }, "text/csv");
  if (response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "text/csv") {
    throw new Error("Backend tidak mengirim CSV. Periksa backend, lalu coba lagi export.");
  }
  return response.blob();
}

export async function saveTransaction(payload: TransactionPayload, id?: number): Promise<Transaction> {
  assertSafeIdentifier(payload.category_id);
  if (id !== undefined) assertSafeIdentifier(id);
  return request(`/api/v1/transactions${id === undefined ? "" : `/${id}`}`, {
    method: id === undefined ? "POST" : "PATCH", body: JSON.stringify(payload),
  });
}

export async function deleteTransaction(id: number): Promise<void> {
  assertSafeIdentifier(id);
  return request(`/api/v1/transactions/${id}`, { method: "DELETE" });
}

// Phase 4 summary/breakdown queries must share the ['analytics'] prefix.
export async function invalidateTransactionQueries(client: QueryClient): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: ["transactions"] }),
    client.invalidateQueries({ queryKey: ["analytics"] }),
  ]);
}
