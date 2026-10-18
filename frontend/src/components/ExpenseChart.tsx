import { useId, useState } from "react";
import type { HistoricalMonthExpense } from "../api/analytics";
import { formatRupiah } from "../lib/formatters";
import { Money } from "./Money";

export type ExpenseHistoryPoint = Omit<HistoricalMonthExpense, "transaction_count"> & { transaction_count: number | null };

function monthLabel(item: ExpenseHistoryPoint) {
  const date = new Date(0);
  date.setFullYear(item.year, item.month - 1, 1);
  return new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric" }).format(date);
}

function smoothPath(points: { x: number; y: number }[]) {
  const start = `M ${points[0].x} ${points[0].y}`;
  if (points.length === 1) return start;
  const slopes = points.slice(1).map((point, index) =>
    (point.y - points[index].y) / (point.x - points[index].x),
  );
  // Monotone tangents keep the curve within the actual monthly values:
  // flat periods stay flat and peaks cannot overshoot the recorded amounts.
  const tangents = points.map((_, index) => {
    if (index === 0) return slopes[0];
    if (index === points.length - 1) return slopes[index - 1];
    const before = slopes[index - 1], after = slopes[index];
    return before * after <= 0 ? 0 : 2 * before * after / (before + after);
  });
  return start + points.slice(1).map((point, index) => {
    const previous = points[index];
    const step = (point.x - previous.x) / 3;
    return ` C ${previous.x + step} ${previous.y + tangents[index] * step}, ${point.x - step} ${point.y - tangents[index + 1] * step}, ${point.x} ${point.y}`;
  }).join("");
}

export function ExpenseChart({ history }: { history: ExpenseHistoryPoint[] }) {
  const id = useId();
  const [selected, setSelected] = useState<number | null>(null);
  if (!history.length) return null;
  const peak = history.reduce((max, item) => BigInt(item.expense) > max ? BigInt(item.expense) : max, 1n);
  const points = history.map((item, index) => ({
    x: history.length === 1 ? 300 : 24 + index * 552 / (history.length - 1),
    y: 150 - Number(BigInt(item.expense) * 11000n / peak) / 100,
  }));
  const path = smoothPath(points);
  const active = selected !== null && selected < history.length ? selected : history.length - 1;
  return <figure className="expense-chart" aria-labelledby={`${id}-title`}>
    <figcaption className="expense-chart-caption">
      <div><h3 id={`${id}-title`}>Riwayat pengeluaran</h3><p>Tiga bulan sebelumnya hingga periode terpilih</p></div>
      <div className="expense-chart-value" aria-live="polite"><strong><Money amount={history[active].expense} /></strong><span>{monthLabel(history[active])} · {history[active].transaction_count === null ? "Aktual periode terpilih" : `${history[active].transaction_count} transaksi`}</span></div>
    </figcaption>
    <div className="expense-chart-plot"><svg viewBox="0 0 600 180" preserveAspectRatio="none" role="img" aria-label={`Tren pengeluaran: ${history.map(item => `${monthLabel(item)} ${formatRupiah(item.expense)}`).join(", ")}`}>
      <defs><linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".18"/><stop offset="100%" stopColor="currentColor" stopOpacity="0"/></linearGradient><clipPath id={`${id}-reveal`} clipPathUnits="userSpaceOnUse"><rect className="expense-chart-reveal-mask" x="0" y="0" width="600" height="180" /></clipPath></defs>
      {[40, 95, 150].map(y => <line key={y} x1="24" x2="576" y1={y} y2={y} className="expense-chart-grid" />)}
      <path className="expense-chart-area" d={`${path} L ${points.at(-1)!.x} 150 L ${points[0].x} 150 Z`} fill={`url(#${id}-fill)`}/>
      <path className="expense-chart-line" d={path} clipPath={`url(#${id}-reveal)`} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>{points.map((point, index) => <span key={`${history[index].year}-${history[index].month}`} aria-hidden="true" className={`expense-chart-marker ${index === active ? "is-active" : ""}`} style={{ left: `${point.x / 6}%`, top: `${point.y / 1.8}%` }} />)}</div>
    <div className="expense-chart-periods">{history.map((item, index) => <button key={`${item.year}-${item.month}`} type="button" aria-pressed={active === index} onClick={() => setSelected(index)} onMouseEnter={() => setSelected(index)} onFocus={() => setSelected(index)}><span>{monthLabel(item)}</span><Money amount={item.expense} /></button>)}</div>
  </figure>;
}
