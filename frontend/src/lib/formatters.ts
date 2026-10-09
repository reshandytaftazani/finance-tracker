/**
 * Format nominal integer rupiah menjadi string tampilan standar IDR.
 * Contoh: 150000 -> "Rp 150.000", "-500" -> "-Rp 500"
 */
export function formatRupiah(amount: number | string | bigint): string {
  if (typeof amount === "bigint") {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(amount);
  }
  if (typeof amount === "string") {
    const trimmed = amount.trim();
    if (!/^-?[0-9]+$/.test(trimmed)) {
      return "Rp 0";
    }
    try {
      const b = BigInt(trimmed);
      return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(b);
    } catch {
      return "Rp 0";
    }
  }
  if (typeof amount === "number") {
    if (isNaN(amount) || !isFinite(amount)) return "Rp 0";
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(amount);
  }
  return "Rp 0";
}

/**
 * Format tanggal YYYY-MM-DD menjadi format tanggal lokal Indonesia.
 */
export function formatDate(dateString: string): string {
  try {
    const [year, month, day] = dateString.split("-").map(Number);
    if (!year || !month || !day) return dateString;
    // The multi-argument Date constructor rewrites years 0–99 as 1900–1999.
    const date = new Date(0);
    date.setFullYear(year, month - 1, day);
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
  } catch {
    return dateString;
  }
}
