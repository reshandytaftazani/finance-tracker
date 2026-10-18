import { useId, useState } from "react";
import type { KeyboardEvent } from "react";
import type { CategoryBreakdownItem } from "../api/analytics";
import { formatRupiah } from "../lib/formatters";
import { Money } from "./Money";

function sectorPath(start: number, end: number) {
  const point = (angle: number) => [100 + 92 * Math.cos(angle), 100 + 92 * Math.sin(angle)];
  const a = point(start), b = point(end);
  return `M 100 100 L ${a[0]} ${a[1]} A 92 92 0 ${end - start > Math.PI ? 1 : 0} 1 ${b[0]} ${b[1]} Z`;
}

export function AllocationPieChart({ items }: { items: CategoryBreakdownItem[] }) {
  const id = useId();
  const [selected, setSelected] = useState<number | null>(null);
  const expenses = items.filter(item => BigInt(item.expense) > 0n);
  const total = expenses.reduce((sum, item) => sum + BigInt(item.expense), 0n);
  if (!total) return <p className="allocation-empty">Belum ada pengeluaran untuk ditampilkan.</p>;
  const active = expenses.find(item => item.category_id === selected);
  const cumulative = expenses.reduce<bigint[]>((values, item) => [...values, values[values.length - 1] + BigInt(item.expense)], [0n]);
  const segments = expenses.map((item, index) => {
    const start = Number(cumulative[index] * 1000000000n / total) / 1000000000 * 2 * Math.PI - Math.PI / 2;
    const end = Number(cumulative[index + 1] * 1000000000n / total) / 1000000000 * 2 * Math.PI - Math.PI / 2;
    const percentage = `${(Number(BigInt(item.expense) * 1000n / total) / 10).toLocaleString("id-ID", { minimumFractionDigits: 1 })}%`;
    return { ...item, index, start, end, percentage };
  });
  return <figure className="allocation-pie" aria-labelledby={`${id}-title`}>
    <figcaption id={`${id}-title`} className="sr-only">Proporsi pengeluaran per kategori</figcaption>
    <svg viewBox="0 0 200 200" className="allocation-pie-visual" role="group" aria-label="Pie chart alokasi pengeluaran">
      {segments.map(item => {
        const attributes = {
          className: `allocation-slice allocation-color-${item.index % 8}`,
          "data-dimmed": Boolean(active && active.category_id !== item.category_id),
          role: "button" as const, tabIndex: 0,
          "aria-pressed": active?.category_id === item.category_id,
          "aria-label": `${item.category_name}: ${item.percentage}, ${formatRupiah(item.expense)}`,
          onClick: () => setSelected(item.category_id),
          onFocus: () => setSelected(item.category_id),
          onMouseEnter: () => setSelected(item.category_id),
          onKeyDown: (event: KeyboardEvent<SVGElement>) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(item.category_id); } },
        };
        return segments.length === 1
          ? <circle key={item.category_id} cx={100} cy={100} r={92} {...attributes}><title>{attributes["aria-label"]}</title></circle>
          : <path key={item.category_id} d={sectorPath(item.start, item.end)} {...attributes}><title>{attributes["aria-label"]}</title></path>;
      })}
    </svg>
    <div className="allocation-readout" aria-live="polite"><span>{active?.category_name ?? "Total pengeluaran"}</span><Money amount={active?.expense ?? total.toString()} />{active && <button type="button" onClick={() => setSelected(null)}>Lihat total</button>}</div>
    <ul className="allocation-legend">{segments.map(item => <li key={item.category_id}><button type="button" aria-pressed={active?.category_id === item.category_id} onClick={() => setSelected(item.category_id)} onMouseEnter={() => setSelected(item.category_id)} onFocus={() => setSelected(item.category_id)}>
      <span className={`allocation-swatch allocation-color-${item.index % 8}`} aria-hidden="true"/>
      <span className="allocation-category">{item.category_name}<Money amount={item.expense} /></span>
      <span className="allocation-percentage">{item.percentage}</span>
    </button></li>)}</ul>
  </figure>;
}
