import { monthRange } from "./transactions.ts";

export interface TransferItem {
  id: number;
  from_wallet_id: number;
  from_wallet_name: string;
  to_wallet_id: number;
  to_wallet_name: string;
  amount_rupiah: string;
  date: string;
  description: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TransferPage {
  items: TransferItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface TransferDraft {
  from_wallet_id: string;
  to_wallet_id: string;
  amount_rupiah: string;
  date: string;
  description: string;
  notes?: string;
}

export type TransferFieldErrors = Partial<Record<keyof TransferDraft, string>>;

export interface TransferPayload {
  from_wallet_id: number;
  to_wallet_id: number;
  amount_rupiah: string;
  date: string;
  description: string;
  notes?: string | null;
}

export function validateTransfer(
  draft: TransferDraft,
  wallets: readonly { id: number }[]
): TransferFieldErrors {
  const errors: TransferFieldErrors = {};
  if (!draft.from_wallet_id) {
    errors.from_wallet_id = "Pilih dompet asal.";
  } else if (!wallets.some((w) => String(w.id) === draft.from_wallet_id)) {
    errors.from_wallet_id = "Dompet asal tidak valid.";
  }

  if (!draft.to_wallet_id) {
    errors.to_wallet_id = "Pilih dompet tujuan.";
  } else if (!wallets.some((w) => String(w.id) === draft.to_wallet_id)) {
    errors.to_wallet_id = "Dompet tujuan tidak valid.";
  }

  if (draft.from_wallet_id && draft.to_wallet_id && draft.from_wallet_id === draft.to_wallet_id) {
    errors.to_wallet_id = "Dompet asal dan tujuan tidak boleh sama.";
  }

  if (
    !/^[0-9]+$/.test(draft.amount_rupiah) ||
    BigInt(draft.amount_rupiah) < 1n ||
    BigInt(draft.amount_rupiah) > 9999999999999n
  ) {
    errors.amount_rupiah = "Masukkan nominal transfer 1–9.999.999.999.999 rupiah.";
  }

  const range = monthRange(draft.date.slice(0, 7));
  if (
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(draft.date) ||
    !range ||
    draft.date < range.start_date ||
    draft.date > range.end_date
  ) {
    errors.date = "Pilih tanggal kalender yang valid.";
  }

  if (draft.description.includes("\0") || [...draft.description.trim()].length > 200) {
    errors.description = "Deskripsi maksimal 200 karakter dan tidak boleh berisi karakter NUL.";
  }

  return errors;
}

export function transferPayload(draft: TransferDraft): TransferPayload {
  return {
    from_wallet_id: Number(draft.from_wallet_id),
    to_wallet_id: Number(draft.to_wallet_id),
    amount_rupiah: draft.amount_rupiah,
    date: draft.date,
    description: draft.description.trim(),
    notes: draft.notes ? draft.notes.trim() : null,
  };
}
