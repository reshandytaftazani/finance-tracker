import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fetchBudgetStatus } from "../api/budgets";
import { fetchCategories } from "../api/transactions";
import { BudgetForm } from "../components/BudgetForm";
import { DeleteBudgetDialog } from "../components/DeleteBudgetDialog";
import { Money } from "../components/Money";
import { budgetProgress, budgetStatusLabels } from "../lib/budgets";
import type { BudgetStatusItem } from "../lib/budgets";
import { formatDate } from "../lib/formatters";
import { jakartaToday, monthRange } from "../lib/transactions";

const statusStyles = { normal: "bg-emerald-50 text-emerald-800", warning: "bg-amber-50 text-amber-800", over_budget: "bg-red-50 text-red-800" };

export function BudgetPage() {
  const [period, setPeriod] = useState(() => jakartaToday().slice(0, 7));
  const [editor, setEditor] = useState<{ budget: BudgetStatusItem | null; period: string } | null>(null);
  const [deleting, setDeleting] = useState<BudgetStatusItem | null>(null);
  const [notice, setNotice] = useState("");
  const opener = useRef<HTMLElement | null>(null);
  const focusAfterClose = useRef(false);
  const add = useRef<HTMLButtonElement>(null);
  const valid = Boolean(monthRange(period));
  const busy = Boolean(editor || deleting);
  const categories = useQuery({ queryKey: ["categories"], queryFn: ({ signal }) => fetchCategories(signal) });
  const status = useQuery({ queryKey: ["budgets", "status", period], queryFn: ({ signal }) => fetchBudgetStatus(period, signal), enabled: valid });
  const periodLabel = valid ? formatDate(`${period}-01`).replace(/^1 /, "") : "";
  useEffect(() => {
    if (!editor && !deleting && focusAfterClose.current) {
      focusAfterClose.current = false;
      const label = opener.current?.getAttribute("aria-label");
      const replacement = label ? [...document.querySelectorAll<HTMLButtonElement>("button[aria-label]")].find((button) => button.getAttribute("aria-label") === label) : null;
      (opener.current?.isConnected ? opener.current : replacement ?? add.current)?.focus();
    }
  }, [editor, deleting]);
  function openEditor(budget: BudgetStatusItem | null) {
    opener.current = document.activeElement as HTMLElement;
    setNotice(""); setEditor({ budget, period });
  }
  function closeEditor() { setEditor(null); focusAfterClose.current = true; }
  function closeDelete() { setDeleting(null); focusAfterClose.current = true; }
  return <div className="space-y-6">
    <header className="finance-page-header">
      <div>
        <h1 className="finance-page-title">Budget Bulanan</h1>
        <p className="finance-page-subtitle">Tetapkan batas pengeluaran dan lihat pemakaian per kategori.</p>
      </div>
      <button ref={add} type="button" disabled={!valid || busy} onClick={() => openEditor(null)} className="transaction-button transaction-primary inline-flex items-center justify-center gap-2"><Plus aria-hidden="true" className="h-4 w-4" />Tambah Budget</button>
    </header>
    <p role="status" className={notice ? "text-sm text-slate-700" : "sr-only"}>{notice}</p>
    <section aria-label="Periode budget" className="finance-panel finance-filter-bar flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="transaction-field sm:w-64">
        <label htmlFor="budget-filter-period">Bulan</label>
        <input id="budget-filter-period" name="budget-filter-period" type="month" min="0001-01" max="9999-12" className="transaction-control" value={period} disabled={busy} aria-invalid={!valid} aria-describedby="budget-filter-error" onChange={(event) => { setPeriod(event.target.value); setNotice(""); }} />
        <span id="budget-filter-error" className="transaction-field-error">{!valid && "Pilih bulan yang valid untuk menampilkan budget."}</span>
      </div>
      <p className="max-w-prose text-sm text-slate-600">Mendekati batas mulai 80%, over budget mulai 100%. Hanya transaksi pengeluaran pada bulan terpilih yang dihitung.</p>
    </section>
    {categories.isPending && <p role="status" className="text-sm text-slate-600">Memuat kategori…</p>}
    {categories.isError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>Kategori gagal dimuat. {categories.error.message}</p><button type="button" className="transaction-button mt-3" disabled={categories.isFetching} onClick={() => void categories.refetch()}>Coba lagi kategori</button></div>}
    {editor && <BudgetForm key={editor.budget?.id ?? "new"} {...editor} categories={categories.data ?? []} categoriesReady={categories.isSuccess} onCancel={closeEditor} onSaved={(savedPeriod) => {
      setPeriod(savedPeriod); setNotice(`Budget berhasil ${editor.budget ? "diperbarui" : "ditambahkan"}. Menampilkan bulan budget yang disimpan.`); closeEditor();
    }} />}
    {valid && <section aria-labelledby="budget-progress-title" className="finance-panel overflow-hidden">
      <div className="border-b border-slate-200 px-5 py-4"><h2 id="budget-progress-title" className="text-lg font-semibold text-slate-900">Progress budget · {periodLabel}</h2></div>
      {status.isError ? <div role="alert" className="p-5 text-sm text-red-700"><p>Budget gagal dimuat. {status.error.message}</p><p className="mt-1">Nominal tidak ditampilkan karena data terbaru belum tersedia.</p><button type="button" disabled={status.isFetching} className="transaction-button mt-3" onClick={() => void status.refetch()}>Coba lagi budget</button></div>
        : status.isPending || status.isFetching ? <p role="status" className="p-5 text-sm text-slate-600">{status.isPending ? "Memuat budget…" : "Memperbarui budget…"}</p>
        : status.data?.items.length === 0 ? <div className="p-6"><p className="font-medium text-slate-900">Belum ada budget untuk bulan ini.</p><p className="mt-1 text-sm text-slate-600">Gunakan Tambah Budget untuk menetapkan batas pada kategori pengeluaran. Tidak ada budget yang dibuat otomatis.</p></div>
        : <ul className="divide-y divide-slate-200">{status.data?.items.map((item) => {
          const percentage = `${item.percentage.replace(/\.00$/, "").replace(".", ",")}%`;
          const label = budgetStatusLabels[item.status];
          return <li key={item.id} aria-label={`Budget ${item.category_name}`} className="finance-budget-item space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0"><h3 className="break-words text-lg font-semibold text-slate-900">{item.category_name}</h3><p className={`finance-status mt-2 ${statusStyles[item.status]}`}>{label}</p></div>
              <div className="flex shrink-0 gap-2"><button type="button" disabled={busy} className="transaction-button" aria-label={`Edit budget ${item.category_name}`} onClick={() => openEditor(item)}>Edit</button><button type="button" disabled={busy} className="transaction-button text-red-700" aria-label={`Hapus budget ${item.category_name}`} onClick={() => { opener.current = document.activeElement as HTMLElement; setNotice(""); setDeleting(item); }}>Hapus</button></div>
            </div>
            <dl className="grid gap-4 sm:grid-cols-3">
              <div className="min-w-0"><dt className="text-sm text-slate-600">Budget</dt><dd className="mt-1 font-semibold text-slate-900"><Money amount={item.budget} /></dd></div>
              <div className="min-w-0"><dt className="text-sm text-slate-600">Terpakai</dt><dd className="mt-1 font-semibold text-slate-900"><Money amount={item.spent} /></dd></div>
              <div className="min-w-0"><dt className="text-sm text-slate-600">Sisa budget</dt><dd className={`mt-1 font-semibold ${item.remaining.startsWith("-") ? "text-red-700" : "text-slate-900"}`}><Money amount={item.remaining} /></dd></div>
            </dl>
            <div><div className="mb-2 flex flex-wrap justify-between gap-2 text-sm"><span className="text-slate-600">Pemakaian budget</span><span className="break-all font-medium tabular-nums text-slate-900">{percentage}</span></div><progress max={100} value={budgetProgress(item.spent, item.budget)} aria-label={`Progress budget ${item.category_name}`} aria-valuetext={`${percentage} terpakai · ${label}`} className={`budget-progress budget-progress-${item.status}`} /></div>
            {item.status !== "normal" && <p className={`text-sm ${item.status === "over_budget" ? "text-red-700" : "text-amber-800"}`}>{item.status === "over_budget" ? "Pengeluaran sudah mencapai atau melewati budget. Periksa kembali rencana pengeluaran kategori ini." : "Pengeluaran sudah mendekati batas budget. Pertimbangkan sisa budget sebelum mencatat pengeluaran berikutnya."}</p>}
          </li>;
        })}</ul>}
    </section>}
    {deleting && <DeleteBudgetDialog budget={deleting} period={period} onCancel={closeDelete} onDeleted={() => { setNotice("Budget berhasil dihapus. Transaksi tetap tersimpan."); closeDelete(); }} />}
  </div>;
}
