import { AlertTriangle, CheckCircle2, Wallet } from "lucide-react";
import type { Sale } from "@/bindings/Sale";
import { MoneyList } from "@/components/ui/money-list";
import { StatCard } from "@/components/ui/stat-card";
import { SALE_STATUS } from "@/lib/constants";
import { formatMoney, plural } from "@/lib/format";
import { sumByCurrency } from "@/lib/money";

/** Resumen de deuda del cliente, separado por moneda (no se mezclan pesos y dólares). */
export function DebtSummary({ sales }: { sales: Sale[] }) {
  const current = sales.filter((s) => s.status !== SALE_STATUS.CANCELLED);
  const overdueCount = current.reduce((n, s) => n + s.overdueInstallments, 0);
  const lateFees = sumByCurrency(current, (s) => s.pendingLateFeesCents);

  return (
    <div className="grid h-full gap-4 sm:grid-cols-3">
      <StatCard label="Saldo pendiente" icon={Wallet}>
        <MoneyList totals={sumByCurrency(current, (s) => s.balanceCents)} />
      </StatCard>
      <StatCard
        label="Vencido"
        icon={AlertTriangle}
        tone={overdueCount > 0 ? "red" : "green"}
        footer={
          overdueCount > 0
            ? `${plural(overdueCount, "cuota", "cuotas")} · recargo hoy: ${lateFees
                .map((t) => formatMoney(t.amountCents, t.currency))
                .join(" + ")}`
            : "Al día"
        }
      >
        <MoneyList totals={sumByCurrency(current, (s) => s.overdueCents)} />
      </StatCard>
      <StatCard label="Pagado" icon={CheckCircle2} tone="green" footer="Entrega + cuotas">
        <MoneyList totals={sumByCurrency(current, (s) => s.paidCents)} />
      </StatCard>
    </div>
  );
}
