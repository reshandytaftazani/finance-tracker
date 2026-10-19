export type WalletType = "bank" | "cash" | "ewallet" | "investment" | "other";

export const WALLET_TYPES: readonly WalletType[] = ["bank", "cash", "ewallet", "investment", "other"];

export const WALLET_TYPE_LABELS: Record<WalletType, string> = {
  bank: "Bank",
  cash: "Tunai",
  ewallet: "E-Wallet",
  investment: "Investasi",
  other: "Lainnya",
};

export interface WalletItem {
  id: number;
  name: string;
  type: WalletType;
  initial_balance_rupiah: string;
  current_balance_rupiah: string;
  created_at: string;
  updated_at: string;
}

export interface WalletListResponse {
  items: WalletItem[];
  total_balance_rupiah: string;
}

export interface WalletDraft {
  name: string;
  type: string;
  initial_balance_rupiah: string;
}

export type WalletFieldErrors = Partial<Record<keyof WalletDraft, string>>;

export interface WalletPayload {
  name: string;
  type: WalletType;
  initial_balance_rupiah?: string;
}

export function validateWallet(draft: WalletDraft): WalletFieldErrors {
  const errors: WalletFieldErrors = {};
  const trimmedName = draft.name.trim();
  if (!trimmedName || draft.name.includes("\0") || [...trimmedName].length > 50) {
    errors.name = "Nama dompet wajib diisi, maksimal 50 karakter tanpa NUL.";
  }
  if (!WALLET_TYPES.includes(draft.type as WalletType)) {
    errors.type = "Pilih tipe dompet yang valid.";
  }
  if (
    !/^[0-9]+$/.test(draft.initial_balance_rupiah) ||
    BigInt(draft.initial_balance_rupiah) < 0n ||
    BigInt(draft.initial_balance_rupiah) > 9999999999999n
  ) {
    errors.initial_balance_rupiah = "Saldo awal harus berupa angka 0–9.999.999.999.999 rupiah.";
  }
  return errors;
}

export function walletPayload(draft: WalletDraft): WalletPayload {
  return {
    name: draft.name.trim(),
    type: draft.type as WalletType,
    initial_balance_rupiah: draft.initial_balance_rupiah,
  };
}
