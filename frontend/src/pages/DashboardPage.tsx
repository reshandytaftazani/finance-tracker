import { ArrowDownRight, ArrowLeftRight, ArrowUpRight, Plus, Wallet } from "lucide-react";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { formatRupiah } from "../lib/formatters";

export const DashboardPage: React.FC = () => {
  // Data placeholder untuk fase pondasi (sebelum Phase 4 Analytics dihubungkan)
  const [currentMonthName] = useState(() =>
    new Intl.DateTimeFormat("id-ID", {
      month: "long",
      year: "numeric",
    }).format(new Date())
  );

  const summary = {
    income: 0,
    expense: 0,
    net: 0,
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
            Dashboard Keuangan
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Ringkasan arus kas dan alokasi dana untuk periode {currentMonthName}.
          </p>
        </div>
        <div>
          <Link
            to="/transactions"
            className="inline-flex items-center px-4 py-2 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Catat Transaksi
          </Link>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Pemasukan */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Total Pemasukan
            </span>
            <div className="p-1.5 rounded-md bg-emerald-50 text-emerald-600">
              <ArrowDownRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 font-mono">
              {formatRupiah(summary.income)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Periode {currentMonthName}
            </p>
          </div>
        </div>

        {/* Pengeluaran */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Total Pengeluaran
            </span>
            <div className="p-1.5 rounded-md bg-rose-50 text-rose-600">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 font-mono">
              {formatRupiah(summary.expense)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Periode {currentMonthName}
            </p>
          </div>
        </div>

        {/* Arus Kas Bersih */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Arus Kas Bersih
            </span>
            <div className="p-1.5 rounded-md bg-slate-100 text-slate-600">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 font-mono">
              {formatRupiah(summary.net)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Pemasukan dikurangi pengeluaran
            </p>
          </div>
        </div>
      </div>

      {/* Main Content Area / Empty State */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200 p-6 shadow-xs">
          <h2 className="text-base font-semibold text-slate-900 mb-4">
            Aktivitas Transaksi Terbaru
          </h2>
          <div className="py-12 flex flex-col items-center justify-center text-center border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
            <div className="p-3 bg-white rounded-full border border-slate-200 shadow-xs text-slate-400 mb-3">
              <ArrowLeftRight className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-medium text-slate-900">
              Belum ada data transaksi
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4">
              Daftar transaksi harian akan muncul di sini secara berurutan setelah dicatat.
            </p>
            <Link
              to="/transactions"
              className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
            >
              Mulai input transaksi &rarr;
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-xs">
          <h2 className="text-base font-semibold text-slate-900 mb-4">
            Alokasi Pengeluaran
          </h2>
          <div className="py-12 flex flex-col items-center justify-center text-center border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
            <p className="text-xs text-slate-500 max-w-xs">
              Distribusi pengeluaran per kategori akan ditampilkan saat transaksi telah tersedia.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
