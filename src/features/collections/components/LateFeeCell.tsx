import type { Installment } from "@/bindings/Installment";
import { formatMoney } from "@/lib/format";

/** Recargo cobrado, o el que correspondería pagando hoy si la cuota está vencida. */
export function LateFeeCell({
  installment,
  currency,
}: {
  installment: Pick<Installment, "lateFeeCents" | "pendingLateFeeCents">;
  currency: string;
}) {
  if (installment.lateFeeCents > 0) return <>{formatMoney(installment.lateFeeCents, currency)}</>;
  if (installment.pendingLateFeeCents > 0) {
    return (
      <span className="text-red-600" title="Recargo si se paga hoy">
        +{formatMoney(installment.pendingLateFeeCents, currency)}
      </span>
    );
  }
  return <span className="text-slate-400">—</span>;
}
