import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Landmark, Plus, Trash2, Wallet, Edit2 } from "lucide-react";
import { useState } from "react";
import { deleteTransfer, fetchTransfers, invalidateTransferQueries } from "../api/transfers";
import { fetchWallets } from "../api/wallets";
import { DeleteWalletDialog } from "../components/DeleteWalletDialog";
import { Money } from "../components/Money";
import { TransferModal } from "../components/TransferModal";
import { WalletFormModal } from "../components/WalletFormModal";
import { formatDate } from "../lib/formatters";
import { WALLET_TYPE_LABELS } from "../lib/wallets";
import type { TransferItem } from "../lib/transfers";
import type { WalletItem, WalletType } from "../lib/wallets";

const WALLET_TYPE_BADGES: Record<WalletType, string> = {
  bank: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800",
  cash: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
  ewallet: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800",
  investment: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
  other: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};

export function WalletsPage() {
  const [editorWallet, setEditorWallet] = useState<WalletItem | null | "new">(null);
  const [deletingWallet, setDeletingWallet] = useState<WalletItem | null>(null);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [defaultFromWalletId, setDefaultFromWalletId] = useState<number | undefined>(undefined);
  const [transferPage, setTransferPage] = useState(1);
  const [deletingTransfer, setDeletingTransfer] = useState<TransferItem | null>(null);

  const client = useQueryClient();

  const walletsQuery = useQuery({
    queryKey: ["wallets"],
    queryFn: ({ signal }) => fetchWallets(signal),
  });

  const transfersQuery = useQuery({
    queryKey: ["transfers", transferPage],
    queryFn: ({ signal }) => fetchTransfers(transferPage, 10, signal),
  });

  const deleteTransferMutation = useMutation({
    mutationFn: (id: number) => deleteTransfer(id),
    onSuccess: async () => {
      await invalidateTransferQueries(client);
      setDeletingTransfer(null);
    },
  });

  const wallets = walletsQuery.data?.items ?? [];
  const totalBalance = walletsQuery.data?.total_balance_rupiah ?? "0";

  function openTransfer(fromId?: number) {
    setDefaultFromWalletId(fromId);
    setTransferModalOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <header className="finance-page-header">
        <div>
          <h1 className="finance-page-title">Dompet & Rekening</h1>
          <p className="finance-page-subtitle">
            Kelola saldo dompet digital, tunai, rekening bank, serta transfer dana antar dompet.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={walletsQuery.isPending}
            onClick={() => setEditorWallet("new")}
            className="transaction-button transaction-primary inline-flex items-center gap-2"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            Tambah Dompet
          </button>
          <button
            type="button"
            disabled={wallets.length < 2}
            onClick={() => openTransfer()}
            title={wallets.length < 2 ? "Dibutuhkan minimal 2 dompet untuk melakukan transfer" : undefined}
            className="transaction-button inline-flex items-center gap-2 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ArrowLeftRight aria-hidden="true" className="h-4 w-4" />
            Transfer Dana
          </button>
        </div>
      </header>

      {/* Summary KPI Cards */}
      <section aria-label="Ringkasan Saldo" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="finance-panel p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-teal-50 dark:bg-teal-950/60 p-2.5 text-teal-700 dark:text-teal-400">
              <Wallet className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Saldo Bersih (Net Worth)</p>
              <div className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                <Money amount={totalBalance} />
              </div>
            </div>
          </div>
        </div>

        <div className="finance-panel p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/60 p-2.5 text-blue-700 dark:text-blue-400">
              <Landmark className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Jumlah Dompet Aktif</p>
              <p className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                {wallets.length} <span className="text-sm font-normal text-slate-500">dompet</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Wallets Grid */}
      <section aria-labelledby="wallets-list-title" className="space-y-3">
        <h2 id="wallets-list-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Daftar Dompet
        </h2>

        {walletsQuery.isPending && (
          <p role="status" className="text-sm text-slate-500 dark:text-slate-400 py-6">
            Memuat dompet…
          </p>
        )}

        {walletsQuery.isError && (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/40 p-4 text-sm text-rose-800 dark:text-rose-200">
            <p>Gagal memuat dompet: {walletsQuery.error.message}</p>
            <button
              type="button"
              className="transaction-button mt-3"
              onClick={() => void walletsQuery.refetch()}
            >
              Coba lagi
            </button>
          </div>
        )}

        {walletsQuery.isSuccess && wallets.length === 0 && (
          <div className="finance-panel p-8 text-center">
            <p className="font-medium text-slate-900 dark:text-slate-100">Belum ada dompet.</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Tambahkan dompet pertama Anda untuk mulai mengorganisir transaksi dan rekening.
            </p>
            <button
              type="button"
              onClick={() => setEditorWallet("new")}
              className="transaction-button transaction-primary mt-4 inline-flex items-center gap-2"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Tambah Dompet
            </button>
          </div>
        )}

        {wallets.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {wallets.map((w) => (
              <div
                key={w.id}
                className="finance-panel p-5 flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-base truncate" title={w.name}>
                      {w.name}
                    </h3>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                        WALLET_TYPE_BADGES[w.type] ?? WALLET_TYPE_BADGES.other
                      }`}
                    >
                      {WALLET_TYPE_LABELS[w.type] ?? w.type}
                    </span>
                  </div>

                  <div className="mt-4">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Saldo Terkini</p>
                    <div className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                      <Money amount={w.current_balance_rupiah} />
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Saldo awal: <span className="font-mono">{formatDate(w.created_at)}</span>
                  </p>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={wallets.length < 2}
                    onClick={() => openTransfer(w.id)}
                    title={wallets.length < 2 ? "Dibutuhkan minimal 2 dompet untuk transfer" : "Transfer dana dari dompet ini"}
                    className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 disabled:opacity-40"
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" /> Transfer
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditorWallet(w)}
                      className="p-1 rounded text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      aria-label={`Edit ${w.name}`}
                    >
                      <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingWallet(w)}
                      className="p-1 rounded text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                      aria-label={`Hapus ${w.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Transfers History Section */}
      <section aria-labelledby="transfers-title" className="finance-panel overflow-hidden">
        <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-4 flex items-center justify-between">
          <h2 id="transfers-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Riwayat Transfer Saldo
          </h2>
        </div>

        {transfersQuery.isPending && (
          <p role="status" className="p-5 text-sm text-slate-500 dark:text-slate-400">
            Memuat riwayat transfer…
          </p>
        )}

        {transfersQuery.isError && (
          <div role="alert" className="p-5 text-sm text-rose-700 dark:text-rose-400">
            <p>Gagal memuat transfer: {transfersQuery.error.message}</p>
          </div>
        )}

        {transfersQuery.isSuccess && transfersQuery.data.items.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-600 dark:text-slate-400">
            Belum ada riwayat transfer saldo.
          </div>
        )}

        {transfersQuery.isSuccess && transfersQuery.data.items.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs font-medium text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th scope="col" className="px-5 py-3">Tanggal</th>
                    <th scope="col" className="px-5 py-3">Dompet Asal → Tujuan</th>
                    <th scope="col" className="px-5 py-3">Nominal</th>
                    <th scope="col" className="px-5 py-3">Keterangan</th>
                    <th scope="col" className="px-5 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {transfersQuery.data.items.map((transfer) => (
                    <tr key={transfer.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400">
                        {formatDate(transfer.date)}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {transfer.from_wallet_name}
                        </span>
                        <span className="mx-2 text-slate-400">→</span>
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {transfer.to_wallet_name}
                        </span>
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap font-mono font-medium text-slate-900 dark:text-slate-100">
                        <Money amount={transfer.amount_rupiah} />
                      </td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-400 max-w-xs truncate" title={transfer.description}>
                        {transfer.description}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap text-right">
                        <button
                          type="button"
                          onClick={() => setDeletingTransfer(transfer)}
                          className="text-xs text-rose-600 dark:text-rose-400 hover:underline"
                          aria-label={`Hapus transfer ${transfer.description}`}
                        >
                          Hapus
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {transfersQuery.data.total > 10 && (
              <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 px-5 py-3">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Total {transfersQuery.data.total} transfer
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={transferPage <= 1}
                    onClick={() => setTransferPage((p) => Math.max(1, p - 1))}
                    className="transaction-button py-1 px-3 text-xs"
                  >
                    Sebelumnya
                  </button>
                  <button
                    type="button"
                    disabled={transferPage * 10 >= transfersQuery.data.total}
                    onClick={() => setTransferPage((p) => p + 1)}
                    className="transaction-button py-1 px-3 text-xs"
                  >
                    Selanjutnya
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Wallet Edit / Create Modal */}
      {editorWallet && (
        <WalletFormModal
          wallet={editorWallet === "new" ? null : editorWallet}
          onCancel={() => setEditorWallet(null)}
          onSaved={() => setEditorWallet(null)}
        />
      )}

      {/* Transfer Modal */}
      {transferModalOpen && (
        <TransferModal
          wallets={wallets}
          defaultFromWalletId={defaultFromWalletId}
          onCancel={() => setTransferModalOpen(false)}
          onSaved={() => setTransferModalOpen(false)}
        />
      )}

      {/* Delete Wallet Dialog */}
      {deletingWallet && (
        <DeleteWalletDialog
          wallet={deletingWallet}
          onCancel={() => setDeletingWallet(null)}
          onDeleted={() => setDeletingWallet(null)}
        />
      )}

      {/* Delete Transfer Confirmation Dialog */}
      {deletingTransfer && (
        <dialog
          open
          aria-labelledby="delete-transfer-title"
          className="transaction-dialog max-w-md"
        >
          <h2 id="delete-transfer-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Hapus Transfer?
          </h2>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            Hapus transfer senilai{" "}
            <strong className="font-mono text-slate-900 dark:text-slate-100">
              <Money amount={deletingTransfer.amount_rupiah} />
            </strong>{" "}
            dari <strong>{deletingTransfer.from_wallet_name}</strong> ke{" "}
            <strong>{deletingTransfer.to_wallet_name}</strong>? Saldo kedua dompet akan disesuaikan kembali.
          </p>
          {deleteTransferMutation.error && (
            <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-400">
              {deleteTransferMutation.error.message}
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              disabled={deleteTransferMutation.isPending}
              className="transaction-button"
              onClick={() => setDeletingTransfer(null)}
            >
              Batal
            </button>
            <button
              type="button"
              disabled={deleteTransferMutation.isPending}
              className="transaction-button transaction-danger"
              onClick={() => void deleteTransferMutation.mutate(deletingTransfer.id)}
            >
              {deleteTransferMutation.isPending ? "Menghapus…" : "Hapus Transfer"}
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
}
