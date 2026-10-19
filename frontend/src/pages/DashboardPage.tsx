import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  Lightbulb,
  Minus,
  PieChart,
  Plus,
  Receipt,
  RotateCcw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  fetchAnalyticsByCategory,
  fetchAnalyticsForecast,
  fetchAnalyticsInsights,
  fetchAnalyticsSummary,
  fetchRecentTransactions,
} from "../api/analytics";
import { fetchCategories } from "../api/transactions";
import { fetchWallets } from "../api/wallets";
import { Money } from "../components/Money";
import { ExpenseChart } from "../components/ExpenseChart";
import { AllocationPieChart } from "../components/AllocationPieChart";
import { ExpenseForecast } from "../components/ExpenseForecast";
import { formatDate, formatRupiah } from "../lib/formatters";
import { jakartaToday, monthRange } from "../lib/transactions";
import { WALLET_TYPE_LABELS } from "../lib/wallets";

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

  const insightsQuery = useQuery({
    queryKey: ["analytics", "insights", { month: parsedMonth, year: parsedYear }],
    queryFn: ({ signal }) => fetchAnalyticsInsights(parsedMonth, parsedYear, signal),
    enabled: validMonth,
  });

  const forecastQuery = useQuery({
    queryKey: ["analytics", "forecast", { month: parsedMonth, year: parsedYear }],
    queryFn: ({ signal }) => fetchAnalyticsForecast(parsedMonth, parsedYear, signal),
    enabled: validMonth,
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: ({ signal }) => fetchCategories(signal),
  });

  const walletsQuery = useQuery({
    queryKey: ["wallets"],
    queryFn: ({ signal }) => fetchWallets(signal),
  });

  const categoryMap = new Map<number, string>(
    (categoriesQuery.data ?? []).map((cat) => [cat.id, cat.name])
  );

  const hasAnyError =
    summaryQuery.isError ||
    breakdownQuery.isError ||
    recentQuery.isError ||
    insightsQuery.isError ||
    forecastQuery.isError;
  const isAnyLoading =
    validMonth &&
    (summaryQuery.isPending ||
      breakdownQuery.isPending ||
      recentQuery.isPending ||
      insightsQuery.isPending ||
      forecastQuery.isPending);

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
      ? { label: "Surplus", style: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800" }
      : netCashFlowBigInt < 0n
      ? { label: "Defisit", style: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800" }
      : { label: "Seimbang", style: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" };

  const summaryUnavailable = !validMonth || summaryQuery.isError || !summaryQuery.data;

  const defaultMonth = jakartaToday().slice(0, 7);

  return (
    <div className="finance-dashboard space-y-8">
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
          <div className="flex items-center gap-2 bg-[var(--card)] px-3 rounded-xl border border-[var(--border)] shadow-2xs">
            <Calendar className="w-4 h-4 text-[var(--muted)]" aria-hidden="true" />
            <label htmlFor="dashboard-period" className="text-xs font-medium text-[var(--muted)]">
              Periode:
            </label>
            <input
              id="dashboard-period"
              type="month"
              min="0001-01"
              max="9999-12"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="min-h-11 text-sm font-medium bg-transparent border-none text-[var(--foreground)] cursor-pointer"
              aria-label="Pilih bulan dan tahun periode dashboard"
              aria-invalid={!validMonth}
              aria-describedby={!validMonth ? "dashboard-period-error" : undefined}
            />
          </div>

          {month !== defaultMonth && (
            <button
              type="button"
              onClick={() => setMonth(defaultMonth)}
              className="transaction-button inline-flex items-center gap-2 text-xs"
              title="Kembali ke bulan berjalan"
            >
              <RotateCcw aria-hidden="true" className="w-3.5 h-3.5" />
              Bulan Ini
            </button>
          )}

          <Link
            to="/transactions"
            className="transaction-button transaction-primary inline-flex items-center justify-center gap-2 shadow-xs"
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
          className="rounded-xl border border-amber-200 bg-amber-50/90 dark:border-amber-900/60 dark:bg-amber-950/40 p-4 text-sm text-amber-900 dark:text-amber-200 shadow-xs"
        >
          Pilih periode bulan yang valid (format YYYY-MM antara tahun 0001 hingga 9999) untuk melihat dashboard.
        </div>
      )}

      {/* Global Error Banner (Never disguise errors as zero) */}
      {hasAnyError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50/90 dark:border-rose-900/60 dark:bg-rose-950/40 p-4 text-sm text-rose-800 dark:text-rose-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs"
        >
          <div>
            <h2 className="font-semibold text-rose-900 dark:text-rose-100">Gagal memuat data dashboard</h2>
            <p className="mt-0.5 text-xs text-rose-700 dark:text-rose-300">
              {summaryQuery.error?.message ||
                breakdownQuery.error?.message ||
                recentQuery.error?.message ||
                insightsQuery.error?.message ||
                forecastQuery.error?.message ||
                "Terjadi kesalahan saat mengambil data dari backend."}
            </p>
          </div>
          <button
            type="button"
            className="transaction-button text-xs py-1.5 px-3 w-fit border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-100 hover:bg-rose-100 dark:hover:bg-rose-900/40"
            onClick={() => {
              void summaryQuery.refetch();
              void breakdownQuery.refetch();
              void recentQuery.refetch();
              void insightsQuery.refetch();
              void forecastQuery.refetch();
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
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Total Pemasukan
            </span>
            <div className="p-1.5 rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border dark:border-emerald-900/40">
              <ArrowDownRight className="w-4 h-4" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-3">
            {summaryQuery.isPending && validMonth ? (
              <div className="h-8 w-32 bg-slate-100 dark:bg-slate-800 animate-pulse rounded my-1" />
            ) : summaryUnavailable ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Data tidak tersedia</p>
            ) : (
              <Money amount={summaryQuery.data?.income ?? "0"} className="finance-metric-amount text-slate-900 dark:text-slate-100" />
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Periode {periodLabel}</p>
          </div>
        </article>

        {/* Pengeluaran */}
        <article className="finance-panel finance-metric">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Total Pengeluaran
            </span>
            <div className="p-1.5 rounded-md bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 dark:border dark:border-rose-900/40">
              <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-3">
            {summaryQuery.isPending && validMonth ? (
              <div className="h-8 w-32 bg-slate-100 dark:bg-slate-800 animate-pulse rounded my-1" />
            ) : summaryUnavailable ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Data tidak tersedia</p>
            ) : (
              <Money amount={summaryQuery.data?.expense ?? "0"} className="finance-metric-amount text-slate-900 dark:text-slate-100" />
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Periode {periodLabel}</p>
          </div>
        </article>

        {/* Arus Kas Bersih */}
        <article className="finance-panel finance-metric finance-metric-main">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-teal-900 dark:text-teal-200">
              Arus Kas Bersih
            </span>
            <div className="p-1.5 rounded-md bg-teal-100 text-teal-700 dark:bg-teal-900/60 dark:text-teal-300">
              <Wallet className="w-4 h-4" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-3">
            {summaryQuery.isPending && validMonth ? (
              <div className="h-8 w-32 bg-slate-100 dark:bg-slate-800 animate-pulse rounded my-1" />
            ) : summaryUnavailable ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Data tidak tersedia</p>
            ) : (
              <div className="flex flex-wrap items-baseline gap-3">
                <Money
                  amount={summaryQuery.data?.net_cash_flow ?? "0"}
                  className={`finance-metric-amount min-w-0 ${
                    netCashFlowBigInt > 0n
                      ? "text-emerald-700 dark:text-emerald-400"
                      : netCashFlowBigInt < 0n
                      ? "text-rose-700 dark:text-rose-400"
                      : "text-slate-900 dark:text-slate-100"
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
            <p className="text-xs text-teal-800/90 dark:text-teal-300/80 mt-2 font-medium">Pemasukan dikurangi pengeluaran</p>
          </div>
        </article>
      </section>

      {/* Ringkasan Saldo Dompet */}
      <section aria-labelledby="wallets-overview-title" className="finance-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
            <h2 id="wallets-overview-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Saldo Dompet & Rekening
            </h2>
          </div>
          <Link
            to="/wallets"
            className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 inline-flex items-center gap-1"
          >
            Kelola Dompet & Transfer <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>

        {walletsQuery.isPending && (
          <p role="status" className="py-4 text-xs text-slate-500 dark:text-slate-400">
            Memuat saldo dompet…
          </p>
        )}

        {walletsQuery.isSuccess && (walletsQuery.data.items.length === 0 ? (
          <p className="py-4 text-xs text-slate-500 dark:text-slate-400">
            Belum ada dompet. Buka halaman Dompet untuk menambahkan rekening bank atau dompet tunai.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {walletsQuery.data.items.map((w) => (
              <div
                key={w.id}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-3"
              >
                <div className="flex items-center justify-between gap-1 text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300 truncate" title={w.name}>
                    {w.name}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 shrink-0">
                    {WALLET_TYPE_LABELS[w.type] ?? w.type}
                  </span>
                </div>
                <div className="mt-1 font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                  <Money amount={w.current_balance_rupiah} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </section>

      {/* Sorotan & Analisis Keuangan (Rule-Based Insights) */}
      {validMonth && summaryQuery.isSuccess && (
        <section className="finance-panel finance-chart-panel" aria-label="Chart riwayat pengeluaran">
          <ExpenseChart key={month} history={[...(forecastQuery.isSuccess ? forecastQuery.data.historical_months : []), { month: parsedMonth, year: parsedYear, expense: summaryQuery.data.expense, transaction_count: null }]} />
        </section>
      )}

      <section
        aria-label="Sorotan dan Analisis Keuangan"
        className="finance-panel finance-insights p-5 sm:p-6 mb-6"
      >
        <div className="finance-panel-heading flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Sorotan & Analisis Periode Ini
            </h2>
          </div>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700">
            Analisis Aturan
          </span>
        </div>

        {insightsQuery.isPending && validMonth ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-slate-100 dark:bg-slate-800 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : insightsQuery.isError ? (
          <div className="py-4 text-center text-slate-600 dark:text-slate-400">
            <p className="text-sm">Gagal memuat analisis sorotan keuangan.</p>
            <button
              type="button"
              className="transaction-button mt-2 text-xs py-1 px-3"
              onClick={() => void insightsQuery.refetch()}
            >
              Coba lagi
            </button>
          </div>
        ) : !insightsQuery.data ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-2">Data analitik tidak tersedia.</p>
        ) : (
          <div className="space-y-4 pt-1">
            {/* Tiga Kartu Ringkasan Aturan */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 1. Perbandingan Bulan-ke-Bulan (MoM) */}
              <div className="finance-insight-stat flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                  <span>Tren Pengeluaran (vs Bulan Lalu)</span>
                  {insightsQuery.data.comparison.direction === "up" ? (
                    <TrendingUp className="w-4 h-4 text-rose-600 dark:text-rose-400" aria-hidden="true" />
                  ) : insightsQuery.data.comparison.direction === "down" ? (
                    <TrendingDown className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  ) : (
                    <Minus className="w-4 h-4 text-slate-400" aria-hidden="true" />
                  )}
                </div>
                {insightsQuery.data.comparison.has_baseline ? (
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span
                        className={`text-lg font-bold ${
                          insightsQuery.data.comparison.direction === "up"
                            ? "text-rose-700 dark:text-rose-400"
                            : insightsQuery.data.comparison.direction === "down"
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-slate-800 dark:text-slate-200"
                        }`}
                      >
                        {insightsQuery.data.comparison.direction === "up"
                          ? `+${insightsQuery.data.comparison.percentage}%`
                          : insightsQuery.data.comparison.direction === "down"
                          ? `-${insightsQuery.data.comparison.percentage}%`
                          : "Stabil"}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        ({insightsQuery.data.comparison.direction === "up" ? "Membengkak" : insightsQuery.data.comparison.direction === "down" ? "Lebih Hemat" : "Sama"})
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                      Bulan lalu: {formatRupiah(insightsQuery.data.comparison.previous_expense ?? "0")}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Belum ada data pengeluaran bulan sebelumnya untuk pembanding.
                  </p>
                )}
              </div>

              {/* 2. Kategori Pengeluaran Terbesar */}
              <div className="finance-insight-stat flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                  <span>Kategori Terbesar</span>
                  <PieChart className="w-4 h-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                </div>
                {insightsQuery.data.top_category.has_data && insightsQuery.data.top_category.category_name ? (
                  <div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                        {insightsQuery.data.top_category.category_name}
                      </span>
                      <span className="text-xs font-semibold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 px-2 py-0.5 rounded border border-teal-200 dark:border-teal-800">
                        {insightsQuery.data.top_category.percentage_of_total}%
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                      Nominal: {formatRupiah(insightsQuery.data.top_category.expense ?? "0")}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Belum ada pengeluaran yang tercatat pada bulan ini.
                  </p>
                )}
              </div>

              {/* 3. Rasio Tabungan / Status Kas */}
              <div className="finance-insight-stat flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                  <span>Kesehatan Arus Kas</span>
                  <Wallet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                </div>
                {insightsQuery.data.cash_flow.status === "surplus" && insightsQuery.data.cash_flow.savings_rate_percentage ? (
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                        {insightsQuery.data.cash_flow.savings_rate_percentage}%
                      </span>
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Tingkat Tabungan</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                      Porsi pemasukan yang berhasil disisihkan bulan ini.
                    </p>
                  </div>
                ) : insightsQuery.data.cash_flow.status === "deficit" ? (
                  <div>
                    <span className="text-base font-bold text-rose-700 dark:text-rose-400">Arus Kas Defisit</span>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                      Pengeluaran melampaui pemasukan bulan ini.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {insightsQuery.data.cash_flow.status === "balanced"
                      ? "Arus kas seimbang antara pemasukan dan pengeluaran."
                      : "Belum ada aktivitas transaksi bulan ini."}
                  </p>
                )}
              </div>
            </div>

            {/* Poin Kesimpulan Naratif */}
            {insightsQuery.data.narratives.length > 0 && (
              <div className="p-3.5 rounded-lg bg-teal-50/60 dark:bg-teal-950/30 border border-teal-100 dark:border-teal-900/50 flex items-start gap-2.5">
                <Lightbulb className="w-4 h-4 text-teal-700 dark:text-teal-400 mt-0.5 shrink-0" aria-hidden="true" />
                <ul className="text-xs text-slate-700 dark:text-slate-300 space-y-1 list-disc list-inside">
                  {insightsQuery.data.narratives.map((narration, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {narration}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Eksperimen Forecasting Section */}
      <section
        aria-label="Proyeksi Pengeluaran"
        className="finance-panel p-5 sm:p-6"
      >
        <div className="finance-panel-heading flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Proyeksi Pengeluaran
            </h2>
          </div>
          <span className="text-xs font-semibold px-2 py-0.5 rounded border bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800">
            Estimasi bulanan
          </span>
        </div>

        {forecastQuery.isPending && validMonth ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-slate-100 dark:bg-slate-800 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : forecastQuery.isError ? (
          <div className="py-4 text-center text-slate-600 dark:text-slate-400">
            <p className="text-sm">Gagal memuat proyeksi pengeluaran.</p>
            <button
              type="button"
              className="transaction-button mt-2 text-xs py-1 px-3"
              onClick={() => void forecastQuery.refetch()}
            >
              Coba lagi
            </button>
          </div>
        ) : !forecastQuery.data ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-2">Data proyeksi tidak tersedia.</p>
        ) : (
          <ExpenseForecast key={month} forecast={forecastQuery.data} summary={summaryQuery.isSuccess ? summaryQuery.data : undefined} period={month} />
        )}
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
                <Receipt className="w-4 h-4 text-slate-600 dark:text-slate-400" aria-hidden="true" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Aktivitas Transaksi Terbaru
                </h2>
              </div>
              <Link
                to="/transactions"
                className="min-h-11 text-sm font-medium text-teal-700 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 hover:underline inline-flex items-center gap-2"
              >
                Lihat Semua
                <ArrowRight aria-hidden="true" className="w-3.5 h-3.5" />
              </Link>
            </div>

            {categoriesQuery.isError && (
              <div role="alert" className="mb-3 text-sm text-rose-800 dark:text-rose-300">
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
                  <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800 animate-pulse rounded-md" />
                ))}
              </div>
            ) : recentQuery.isError ? (
              <div className="py-8 text-center text-slate-600 dark:text-slate-400">
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
                <div className="p-3 bg-teal-50 dark:bg-teal-950/60 rounded-xl text-teal-700 dark:text-teal-300 mb-4">
                  <Receipt aria-hidden="true" className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Belum ada transaksi di bulan ini
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 max-w-sm mt-2 mb-5">
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
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {recentQuery.data.map((transaction) => {
                  const categoryName =
                    categoryMap.get(transaction.category_id) ??
                    `Kategori #${transaction.category_id}`;
                  const isIncome = transaction.type === "income";

                  return (
                    <div
                      key={transaction.id}
                      className="py-4 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center hover:bg-slate-50/70 dark:hover:bg-slate-800/40 px-2 rounded-lg transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                            {formatDate(transaction.date)}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium truncate max-w-36">
                            {categoryName}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate mt-1">
                          {transaction.description || (
                             <span className="text-slate-500 dark:text-slate-400 italic">Tanpa deskripsi</span>
                          )}
                        </p>
                      </div>

                      <div className="text-right whitespace-nowrap">
                        <div
                          className={`text-sm font-semibold tabular-nums ${
                            isIncome ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
                          }`}
                        >
                          {isIncome ? "+" : "-"}
                            <Money amount={transaction.amount_rupiah} />
                        </div>
                         <span className="text-xs text-slate-500 dark:text-slate-400">
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
            <div className="pt-4 mt-2 border-t border-slate-100 dark:border-slate-800 text-right">
              <Link
                to="/transactions"
                className="min-h-11 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 inline-flex items-center gap-1"
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
              <PieChart className="w-4 h-4 text-slate-600 dark:text-slate-400" aria-hidden="true" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Alokasi Pengeluaran</h2>
            </div>

            {breakdownQuery.isPending && validMonth ? (
              <div className="space-y-4 py-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="h-4 bg-slate-100 dark:bg-slate-800 animate-pulse rounded" />
                    <div className="h-2 bg-slate-200 dark:bg-slate-700 animate-pulse rounded-full" />
                  </div>
                ))}
              </div>
            ) : breakdownQuery.isError ? (
              <div className="py-8 text-center text-slate-600 dark:text-slate-400">
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
                <p className="text-sm text-slate-600 dark:text-slate-400 max-w-xs">
                  Belum ada transaksi pengeluaran pada periode {periodLabel}.
                </p>
              </div>
            ) : (
              <AllocationPieChart key={month} items={breakdownQuery.data.items} />
            )}
          </div>

           <p className="text-xs text-slate-500 dark:text-slate-400 mt-6 pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
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
