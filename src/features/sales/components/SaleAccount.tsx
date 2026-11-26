import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import type { SaleDetail } from "@/bindings/SaleDetail";
import { Card, CardHeader } from "@/components/ui/card";
import { Metric } from "@/components/ui/metric";
import { StatusBadge } from "@/components/ui/status-badge";
import { PaymentDialog, type PaymentTarget } from "@/features/payments/components/PaymentDialog";
import { SALE_STATUS } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { SALE_STATUS_META } from "@/lib/labels";
import { routes } from "@/lib/routes";
import { conditionsText, isCashSale } from "../utils";
import { InstallmentsTable } from "./InstallmentsTable";

/** Cuenta corriente de una venta: totales, cronograma de cuotas y cobro. */
export function SaleAccount({ detail, linkToSale }: { detail: SaleDetail; linkToSale?: boolean }) {
  const { sale, installments } = detail;
  const [paying, setPaying] = useState<PaymentTarget | null>(null);
  const money = (cents: number) => formatMoney(cents, sale.currency);
  const isCash = isCashSale(sale);
  const hasOverdue = sale.overdueCents > 0;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {linkToSale ? (
              <Link to={routes.saleDetail(sale.id)} className="hover:text-brand-700">
                {sale.vehicleLabel}
              </Link>
            ) : (
              sale.vehicleLabel
            )}
            <StatusBadge meta={SALE_STATUS_META[sale.status]} />
          </span>
        }
        description={conditionsText(sale)}
        actions={
          linkToSale && (
            <Link
              to={routes.saleDetail(sale.id)}
              className="flex items-center gap-1 text-sm text-brand-700 hover:underline"
            >
              Ver venta <ExternalLink className="size-3.5" />
            </Link>
          )
        }
      />
      <div className="grid grid-cols-2 gap-4 border-b border-slate-100 px-5 py-4 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Precio" value={money(sale.priceCents)} />
        <Metric label={isCash ? "Pago contado" : "Entrega"} value={money(sale.downPaymentCents)} />
        <Metric label="Total en cuotas" value={isCash ? "—" : money(sale.totalFinancedCents)} />
        <Metric
          label="Cuotas pagas"
          value={isCash ? "—" : `${sale.paidInstallments} de ${sale.installmentsCount}`}
        />
        <Metric label="Saldo" value={money(sale.balanceCents)} />
        <Metric
          label="Vencido"
          value={
            hasOverdue
              ? `${money(sale.overdueCents)} + ${money(sale.pendingLateFeesCents)}`
              : "Al día"
          }
          tone={hasOverdue ? "red" : "green"}
        />
      </div>
      {installments.length > 0 && (
        <InstallmentsTable
          installments={installments}
          currency={sale.currency}
          onPay={
            sale.status === SALE_STATUS.ACTIVE
              ? (i) =>
                  setPaying({
                    installmentId: i.id,
                    number: i.number,
                    installmentsCount: sale.installmentsCount,
                    clientName: sale.clientName,
                    vehicleLabel: sale.vehicleLabel,
                  })
              : undefined
          }
        />
      )}
      {sale.notes && <p className="px-5 py-3 text-sm text-slate-600">{sale.notes}</p>}
      <PaymentDialog target={paying} onClose={() => setPaying(null)} />
    </Card>
  );
}
