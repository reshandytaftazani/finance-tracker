export type TransactionType = "income" | "expense";

export interface Category {
  id: number;
  name: string;
  type: TransactionType;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: number;
  category_id: number;
  wallet_id: number;
  wallet_name?: string;
  type: TransactionType;
  amount_rupiah: string;
  date: string;
  description: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TransactionDraft {
  date: string;
  type: string;
  category_id: string;
  wallet_id?: string;
  amount_rupiah: string;
  description: string;
}

export type FieldErrors = Partial<Record<keyof TransactionDraft, string>>;
export type TransactionPayload = Pick<Transaction, "date" | "type" | "category_id" | "amount_rupiah" | "description"> & {
  wallet_id?: number;
};
export interface TransactionFilters {
  // "all" omits date boundaries; otherwise use a validated YYYY-MM period.
  month: string;
  type: TransactionType | "all";
  category_id: string;
  wallet_id?: string;
  page: number;
  search?: string;
  min_amount?: string;
  max_amount?: string;
}

const leapYear = (year: number) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
const daysInMonth = (year: number, month: number) => [31, leapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];

export function monthRange(month: string): { start_date: string; end_date: string } | null {
  if (!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const year = Number(month.slice(0, 4));
  if (year < 1) return null;
  return { start_date: `${month}-01`, end_date: `${month}-${daysInMonth(year, Number(month.slice(5)))}` };
}

export function jakartaToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function validateTransaction(
  draft: TransactionDraft,
  categories: readonly Category[],
  wallets?: readonly { id: number }[]
): FieldErrors {
  const errors: FieldErrors = {};
  const range = monthRange(draft.date.slice(0, 7));
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(draft.date) || !range || draft.date < range.start_date || draft.date > range.end_date) {
    errors.date = "Pilih tanggal kalender yang valid.";
  }
  if (draft.type !== "income" && draft.type !== "expense") errors.type = "Pilih tipe transaksi.";
  const category = categories.find((item) => String(item.id) === draft.category_id);
  if (!category || category.type !== draft.type) errors.category_id = "Pilih kategori yang sesuai dengan tipe transaksi.";
  if (wallets !== undefined && draft.wallet_id !== undefined && draft.wallet_id !== "") {
    const wallet = wallets.find((w) => String(w.id) === draft.wallet_id);
    if (!wallet) errors.wallet_id = "Pilih dompet yang valid.";
  } else if (wallets !== undefined && (draft.wallet_id === undefined || draft.wallet_id === "")) {
    errors.wallet_id = "Pilih dompet.";
  }
  if (!/^[0-9]+$/.test(draft.amount_rupiah) || BigInt(draft.amount_rupiah) < 1n || BigInt(draft.amount_rupiah) > 9999999999999n) {
    errors.amount_rupiah = "Masukkan 1–9.999.999.999.999 rupiah, hanya digit tanpa titik atau koma.";
  }
  if (draft.description.includes("\0") || [...draft.description.trim()].length > 200) {
    errors.description = "Deskripsi maksimal 200 karakter dan tidak boleh berisi karakter NUL.";
  }
  return errors;
}

// Called only after validation. Never coerce money to Number; PATCH omits notes
// so editing these fields cannot silently erase notes supplied through the API.
export function transactionPayload(draft: TransactionDraft): TransactionPayload {
  const payload: TransactionPayload = {
    date: draft.date,
    type: draft.type as TransactionType,
    category_id: Number(draft.category_id),
    amount_rupiah: draft.amount_rupiah,
    description: draft.description.trim(),
  };
  if (draft.wallet_id !== undefined && draft.wallet_id !== "") {
    payload.wallet_id = Number(draft.wallet_id);
  }
  return payload;
}
