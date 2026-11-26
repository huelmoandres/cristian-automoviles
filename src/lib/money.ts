import type { Currency } from "@/bindings/Currency";
import type { CurrencyTotal } from "@/bindings/CurrencyTotal";

/**
 * Suma un monto por moneda (nunca se mezclan pesos con dólares).
 * Devuelve el mismo shape que los totales del dashboard.
 */
export function sumByCurrency<T extends { currency: Currency }>(
  items: readonly T[],
  amount: (item: T) => number,
): CurrencyTotal[] {
  const totals = new Map<Currency, CurrencyTotal>();
  for (const item of items) {
    const t = totals.get(item.currency) ?? { currency: item.currency, count: 0, amountCents: 0 };
    t.count += 1;
    t.amountCents += amount(item);
    totals.set(item.currency, t);
  }
  return [...totals.values()];
}
