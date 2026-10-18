import { Download, Plus, RotateCcw, Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { exportTransactions, fetchCategories, fetchTransactions } from "../api/transactions";
import { DeleteTransactionDialog } from "../components/DeleteTransactionDialog";
import { TransactionForm } from "../components/TransactionForm";
import { AnimatedRegion } from "../components/AnimatedRegion";
import { Money } from "../components/Money";
import { formatDate } from "../lib/formatters";
import { jakartaToday, monthRange } from "../lib/transactions";
import type { Transaction, TransactionFilters } from "../lib/transactions";

export function TransactionsPage() {
  const [filters, setFilters] = useState<TransactionFilters>(() => ({
    month: jakartaToday().slice(0, 7),
    type: "all",
    category_id: "all",
    page: 1,
  }));
  const [searchInput, setSearchInput] = useState("");
  const [minAmountInput, setMinAmountInput] = useState("");
  const [maxAmountInput, setMaxAmountInput] = useState("");
  const [amountError, setAmountError] = useState("");
  const [editor, setEditor] = useState<{ transaction: Transaction | null } | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const exportPending = useRef(false);
  const exportButton = useRef<HTMLButtonElement>(null);
  const focusAfterExport = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const focusAfterClose = useRef(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const [monthBeforeAll, setMonthBeforeAll] = useState(() => jakartaToday().slice(0, 7));
  const allMonths = filters.month === "all";
  const validMonth = allMonths || Boolean(monthRange(filters.month));
  const categories = useQuery({ queryKey: ["categories"], queryFn: ({ signal }) => fetchCategories(signal) });
  const list = useQuery({ queryKey: ["transactions", filters], queryFn: ({ signal }) => fetchTransactions(filters, signal), enabled: validMonth });
  const categoryItems = categories.data ?? [];
  const categoriesReady = categories.isSuccess;
  const totalPages = Math.max(1, Math.ceil((list.data?.total ?? 0) / 20));

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const clean = searchInput.trim();
      setFilters((previous) => {
        if ((previous.search ?? "") === clean) return previous;
        return { ...previous, search: clean || undefined, page: 1 };
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const cleanMin = minAmountInput.trim();
      const cleanMax = maxAmountInput.trim();
      if (cleanMin && cleanMax && BigInt(cleanMin) > BigInt(cleanMax)) {
        setAmountError("Nominal minimum tidak boleh melebihi nominal maksimum.");
        return;
      }
      setAmountError("");
      setFilters((previous) => {
        const nextMin = cleanMin || undefined;
        const nextMax = cleanMax || undefined;
        if (previous.min_amount === nextMin && previous.max_amount === nextMax) return previous;
        return { ...previous, min_amount: nextMin, max_amount: nextMax, page: 1 };
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [minAmountInput, maxAmountInput]);

  useEffect(() => {
    // Export disables the focused control; retry also disappears when its error
    // clears. Restore focus after the persistent export button is enabled, never
    // stealing focus if the
    // user moved to a different control while the request was pending.
    if (!exporting && focusAfterExport.current) {
      focusAfterExport.current = false;
      if (document.activeElement === document.body) exportButton.current?.focus();
    }
  }, [exporting]);

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

  const hasActiveFilters = Boolean(
    filters.month !== jakartaToday().slice(0, 7) ||
    filters.type !== "all" ||
    filters.category_id !== "all" ||
    filters.search ||
    filters.min_amount ||
    filters.max_amount ||
    searchInput ||
    minAmountInput ||
    maxAmountInput
  );

  function clearSearch() {
    setSearchInput("");
    setFilters((previous) => ({ ...previous, search: undefined, page: 1 }));
  }

  function resetFilters() {
    setSearchInput("");
    setMinAmountInput("");
    setMaxAmountInput("");
    setAmountError("");
    setExportError("");
    setNotice("");
    setFilters({
      month: jakartaToday().slice(0, 7),
      type: "all",
      category_id: "all",
      page: 1,
      search: undefined,
      min_amount: undefined,
      max_amount: undefined,
    });
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

  async function downloadCSV(source: HTMLButtonElement) {
    if (exportPending.current || !validMonth) return;
    focusAfterExport.current = document.activeElement === source;
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
      link.download = `transaksi-${snapshot.month === "all" ? "semua-bulan" : snapshot.month}.csv`;
      document.body.append(link);
      try { link.click(); } finally {
        link.remove();
        // Let the browser start consuming the Blob before releasing its URL.
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setNotice(`Download CSV dimulai untuk ${snapshot.month === "all" ? "semua bulan" : `bulan ${snapshot.month}`}, sesuai filter saat export. Periksa folder download browser.`);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Coba lagi export setelah memastikan backend berjalan.");
    } finally {
      exportPending.current = false;
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="finance-page-header">
        <div>
          <h1 className="finance-page-title">Transaksi</h1>
          <p className="finance-page-subtitle">Pencatatan manual pemasukan dan pengeluaran harian.</p>
        </div>
        <div className="flex flex-wrap gap-2">
        <button ref={exportButton} type="button" disabled={exporting || !validMonth} aria-describedby="export-help" onClick={(event) => void downloadCSV(event.currentTarget)} className="transaction-button inline-flex items-center justify-center gap-2">
          <Download aria-hidden="true" className="h-4 w-4" />{exporting ? "Mengekspor…" : "Export CSV"}
        </button>
        <button ref={addButton} type="button" disabled={Boolean(editor)} onClick={() => openEditor(null)} className="transaction-button transaction-primary inline-flex items-center justify-center gap-2">
          <Plus aria-hidden="true" className="h-4 w-4" />Tambah Transaksi
        </button>
        </div>
      </header>

      <p role="status" className={notice ? "text-sm text-slate-700 dark:text-slate-300" : "sr-only"}>{notice}</p>
      <p id="export-help" className="text-sm text-slate-600 dark:text-slate-400">CSV memuat semua transaksi sesuai filter aktif, bukan hanya halaman ini. CSV bukan backup database.</p>
      {exporting && <p role="status" className="text-sm text-slate-600 dark:text-slate-400">Menyiapkan CSV…</p>}
      {exportError && <div role="alert" className="rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 p-4 text-sm text-rose-800 dark:text-rose-200">
        <p>Export CSV gagal. {exportError}</p>
        <button type="button" className="transaction-button mt-3" disabled={exporting || !validMonth} onClick={(event) => void downloadCSV(event.currentTarget)}>Coba lagi export</button>
      </div>}
      {categories.isError && <div role="alert" className="rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 p-4 text-sm text-rose-800 dark:text-rose-200">
        <p>Kategori gagal dimuat. {categories.error.message}</p>
        <button type="button" className="transaction-button mt-3" onClick={() => void categories.refetch()} disabled={categories.isFetching}>{categories.isFetching ? "Memuat kategori…" : "Coba lagi kategori"}</button>
      </div>}
      {categories.isPending && <p role="status" className="text-sm text-slate-600 dark:text-slate-400">Memuat kategori…</p>}
      <AnimatedRegion>{editor && <TransactionForm key={editor.transaction?.id ?? "new"} transaction={editor.transaction} categories={categoryItems} categoriesReady={categoriesReady} onCancel={closeEditor} onSaved={() => {
        setNotice(`Transaksi berhasil ${editor.transaction ? "diperbarui" : "ditambahkan"}. Daftar tetap mengikuti filter aktif.`);
        closeEditor();
      }} />}</AnimatedRegion>

      <section aria-label="Filter transaksi" className="finance-panel finance-filter-bar space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="transaction-field">
            <label htmlFor="filter-month">Bulan</label>
            <input id="filter-month" name="filter-month" className="transaction-control" type="month" min="0001-01" max="9999-12" value={allMonths ? monthBeforeAll : filters.month} disabled={allMonths} aria-invalid={!validMonth} aria-describedby="filter-month-error" onChange={(event) => updateFilter({ month: event.target.value })} />
            <label className="mt-1 inline-flex min-h-9 cursor-pointer items-center gap-2" htmlFor="filter-all-months">
              <input id="filter-all-months" type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={allMonths} onChange={(event) => {
                if (event.target.checked) {
                  setMonthBeforeAll(monthRange(filters.month) ? filters.month : jakartaToday().slice(0, 7));
                  updateFilter({ month: "all" });
                } else updateFilter({ month: monthBeforeAll });
              }} />
              Semua bulan
            </label>
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
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="transaction-field">
            <label htmlFor="filter-search">Cari Deskripsi / Catatan</label>
            <div className="relative flex items-center">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <input
                id="filter-search"
                name="filter-search"
                type="text"
                maxLength={100}
                className="transaction-control pl-9 pr-9"
                placeholder="Cari transaksi…"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
              {searchInput && (
                <button
                  type="button"
                  aria-label="Hapus kata kunci pencarian"
                  className="absolute right-2.5 rounded-full p-1 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                  onClick={clearSearch}
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="transaction-field">
            <label htmlFor="filter-min-amount">Nominal Minimal (Rp)</label>
            <input
              id="filter-min-amount"
              name="filter-min-amount"
              type="text"
              inputMode="numeric"
              className="transaction-control"
              placeholder="Contoh: 10000"
              value={minAmountInput}
              aria-invalid={Boolean(amountError)}
              onChange={(event) => setMinAmountInput(event.target.value.replace(/\D/g, ""))}
            />
          </div>

          <div className="transaction-field">
            <label htmlFor="filter-max-amount">Nominal Maksimal (Rp)</label>
            <input
              id="filter-max-amount"
              name="filter-max-amount"
              type="text"
              inputMode="numeric"
              className="transaction-control"
              placeholder="Contoh: 500000"
              value={maxAmountInput}
              aria-invalid={Boolean(amountError)}
              onChange={(event) => setMaxAmountInput(event.target.value.replace(/\D/g, ""))}
            />
          </div>
        </div>

        {amountError && (
          <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{amountError}</p>
        )}

        {hasActiveFilters && (
          <div className="flex justify-end pt-1">
            <button
              type="button"
              className="transaction-button inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              onClick={resetFilters}
            >
              <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
              Reset filter
            </button>
          </div>
        )}
      </section>

      <section aria-label="Daftar transaksi" aria-busy={list.isFetching} className="finance-panel overflow-hidden">
        {!validMonth ? <p className="p-8 text-center text-slate-600 dark:text-slate-400">Pilih bulan untuk melihat transaksi.</p>
          : list.isPending ? <p role="status" className="p-12 text-center text-slate-600 dark:text-slate-400">Memuat transaksi…</p>
          : list.isError ? <div role="alert" className="p-8 text-center">
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">Transaksi gagal dimuat</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{list.error.message}</p>
            <button type="button" onClick={() => void list.refetch()} disabled={list.isFetching} className="transaction-button mt-4">{list.isFetching ? "Memuat…" : "Coba lagi"}</button>
          </div> : <>
            {list.isFetching && <p role="status" className="px-4 pt-3 text-sm text-slate-600 dark:text-slate-400">Memperbarui transaksi…</p>}
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabel transaksi, geser untuk melihat semua kolom">
              <table className="finance-table w-full min-w-[760px] border-collapse text-left text-sm">
                <caption className="sr-only">Transaksi {allMonths ? "semua bulan" : `bulan ${filters.month}`}, sesuai filter tipe, kategori, pencarian, dan nominal.</caption>
                <thead><tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400">
                  <th scope="col" className="px-4 py-3 font-medium">Tanggal</th><th scope="col" className="px-4 py-3 font-medium">Kategori</th>
                  <th scope="col" className="px-4 py-3 font-medium">Deskripsi</th><th scope="col" className="px-4 py-3 font-medium">Tipe</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Nominal</th><th scope="col" className="px-4 py-3 font-medium">Aksi</th>
                </tr></thead>
                <tbody key={JSON.stringify(filters)} className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {list.data?.items.map((transaction) => <tr key={transaction.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-400">{formatDate(transaction.date)}</td>
                    <td className="max-w-48 break-words px-4 py-3 text-slate-900 dark:text-slate-100">{categoryItems.find((category) => category.id === transaction.category_id)?.name ?? `Kategori #${transaction.category_id}`}</td>
                    <td className="max-w-64 whitespace-pre-wrap break-words px-4 py-3 text-slate-700 dark:text-slate-300">{transaction.description || <span className="text-slate-500 dark:text-slate-400 italic">Tanpa deskripsi</span>}</td>
                    <td className={`px-4 py-3 font-medium ${transaction.type === "income" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>{transaction.type === "income" ? "Pemasukan" : "Pengeluaran"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100"><Money amount={transaction.amount_rupiah} /></td>
                    <td className="px-4 py-3"><div className="flex gap-2">
                      <button type="button" className="transaction-button" aria-label={`Edit transaksi ${transaction.description || transaction.id}`} disabled={Boolean(editor)} onClick={() => openEditor(transaction)}>Edit</button>
                      <button type="button" className="transaction-button text-rose-700 dark:text-rose-400" aria-label={`Hapus transaksi ${transaction.description || transaction.id}`} disabled={Boolean(editor)} onClick={() => { opener.current = document.activeElement as HTMLElement; setDeleting(transaction); }}>Hapus</button>
                    </div></td>
                  </tr>)}
                  {list.data?.items.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center">
                    <h2 className="font-medium text-slate-900 dark:text-slate-100">Tidak ada transaksi yang ditemukan</h2>
                    <p className="mt-2 text-slate-600 dark:text-slate-400">Belum ada catatan yang sesuai filter. Ubah filter atau tambah transaksi baru.</p>
                    {hasActiveFilters && (
                      <button type="button" onClick={resetFilters} className="transaction-button mt-4 inline-flex items-center gap-1.5 text-xs">
                        <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                        Reset semua filter
                      </button>
                    )}
                  </td></tr>}
                </tbody>
              </table>
            </div>
            <nav aria-label="Halaman transaksi" className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800 px-4 py-4 text-sm">
              <p className="text-slate-600 dark:text-slate-400">{list.data?.total ?? 0} transaksi · Halaman {filters.page} dari {totalPages}</p>
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
