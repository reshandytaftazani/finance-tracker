import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  PieChart,
  Plus,
  Receipt,
  RotateCcw,
  Wallet,
} from "lucide-react";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  fetchAnalyticsByCategory,
  fetchAnalyticsSummary,
  fetchRecentTransactions,
} from "../api/analytics";
import { fetchCategories } from "../api/transactions";
import { Money } from "../components/Money";
import { formatDate, formatRupiah } from "../lib/formatters";
import { jakartaToday, monthRange } from "../lib/transactions";

export const DashboardPage: React.FC = () => {
  const [month, setMonth] = useState<string>(() => jakartaToday().slice(0, 7));

  const validMonth = Boolean(monthRange(month));
  const parsedMonth = validMonth ? Number(month.slice(5)) : 0;
  const parsedYear = validMonth ? Number(month.slice(0, 4)) : 0;

  const periodDate = new Date(0);
  periodDate.setFullYear(parsedYear, parsedMonth - 1, 1);
  const periodLabel = validMonth
    ? new Intl.DateTimeFormat("id-ID", {
        month: "long",
        year: "numeric",
      }).format(periodDate)
    : month;

  // React Query hooks with shared ['analytics'] prefix
  const summaryQuery = useQuery({
    queryKey: ["analytics", "summary", { month: parsedMonth, year: parsedYear }],
    queryFn: ({ signal }) => fetchAnalyticsSummary(parsedMonth, parsedYear, signal),
    enabled: validMonth,
  });

  const breakdownQuery = useQuery({
    queryKey: ["analytics", "by-category", { month: parsedMonth, year: parsedYear }],
    queryFn: ({ signal }) => fetchAnalyticsByCategory(parsedMonth, parsedYear, signal),
    enabled: validMonth,
  });

  const recentQuery = useQuery({
    queryKey: ["analytics", "recent", { month: parsedMonth, year: parsedYear }],
    queryFn: ({ signal }) => fetchRecentTransactions(parsedMonth, parsedYear, signal),
    enabled: validMonth,
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: ({ signal }) => fetchCategories(signal),
  });

  const categoryMap = new Map<number, string>(
    (categoriesQuery.data ?? []).map((cat) => [cat.id, cat.name])
  );

  const hasAnyError = summaryQuery.isError || breakdownQuery.isError || recentQuery.isError;
  const isAnyLoading =
    validMonth && (summaryQuery.isPending || breakdownQuery.isPending || recentQuery.isPending);

  // Net Cash Flow indicator calculation
  let netCashFlowBigInt = 0n;
  if (summaryQuery.data?.net_cash_flow) {
    try {
      netCashFlowBigInt = BigInt(summaryQuery.data.net_cash_flow);
    } catch {
      netCashFlowBigInt = 0n;
    }
  }

  const netStatus =
    netCashFlowBigInt > 0n
      ? { label: "Surplus", style: "bg-emerald-50 text-emerald-700 border-emerald-200" }
      : netCashFlowBigInt < 0n
      ? { label: "Defisit", style: "bg-rose-50 text-rose-700 border-rose-200" }
      : { label: "Seimbang", style: "bg-slate-50 text-slate-700 border-slate-200" };

  // Use one response for both the numerator and denominator. Summary may
  // still be loading, fail, or reflect a different snapshot after a mutation.
  const totalExpenseBigInt = (breakdownQuery.data?.items ?? []).reduce(
    (total, item) => total + BigInt(item.expense),
    0n
  );
  const summaryUnavailable = !validMonth || summaryQuery.isError || !summaryQuery.data;

  const defaultMonth = jakartaToday().slice(0, 7);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <header className="finance-page-header">
        <div>
          <h1 className="finance-page-title">
            Dashboard Keuangan
          </h1>
          <p className="finance-page-subtitle">
            Ringkasan arus kas dan alokasi dana untuk periode {periodLabel}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Period Selector */}
          <div className="flex items-center gap-2 bg-white px-3 rounded-xl border border-slate-200">
            <Calendar className="w-4 h-4 text-slate-500" aria-hidden="true" />
            <label htmlFor="dashboard-period" className="text-xs font-medium text-slate-700">
              Periode:
            </label>
            <input
              id="dashboard-period"
              type="month"
              min="0001-01"
              max="9999-12"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="min-h-11 text-sm font-medium bg-transparent border-none text-slate-900 cursor-pointer"
              aria-label="Pilih bulan dan tahun periode dashboard"
              aria-invalid={!validMonth}
              aria-describedby={!validMonth ? "dashboard-period-error" : undefined}
            />
          </div>

          {month !== defaultMonth && (
            <button
              type="button"
              onClick={() => setMonth(defaultMonth)}
              className="transaction-button inline-flex items-center gap-2"
              title="Kembali ke bulan berjalan"
            >
              <RotateCcw aria-hidden="true" className="w-3.5 h-3.5" />
              Bulan Ini
            </button>
          )}

          <Link
            to="/transactions"
            className="transaction-button transaction-primary inline-flex items-center justify-center gap-2"
          >
            <Plus aria-hidden="true" className="w-4 h-4" />
            Catat Transaksi
          </Link>
        </div>
      </header>

      {/* Invalid month validation warning */}
      {!validMonth && (
        <div
          role="alert"
          id="dashboard-period-error"
          className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          Pilih periode bulan yang valid (format YYYY-MM antara tahun 0001 hingga 9999) untuk melihat dashboard.
        </div>
      )}

      {/* Global Error Banner (Never disguise errors as zero) */}
      {hasAnyError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
        >
          <div>
            <h2 className="font-semibold text-red-900">Gagal memuat data dashboard</h2>
            <p className="mt-0.5 text-xs text-red-700">
              {summaryQuery.error?.message ||
                breakdownQuery.error?.message ||
                recentQuery.error?.message ||
                "Terjadi kesalahan saat mengambil data dari backend."}
            </p>
          </div>
          <button
            type="button"
            className="transaction-button text-xs py-1.5 px-3 w-fit"
            onClick={() => {
              void summaryQuery.refetch();
              void breakdownQuery.refetch();
              void recentQuery.refetch();
            }}
          >
            Coba lagi
          </button>
        </div>
      )}

      {/* Metric Cards Grid */}
      <section aria-label="Ringkasan Arus Kas" className="finance-metrics">
        {/* Pemasukan */}
        <article className="finance-panel finance-metric">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600">
              Total Pemasukan
            </span>
            <div className="p-1.5 rounded-md bg-emerald-50 text-emerald-600">
              <ArrowDownRight className="w-4 h-4" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-3">
            {summaryQuery.isPending && validMonth ? (
              <div className="h-8 w-32 bg-slate-100 animate-pulse rounded my-1" />
            ) : summaryUnavailable ? (
              <p className="text-sm text-slate-600">Data tidak tersedia</p>
            ) : (
              <Money amount={summaryQuery.data?.income ?? "0"} className="finance-metric-amount text-slate-900" />
            )}
            <p className="text-xs text-slate-600 mt-2">Periode {periodLabel}</p>
          </div>
        </article>

        {/* Pengeluaran */}
        <article className="finance-panel finance-metric">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600">
              Total Pengeluaran
            </span>
            <div className="p-1.5 rounded-md bg-rose-50 text-rose-600">
              <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-3">
            {summaryQuery.isPending && validMonth ? (
              <div className="h-8 w-32 bg-slate-100 animate-pulse rounded my-1" />
            ) : summaryUnavailable ? (
              <p className="text-sm text-slate-600">Data tidak tersedia</p>
            ) : (
              <Money amount={summaryQuery.data?.expense ?? "0"} className="finance-metric-amount text-slate-900" />
            )}
            <p className="text-xs text-slate-600 mt-2">Periode {periodLabel}</p>
          </div>
        </article>

        {/* Arus Kas Bersih */}
        <article className="finance-panel finance-metric finance-metric-main">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-900">
              Arus Kas Bersih
            </span>
            <div className="p-1.5 rounded-md bg-blue-100 text-blue-700">
              <Wallet className="w-4 h-4" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-3">
            {summaryQuery.isPending && validMonth ? (
              <div className="h-8 w-32 bg-slate-100 animate-pulse rounded my-1" />
            ) : summaryUnavailable ? (
              <p className="text-sm text-slate-600">Data tidak tersedia</p>
            ) : (
              <div className="flex flex-wrap items-baseline gap-3">
                <Money
                  amount={summaryQuery.data?.net_cash_flow ?? "0"}
                  className={`finance-metric-amount min-w-0 ${
                    netCashFlowBigInt > 0n
                      ? "text-emerald-700"
                      : netCashFlowBigInt < 0n
                      ? "text-rose-700"
                      : "text-slate-900"
                  }`}
                />
                {summaryQuery.data && (
                  <span
                    className={`finance-status border ${netStatus.style}`}
                  >
                    {netStatus.label}
                  </span>
                )}
              </div>
            )}
            <p className="text-xs text-blue-800 mt-2">Pemasukan dikurangi pengeluaran</p>
          </div>
        </article>
      </section>

      {/* Main Content: Breakdown & Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Aktivitas Transaksi Terbaru (2 Cols on Desktop) */}
        <section
          aria-label="Aktivitas Transaksi Terbaru"
          className="finance-panel lg:col-span-2 p-5 sm:p-6 flex flex-col justify-between"
        >
          <div>
            <div className="finance-panel-heading flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-slate-600" aria-hidden="true" />
                <h2 className="text-base font-semibold text-slate-900">
                  Aktivitas Transaksi Terbaru
                </h2>
              </div>
              <Link
                to="/transactions"
                className="min-h-11 text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline inline-flex items-center gap-2"
              >
                Lihat Semua
                <ArrowRight aria-hidden="true" className="w-3.5 h-3.5" />
              </Link>
            </div>

            {categoriesQuery.isError && (
              <div role="alert" className="mb-3 text-sm text-red-800">
                <p>Kategori gagal dimuat. Nama kategori sementara ditampilkan sebagai ID.</p>
                <button
                  type="button"
                  className="transaction-button mt-2 text-xs py-1 px-3"
                  disabled={categoriesQuery.isFetching}
                  onClick={() => void categoriesQuery.refetch()}
                >
                  Coba lagi kategori
                </button>
              </div>
            )}
            {recentQuery.isPending && validMonth ? (
              <div className="space-y-3 py-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-slate-50 animate-pulse rounded-md" />
                ))}
              </div>
            ) : recentQuery.isError ? (
              <div className="py-8 text-center text-slate-600">
                <p className="text-sm">Gagal memuat transaksi terbaru.</p>
                <button
                  type="button"
                  className="transaction-button mt-2 text-xs py-1 px-3"
                  onClick={() => void recentQuery.refetch()}
                >
                  Coba lagi
                </button>
              </div>
            ) : !recentQuery.data || recentQuery.data.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <div className="p-3 bg-blue-50 rounded-xl text-blue-700 mb-4">
                  <Receipt aria-hidden="true" className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-medium text-slate-900">
                  Belum ada transaksi di bulan ini
                </h3>
                <p className="text-sm text-slate-600 max-w-sm mt-2 mb-5">
                  Daftar transaksi harian untuk periode {periodLabel} akan muncul di sini setelah dicatat.
                </p>
                <Link
                  to="/transactions"
                  className="transaction-button transaction-primary inline-flex items-center gap-2"
                >
                  <Plus aria-hidden="true" className="w-3.5 h-3.5" />
                  Catat Transaksi Sekarang
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentQuery.data.map((transaction) => {
                  const categoryName =
                    categoryMap.get(transaction.category_id) ??
                    `Kategori #${transaction.category_id}`;
                  const isIncome = transaction.type === "income";

                  return (
                    <div
                      key={transaction.id}
                      className="py-4 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center hover:bg-slate-50/70 px-2 rounded-lg transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 tabular-nums">
                            {formatDate(transaction.date)}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium truncate max-w-36">
                            {categoryName}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-slate-900 truncate mt-1">
                          {transaction.description || (
                             <span className="text-slate-600 italic">Tanpa deskripsi</span>
                          )}
                        </p>
                      </div>

                      <div className="text-right whitespace-nowrap">
                        <div
                          className={`text-sm font-semibold tabular-nums ${
                            isIncome ? "text-emerald-700" : "text-rose-700"
                          }`}
                        >
                          {isIncome ? "+" : "-"}
                            <Money amount={transaction.amount_rupiah} />
                        </div>
                         <span className="text-xs text-slate-600">
                          {isIncome ? "Pemasukan" : "Pengeluaran"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {recentQuery.data && recentQuery.data.length > 0 && (
            <div className="pt-4 mt-2 border-t border-slate-100 text-right">
              <Link
                to="/transactions"
                className="min-h-11 text-sm font-medium text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"
              >
                Buka halaman transaksi lengkap &rarr;
              </Link>
            </div>
          )}
        </section>

        {/* Alokasi Pengeluaran (1 Col on Desktop) */}
        <section
          aria-label="Alokasi Pengeluaran"
          className="finance-panel p-5 sm:p-6 flex flex-col justify-between"
        >
          <div>
            <div className="finance-panel-heading flex items-center gap-2 min-h-11">
              <PieChart className="w-4 h-4 text-slate-600" aria-hidden="true" />
              <h2 className="text-base font-semibold text-slate-900">Alokasi Pengeluaran</h2>
            </div>

            {breakdownQuery.isPending && validMonth ? (
              <div className="space-y-4 py-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="h-4 bg-slate-50 animate-pulse rounded" />
                    <div className="h-2 bg-slate-100 animate-pulse rounded-full" />
                  </div>
                ))}
              </div>
            ) : breakdownQuery.isError ? (
              <div className="py-8 text-center text-slate-600">
                <p className="text-sm">Gagal memuat alokasi pengeluaran.</p>
                <button
                  type="button"
                  className="transaction-button mt-2 text-xs py-1 px-3"
                  onClick={() => void breakdownQuery.refetch()}
                >
                  Coba lagi
                </button>
              </div>
            ) : !breakdownQuery.data || breakdownQuery.data.items.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <p className="text-sm text-slate-600 max-w-xs">
                  Belum ada transaksi pengeluaran pada periode {periodLabel}.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {breakdownQuery.data.items.map((item) => {
                  let itemExpenseBigInt = 0n;
                  try {
                    itemExpenseBigInt = BigInt(item.expense);
                  } catch {
                    itemExpenseBigInt = 0n;
                  }

                  const percentageNumber =
                    totalExpenseBigInt > 0n
                      ? Number((itemExpenseBigInt * 1000n) / totalExpenseBigInt) / 10
                      : 0;
                  const percentageFormatted = `${percentageNumber.toFixed(1)}%`;

                  return (
                    <div key={item.category_id} className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="font-medium text-slate-800 truncate max-w-40">
                          {item.category_name}
                        </span>
                         <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                            {percentageFormatted}
                          </span>
                          <Money amount={item.expense} className="font-medium text-slate-900" />
                        </div>
                      </div>
                      <div
                        className="w-full bg-slate-100 rounded-full h-2 overflow-hidden"
                        role="progressbar"
                        aria-valuenow={percentageNumber}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Alokasi untuk ${item.category_name}: ${percentageFormatted} (${formatRupiah(item.expense)})`}
                      >
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{
                            width: `${Math.min(100, Math.max(2, percentageNumber))}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

           <p className="text-xs text-slate-600 mt-6 pt-3 border-t border-slate-100 text-center">
            Hanya memuat kategori pengeluaran bertransaksi.
          </p>
        </section>
      </div>

      {isAnyLoading && (
        <p role="status" className="sr-only">
          Memperbarui data dashboard…
        </p>
      )}
    </div>
  );
};
