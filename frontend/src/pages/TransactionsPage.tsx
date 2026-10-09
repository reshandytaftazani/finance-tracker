import { Filter, Plus, Search } from "lucide-react";
import React, { useState } from "react";

export const TransactionsPage: React.FC = () => {
  const [selectedType, setSelectedType] = useState<string>("all");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
            Transaksi
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Pencatatan manual pemasukan dan pengeluaran harian.
          </p>
        </div>
        <div>
          <button
            type="button"
            className="inline-flex items-center px-4 py-2 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Tambah Transaksi
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <div className="inline-flex items-center text-xs font-medium text-slate-500 mr-1">
            <Filter className="w-3.5 h-3.5 mr-1" />
            Filter:
          </div>

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-700 focus:outline-hidden focus:ring-1 focus:ring-slate-400"
          >
            <option value="all">Semua Tipe</option>
            <option value="income">Pemasukan</option>
            <option value="expense">Pengeluaran</option>
          </select>

          <select className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-700 focus:outline-hidden focus:ring-1 focus:ring-slate-400">
            <option value="all">Semua Kategori</option>
          </select>

          <select className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-700 focus:outline-hidden focus:ring-1 focus:ring-slate-400">
            <option value="current">Bulan Ini</option>
          </select>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari deskripsi..."
            className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-slate-400"
          />
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Tanggal</th>
                <th className="py-3 px-4">Kategori</th>
                <th className="py-3 px-4">Deskripsi</th>
                <th className="py-3 px-4">Tipe</th>
                <th className="py-3 px-4 text-right">Nominal</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {/* Empty State */}
              <tr>
                <td colSpan={6} className="py-16 text-center text-slate-400">
                  <p className="text-sm font-medium text-slate-600">
                    Tidak ada transaksi yang ditemukan
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Silakan gunakan tombol "Tambah Transaksi" untuk memasukkan catatan baru.
                  </p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
