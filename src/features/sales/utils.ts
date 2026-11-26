import type { Sale } from "@/bindings/Sale";
import { formatDate, formatPercent, plural } from "@/lib/format";

export function isCashSale(sale: Sale): boolean {
  return sale.installmentsCount === 0;
}

export function isHybridSale(sale: Sale): boolean {
  return !isCashSale(sale) && sale.downPaymentCents > 0;
}

/** "Contado", "12 cuotas" o "Entrega + 12 cuotas". */
export function paymentText(sale: Sale): string {
  if (isCashSale(sale)) return "Contado";
  const plan = sale.planName ?? plural(sale.installmentsCount, "cuota", "cuotas");
  return isHybridSale(sale) ? `Entrega + ${plan}` : plan;
}

/** "Venta del 01/10/2026 · 12 cuotas (recargo 30%) · Mora 20% con 5 días de gracia". */
export function conditionsText(sale: Sale): string {
  const plan = isCashSale(sale)
    ? "Contado"
    : `${paymentText(sale)} (recargo ${formatPercent(sale.surchargeBp)})`;
  const grace = sale.graceDays > 0 ? ` con ${plural(sale.graceDays, "día", "días")} de gracia` : "";
  return `Venta del ${formatDate(sale.saleDate)} · ${plan} · Mora ${formatPercent(sale.lateFeeBp)}${grace}`;
}
