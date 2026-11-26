import { HandCoins } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import type { DueInstallment } from "@/bindings/DueInstallment";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PaymentDialog, type PaymentTarget } from "@/features/payments/components/PaymentDialog";
import { INSTALLMENT_STATUS } from "@/lib/constants";
import { formatDate, formatMoney, plural } from "@/lib/format";
import { INSTALLMENT_STATUS_META } from "@/lib/labels";
import { routes } from "@/lib/routes";
import { LateFeeCell } from "./LateFeeCell";

function toPaymentTarget(d: DueInstallment): PaymentTarget {
  return {
    installmentId: d.id,
    number: d.number,
    installmentsCount: d.installmentsCount,
    clientName: d.clientName,
    vehicleLabel: d.vehicleLabel,
  };
}

/** Cuotas impagas de distintas ventas, con acceso directo a cobrar. */
export function DueInstallmentsTable({ items }: { items: DueInstallment[] }) {
  const [paying, setPaying] = useState<PaymentTarget | null>(null);

  return (
    <>
      <Table>
        <THead>
          <tr>
            <TH>Cliente</TH>
            <TH>Vehículo</TH>
            <TH>Cuota</TH>
            <TH>Vencimiento</TH>
            <TH className="text-right">Importe</TH>
            <TH className="text-right">Recargo</TH>
            <TH>Estado</TH>
            <TH />
          </tr>
        </THead>
        <TBody>
          {items.map((d) => (
            <TR key={d.id}>
              <TD>
                <Link
                  to={routes.clientDetail(d.clientId)}
                  className="font-medium text-slate-900 hover:text-brand-700"
                >
                  {d.clientName}
                </Link>
                {d.clientPhone && <div className="text-xs text-slate-500">{d.clientPhone}</div>}
              </TD>
              <TD className="text-slate-600">
                <Link to={routes.saleDetail(d.saleId)} className="hover:text-brand-700">
                  {d.vehicleLabel}
                </Link>
              </TD>
              <TD className="whitespace-nowrap">
                {d.number} de {d.installmentsCount}
              </TD>
              <TD className="whitespace-nowrap">
                {formatDate(d.dueDate)}
                {d.status === INSTALLMENT_STATUS.OVERDUE && (
                  <div className="text-xs text-red-600">
                    {plural(d.daysLate, "día", "días")} de atraso
                  </div>
                )}
              </TD>
              <TD className="text-right font-medium">{formatMoney(d.amountCents, d.currency)}</TD>
              <TD className="text-right">
                <LateFeeCell installment={d} currency={d.currency} />
              </TD>
              <TD>
                <StatusBadge meta={INSTALLMENT_STATUS_META[d.status]} />
              </TD>
              <TD className="text-right">
                <Button size="sm" onClick={() => setPaying(toPaymentTarget(d))}>
                  <HandCoins /> Cobrar
                </Button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <PaymentDialog target={paying} onClose={() => setPaying(null)} />
    </>
  );
}
