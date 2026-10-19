import type { QueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "./client.ts";
import type { TransferItem, TransferPage, TransferPayload, TransferFieldErrors } from "../lib/transfers.ts";

export class TransferApiError extends Error {
  status: number;
  fieldErrors: TransferFieldErrors;
  constructor(status: number, message: string, fieldErrors: TransferFieldErrors = {}) {
    super(message);
    this.name = "TransferApiError";
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
    response = await fetch(`${API_BASE_URL}/api/v1/transfers${path}`, {
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
    const errors: TransferFieldErrors = {};
    if (Array.isArray(data?.detail)) {
      for (const item of data.detail) {
        const field = item.loc?.[1];
        if (field === "from_wallet_id") errors.from_wallet_id = "Dompet asal tidak valid.";
        if (field === "to_wallet_id") errors.to_wallet_id = "Dompet tujuan tidak valid.";
        if (field === "amount_rupiah") errors.amount_rupiah = "Nominal transfer ditolak server.";
        if (field === "date") errors.date = "Tanggal transfer ditolak server.";
        if (field === "description") errors.description = "Deskripsi transfer ditolak server.";
      }
    }
    const message = response.status === 422
      ? (typeof data?.detail === "string" ? data.detail : "Periksa isian transfer, lalu coba lagi.")
      : response.status === 404 ? "Transfer atau dompet tidak ditemukan."
      : "Permintaan transfer gagal. Coba lagi.";
    throw new TransferApiError(response.status, message, errors);
  }
  if (response.status === 204) return undefined as T;
  return JSON.parse(await response.text(), (key, value) => {
    if (key === "id" || key === "from_wallet_id" || key === "to_wallet_id") assertSafeIdentifier(value);
    return value;
  });
}

export async function fetchTransfers(page = 1, pageSize = 20, signal?: AbortSignal): Promise<TransferPage> {
  return request<TransferPage>(`?page=${page}&page_size=${pageSize}`, { signal });
}

export async function createTransfer(payload: TransferPayload): Promise<TransferItem> {
  assertSafeIdentifier(payload.from_wallet_id);
  assertSafeIdentifier(payload.to_wallet_id);
  if (payload.from_wallet_id === payload.to_wallet_id) {
    throw new TransferApiError(422, "Dompet asal dan tujuan tidak boleh sama.", {
      to_wallet_id: "Dompet asal dan tujuan tidak boleh sama.",
    });
  }
  return request<TransferItem>("", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteTransfer(id: number): Promise<void> {
  assertSafeIdentifier(id);
  return request<void>(`/${id}`, { method: "DELETE" });
}

export async function invalidateTransferQueries(client: QueryClient): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: ["transfers"] }),
    client.invalidateQueries({ queryKey: ["wallets"] }),
    client.invalidateQueries({ queryKey: ["transactions"] }),
  ]);
}
