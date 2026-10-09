import { Download, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { exportTransactions, fetchCategories, fetchTransactions } from "../api/transactions";
import { DeleteTransactionDialog } from "../components/DeleteTransactionDialog";
import { TransactionForm } from "../components/TransactionForm";
import { formatDate, formatRupiah } from "../lib/formatters";
import { jakartaToday, monthRange } from "../lib/transactions";
import type { Transaction, TransactionFilters } from "../lib/transactions";

export function TransactionsPage() {
  const [filters, setFilters] = useState<TransactionFilters>(() => ({ month: jakartaToday().slice(0, 7), type: "all", category_id: "all", page: 1 }));
  const [editor, setEditor] = useState<{ transaction: Transaction | null } | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const exportPending = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const focusAfterClose = useRef(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const validMonth = Boolean(monthRange(filters.month));
  const categories = useQuery({ queryKey: ["categories"], queryFn: ({ signal }) => fetchCategories(signal) });
  const list = useQuery({ queryKey: ["transactions", filters], queryFn: ({ signal }) => fetchTransactions(filters, signal), enabled: validMonth });
  const categoryItems = categories.data ?? [];
  const categoriesReady = categories.isSuccess;
  const totalPages = Math.max(1, Math.ceil((list.data?.total ?? 0) / 20));

  // Deleting the last row of a deep page returns to the new final page. Do not
  // keep stale rows from another filter while the replacement request loads.
  if (list.isSuccess && !list.isFetching && filters.page > totalPages) {
    setFilters({ ...filters, page: totalPages });
  }

  useEffect(() => {
    // Wait for enabled opener controls and the native modal's cleanup. A row
    // moved outside the filter or deleted needs a stable fallback focus target.
    if (!editor && !deleting && focusAfterClose.current) {
      focusAfterClose.current = false;
      const target = opener.current?.isConnected ? opener.current : addButton.current;
      target?.focus();
    }
  }, [editor, deleting]);

  function updateFilter(changes: Partial<TransactionFilters>) {
    setExportError("");
    setNotice("");
    setFilters((previous) => ({ ...previous, ...changes, page: 1 }));
  }
  function restoreFocus() {
    focusAfterClose.current = true;
  }
  function openEditor(transaction: Transaction | null) {
    opener.current = document.activeElement as HTMLElement;
    setNotice("");
    setEditor({ transaction });
  }
  function closeEditor() { setEditor(null); restoreFocus(); }

  async function downloadCSV() {
    if (exportPending.current || !validMonth) return;
    exportPending.current = true;
    setExporting(true);
    setExportError("");
    setNotice("");
    // Capture this click's filters; changing the visible list cannot change the
    // in-flight export's period or filename.
    const snapshot = { ...filters };
    try {
      const blob = await exportTransactions(snapshot);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `transaksi-${snapshot.month}.csv`;
      document.body.append(link);
      try { link.click(); } finally {
        link.remove();
        // Let the browser start consuming the Blob before releasing its URL.
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setNotice(`Download CSV dimulai untuk bulan ${snapshot.month}, sesuai filter saat export. Periksa folder download browser.`);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Coba lagi export setelah memastikan backend berjalan.");
    } finally {
      exportPending.current = false;
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Transaksi</h1>
          <p className="mt-1 text-sm text-slate-600">Pencatatan manual pemasukan dan pengeluaran harian.</p>
        </div>
        <div className="flex flex-wrap gap-2">
        <button type="button" disabled={exporting || !validMonth} aria-describedby="export-help" onClick={() => void downloadCSV()} className="transaction-button inline-flex items-center justify-center gap-2">
          <Download aria-hidden="true" className="h-4 w-4" />{exporting ? "Mengekspor…" : "Export CSV"}
        </button>
        <button ref={addButton} type="button" disabled={Boolean(editor)} onClick={() => openEditor(null)} className="transaction-button transaction-primary inline-flex items-center justify-center gap-2">
          <Plus aria-hidden="true" className="h-4 w-4" />Tambah Transaksi
        </button>
        </div>
      </header>

      <p role="status" className={notice ? "text-sm text-slate-700" : "sr-only"}>{notice}</p>
      <p id="export-help" className="text-sm text-slate-600">CSV memuat semua transaksi sesuai filter aktif, bukan hanya halaman ini. CSV bukan backup database.</p>
      {exporting && <p role="status" className="text-sm text-slate-600">Menyiapkan CSV…</p>}
      {exportError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p>Export CSV gagal. {exportError}</p>
        <button type="button" className="transaction-button mt-3" disabled={exporting || !validMonth} onClick={() => void downloadCSV()}>Coba lagi export</button>
      </div>}
      {categories.isError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p>Kategori gagal dimuat. {categories.error.message}</p>
        <button type="button" className="transaction-button mt-3" onClick={() => void categories.refetch()} disabled={categories.isFetching}>{categories.isFetching ? "Memuat kategori…" : "Coba lagi kategori"}</button>
      </div>}
      {categories.isPending && <p role="status" className="text-sm text-slate-600">Memuat kategori…</p>}
      {editor && <TransactionForm key={editor.transaction?.id ?? "new"} transaction={editor.transaction} categories={categoryItems} categoriesReady={categoriesReady} onCancel={closeEditor} onSaved={() => {
        setNotice(`Transaksi berhasil ${editor.transaction ? "diperbarui" : "ditambahkan"}. Daftar tetap mengikuti filter aktif.`);
        closeEditor();
      }} />}

      <section aria-label="Filter transaksi" className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <div className="transaction-field">
          <label htmlFor="filter-month">Bulan</label>
          <input id="filter-month" name="filter-month" className="transaction-control" type="month" min="0001-01" max="9999-12" value={filters.month} aria-invalid={!validMonth} aria-describedby="filter-month-error" onChange={(event) => updateFilter({ month: event.target.value })} />
          <span id="filter-month-error" className="transaction-field-error">{!validMonth && "Pilih bulan yang valid untuk menampilkan transaksi."}</span>
        </div>
        <div className="transaction-field">
          <label htmlFor="filter-type">Tipe</label>
          <select id="filter-type" name="filter-type" className="transaction-control" value={filters.type} onChange={(event) => updateFilter({ type: event.target.value as TransactionFilters["type"], category_id: "all" })}>
            <option value="all">Semua tipe</option><option value="income">Pemasukan</option><option value="expense">Pengeluaran</option>
          </select>
        </div>
        <div className="transaction-field">
          <label htmlFor="filter-category">Kategori</label>
          <select id="filter-category" name="filter-category" className="transaction-control" value={filters.category_id} disabled={!categoriesReady} onChange={(event) => updateFilter({ category_id: event.target.value })}>
            <option value="all">Semua kategori</option>
            {categoryItems.filter((category) => filters.type === "all" || category.type === filters.type).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </div>
      </section>

      <section aria-label="Daftar transaksi" aria-busy={list.isFetching} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {!validMonth ? <p className="p-8 text-center text-slate-600">Pilih bulan untuk melihat transaksi.</p>
          : list.isPending ? <p role="status" className="p-12 text-center text-slate-600">Memuat transaksi…</p>
          : list.isError ? <div role="alert" className="p-8 text-center">
            <h2 className="font-semibold text-slate-900">Transaksi gagal dimuat</h2>
            <p className="mt-2 text-sm text-slate-600">{list.error.message}</p>
            <button type="button" onClick={() => void list.refetch()} disabled={list.isFetching} className="transaction-button mt-4">{list.isFetching ? "Memuat…" : "Coba lagi"}</button>
          </div> : <>
            {list.isFetching && <p role="status" className="px-4 pt-3 text-sm text-slate-600">Memperbarui transaksi…</p>}
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabel transaksi, geser untuk melihat semua kolom">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <caption className="sr-only">Transaksi bulan {filters.month}, sesuai filter tipe dan kategori.</caption>
                <thead><tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th scope="col" className="px-4 py-3 font-medium">Tanggal</th><th scope="col" className="px-4 py-3 font-medium">Kategori</th>
                  <th scope="col" className="px-4 py-3 font-medium">Deskripsi</th><th scope="col" className="px-4 py-3 font-medium">Tipe</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Nominal</th><th scope="col" className="px-4 py-3 font-medium">Aksi</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {list.data?.items.map((transaction) => <tr key={transaction.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(transaction.date)}</td>
                    <td className="max-w-48 break-words px-4 py-3 text-slate-900">{categoryItems.find((category) => category.id === transaction.category_id)?.name ?? `Kategori #${transaction.category_id}`}</td>
                    <td className="max-w-64 whitespace-pre-wrap break-words px-4 py-3 text-slate-700">{transaction.description || <span className="text-slate-600">Tanpa deskripsi</span>}</td>
                    <td className={`px-4 py-3 ${transaction.type === "income" ? "text-emerald-700" : "text-red-700"}`}>{transaction.type === "income" ? "Pemasukan" : "Pengeluaran"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-slate-900">{formatRupiah(transaction.amount_rupiah)}</td>
                    <td className="px-4 py-3"><div className="flex gap-2">
                      <button type="button" className="transaction-button" aria-label={`Edit transaksi ${transaction.description || transaction.id}`} disabled={Boolean(editor)} onClick={() => openEditor(transaction)}>Edit</button>
                      <button type="button" className="transaction-button text-red-700" aria-label={`Hapus transaksi ${transaction.description || transaction.id}`} disabled={Boolean(editor)} onClick={() => { opener.current = document.activeElement as HTMLElement; setDeleting(transaction); }}>Hapus</button>
                    </div></td>
                  </tr>)}
                  {list.data?.items.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center">
                    <h2 className="font-medium text-slate-900">Tidak ada transaksi yang ditemukan</h2>
                    <p className="mt-2 text-slate-600">Belum ada catatan yang sesuai filter. Ubah filter atau tambah transaksi baru.</p>
                  </td></tr>}
                </tbody>
              </table>
            </div>
            <nav aria-label="Halaman transaksi" className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-4 text-sm">
              <p className="text-slate-600">{list.data?.total ?? 0} transaksi · Halaman {filters.page} dari {totalPages}</p>
              <div className="flex gap-2">
                <button type="button" className="transaction-button" disabled={filters.page <= 1 || list.isFetching} onClick={() => setFilters((previous) => ({ ...previous, page: previous.page - 1 }))}>Sebelumnya</button>
                <button type="button" className="transaction-button" disabled={filters.page >= totalPages || list.isFetching} onClick={() => setFilters((previous) => ({ ...previous, page: previous.page + 1 }))}>Berikutnya</button>
              </div>
            </nav>
          </>}
      </section>
      {deleting && <DeleteTransactionDialog transaction={deleting} onCancel={() => { setDeleting(null); restoreFocus(); }} onDeleted={() => {
        setDeleting(null); setNotice("Transaksi berhasil dihapus."); restoreFocus();
      }} />}
    </div>
  );
}
