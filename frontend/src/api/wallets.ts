import type { QueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "./client.ts";
import type { WalletItem, WalletListResponse, WalletPayload, WalletFieldErrors } from "../lib/wallets.ts";

export class WalletApiError extends Error {
  status: number;
  fieldErrors: WalletFieldErrors;
  constructor(status: number, message: string, fieldErrors: WalletFieldErrors = {}) {
    super(message);
    this.name = "WalletApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

function assertSafeIdentifier(id: unknown): asserts id is number {
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) {
    throw new Error("ID data berada di luar batas integer aman browser. Muat ulang data yang didukung.");
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/wallets${path}`, {
      ...options,
      credentials: "include",
      headers: { Accept: "application/json", ...(options.method ? { "Content-Type": "application/json" } : {}) },
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error("Tidak dapat terhubung ke backend. Pastikan backend berjalan, lalu coba lagi.");
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const errors: WalletFieldErrors = {};
    if (Array.isArray(data?.detail)) {
      for (const item of data.detail) {
        const field = item.loc?.[1];
        if (field === "name") errors.name = "Nama dompet ditolak server. Maksimal 50 karakter.";
        if (field === "type") errors.type = "Tipe dompet ditolak server.";
        if (field === "initial_balance_rupiah") errors.initial_balance_rupiah = "Saldo awal ditolak server.";
      }
    }
    const message = response.status === 409
      ? (typeof data?.detail === "string" ? data.detail : "Nama dompet sudah digunakan atau terdapat transaksi/transfer terkait.")
      : response.status === 422 ? "Periksa isian dompet, lalu coba lagi."
      : response.status === 404 ? "Dompet tidak ditemukan atau sudah dihapus."
      : "Permintaan dompet gagal. Coba lagi.";
    throw new WalletApiError(response.status, message, errors);
  }
  if (response.status === 204) return undefined as T;
  return JSON.parse(await response.text(), (key, value) => {
    if (key === "id") assertSafeIdentifier(value);
    return value;
  });
}

export async function fetchWallets(signal?: AbortSignal): Promise<WalletListResponse> {
  return request<WalletListResponse>("", { signal });
}

export async function saveWallet(payload: WalletPayload, id?: number): Promise<WalletItem> {
  if (id !== undefined) assertSafeIdentifier(id);
  return request<WalletItem>(id === undefined ? "" : `/${id}`, {
    method: id === undefined ? "POST" : "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteWallet(id: number): Promise<void> {
  assertSafeIdentifier(id);
  return request<void>(`/${id}`, { method: "DELETE" });
}

export async function invalidateWalletQueries(client: QueryClient): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: ["wallets"] }),
    client.invalidateQueries({ queryKey: ["transfers"] }),
    client.invalidateQueries({ queryKey: ["transactions"] }),
  ]);
}
