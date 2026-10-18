import { Calendar, Check, Clock3, TrendingUp } from "lucide-react";
import type { AnalyticsForecast, AnalyticsSummary } from "../api/analytics";
import { jakartaToday, monthRange } from "../lib/transactions";
import { formatRupiah } from "../lib/formatters";
import { Money } from "./Money";

function periodName(month: number, year: number) {
  const date = new Date(0); date.setFullYear(year, month - 1, 1);
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(date);
}

export function ExpenseForecast({ forecast, summary, period }: { forecast: AnalyticsForecast; summary?: AnalyticsSummary; period: string }) {
  const today = jakartaToday();
  const current = period === today.slice(0, 7);
  const days = Number(monthRange(period)!.end_date.slice(-2));
  const elapsed = Number(today.slice(-2));
  const historical = forecast.status === "sufficient_data" && forecast.forecast_expense !== null;
  const paceAvailable = current && summary && BigInt(summary.expense) > 0n;
  const pace = paceAvailable ? ((BigInt(summary.expense) * BigInt(days) * 2n + BigInt(elapsed)) / (BigInt(elapsed) * 2n)).toString() : null;
  const estimate = historical ? forecast.forecast_expense : pace;
  const observedMonths = forecast.historical_months.filter(item => item.transaction_count > 0).length;
  const evaluation = forecast.evaluation;
  const actual = summary ? BigInt(summary.expense) : null;
  const remaining = estimate && actual !== null ? BigInt(estimate) - actual : null;
  return <div className="expense-forecast">
    <div className="forecast-main">
      <div className="forecast-title-row"><h3>Estimasi pengeluaran {periodName(forecast.month, forecast.year)}</h3><span className={`forecast-badge ${historical ? "" : "forecast-badge-pending"}`}>{historical ? <Check size={13} aria-hidden="true" /> : <Clock3 size={13} aria-hidden="true" />}{historical ? "Berbasis riwayat" : estimate ? "Estimasi sementara" : "Menunggu data"}</span></div>
      {estimate ? <Money amount={estimate} className="forecast-amount" /> : <p className="forecast-no-estimate">Belum cukup data untuk estimasi</p>}
      <p className="forecast-description">{historical ? "Rata-rata pengeluaran tiga bulan sebelumnya. Angka ini merupakan perkiraan, bukan batas budget." : pace ? `Total pengeluaran tercatat dibagi ${elapsed} hari berjalan, lalu dikalikan ${days} hari. Mengasumsikan laju harian tetap; transaksi besar atau bertanggal mendatang dapat membuat estimasi kurang representatif.` : "Rata-rata historis membutuhkan tiga bulan transaksi berurutan. Catat pengeluaran bulan berjalan untuk melihat estimasi sementara."}</p>
      {pace && !historical && <div className="forecast-calendar"><span><Calendar size={14} aria-hidden="true" /> Hari {elapsed} dari {days}</span><span>{days - elapsed} hari tersisa</span></div>}
      <dl className="forecast-comparison">
        <div><dt>Aktual periode terpilih</dt><dd>{summary ? <Money amount={summary.expense} /> : "Tidak tersedia"}</dd></div>
        <div><dt>{current ? "Selisih terhadap estimasi" : "Estimasi − aktual"}</dt><dd>{remaining !== null ? <Money amount={remaining.toString()} /> : "Belum tersedia"}</dd></div>
      </dl>
      {remaining !== null && remaining < 0n && <p className="forecast-caution">Pengeluaran aktual sudah melewati estimasi. Periksa kembali rencana pengeluaran Anda.</p>}
    </div>
    <div className="forecast-basis">
      <h3><TrendingUp size={16} aria-hidden="true" /> Dasar proyeksi</h3>
      <p className="forecast-description">{historical ? "Rata-rata bergerak 3 bulan" : `${observedMonths} dari 3 bulan riwayat tersedia`}</p>
      <ul className="forecast-months">{forecast.historical_months.map(item => <li key={`${item.year}-${item.month}`}>
        <span className={`forecast-month-indicator ${item.transaction_count > 0 ? "is-available" : ""}`} aria-hidden="true"/>
        <span>{periodName(item.month, item.year)}<small>{item.transaction_count > 0 ? `${item.transaction_count} transaksi` : "Belum ada transaksi"}</small></span>
        <Money amount={item.expense} />
      </li>)}</ul>
      <details className="forecast-method"><summary>Metode dan evaluasi</summary><div>
        <p>Rata-rata historis menggunakan tiga bulan sebelum periode terpilih. Aktual bulan terpilih tidak dimasukkan ke perhitungan tersebut.</p>
        {forecast.baseline_expense !== null && <p>Pembanding bulan sebelumnya: <strong>{formatRupiah(forecast.baseline_expense)}</strong>.</p>}
        {evaluation?.has_backtest ? <><p>Uji pada {evaluation.test_points_count} periode historis. Rata-rata selisih prediksi dengan aktual (lebih kecil lebih baik):</p><dl><div><dt>Rata-rata 3 bulan</dt><dd>{formatRupiah(evaluation.ma_mae ?? "0")}</dd></div><div><dt>Bulan sebelumnya</dt><dd>{formatRupiah(evaluation.naive_mae ?? "0")}</dd></div></dl></> : <p>Evaluasi akurasi historis belum tersedia; dibutuhkan minimal empat bulan data representatif. Estimasi sementara belum melalui evaluasi akurasi.</p>}
      </div></details>
    </div>
  </div>;
}
