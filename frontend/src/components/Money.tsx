import { Fragment } from "react";
import { formatRupiah } from "../lib/formatters";

// Format once with the existing exact formatter. Break only between complete
// thousands groups, never between digits or by converting money to Number.
export function Money({ amount, className = "" }: { amount: string; className?: string }) {
  const groups = formatRupiah(amount).split(".");
  return <span data-money className={`finance-money ${className}`}>
    {groups.map((group, index) => <Fragment key={index}>
      <span className="finance-money-group">{group}{index < groups.length - 1 ? "." : ""}</span>
      {index < groups.length - 1 && <wbr />}
    </Fragment>)}
  </span>;
}
