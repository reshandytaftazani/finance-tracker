/**
 * Format nominal integer rupiah menjadi string tampilan standar IDR.
 * Contoh: 150000 -> "Rp 150.000"
 */
export function formatRupiah(amount: number | string): string {
  const numericAmount = typeof amount === "string" ? parseInt(amount, 10) : amount;
  if (isNaN(numericAmount)) {
    return "Rp 0";
  }
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(numericAmount);
}

/**
 * Format tanggal YYYY-MM-DD menjadi format tanggal lokal Indonesia.
 */
export function formatDate(dateString: string): string {
  try {
    const [year, month, day] = dateString.split("-").map(Number);
    if (!year || !month || !day) return dateString;
    const date = new Date(year, month - 1, day);
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
  } catch {
    return dateString;
  }
}
