import type { CurrencyTotal } from "@/bindings/CurrencyTotal";
import { formatMoney } from "@/lib/format";

/**
 * Montos por moneda (nunca se suman pesos con dólares): uno por línea, o en la misma
 * línea separados por " + " con `inline`. Muestra "—" si no hay.
 */
export function MoneyList({ totals, inline }: { totals: CurrencyTotal[]; inline?: boolean }) {
  if (totals.length === 0) return <>—</>;
  if (inline) {
    return <>{totals.map((t) => formatMoney(t.amountCents, t.currency)).join(" + ")}</>;
  }
  return (
    <>
      {totals.map((t) => (
        <div key={t.currency}>{formatMoney(t.amountCents, t.currency)}</div>
      ))}
    </>
  );
}
