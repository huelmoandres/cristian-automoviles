import { HandCoins } from "lucide-react";
import type { Installment } from "@/bindings/Installment";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { LateFeeCell } from "@/features/collections/components/LateFeeCell";
import { INSTALLMENT_STATUS } from "@/lib/constants";
import { formatDate, formatMoney, plural } from "@/lib/format";
import { INSTALLMENT_STATUS_META } from "@/lib/labels";
import { cn } from "@/lib/utils";

export function InstallmentsTable({
  installments,
  currency,
  onPay,
}: {
  installments: Installment[];
  currency: string;
  onPay?: (installment: Installment) => void;
}) {
  // Se cobra en orden: solo la primera cuota impaga tiene el botón.
  const nextUnpaidId = installments.find((i) => i.paidAt == null)?.id;

  return (
    <Table>
      <THead>
        <tr>
          <TH className="w-14">N°</TH>
          <TH>Vencimiento</TH>
          <TH className="text-right">Importe</TH>
          <TH>Estado</TH>
          <TH>Pagada el</TH>
          <TH className="text-right">Recargo</TH>
          {onPay && <TH />}
        </tr>
      </THead>
      <TBody>
        {installments.map((i) => {
          const overdue = i.status === INSTALLMENT_STATUS.OVERDUE;
          return (
            <TR key={i.id} className={cn(overdue && "bg-red-50/40")}>
              <TD className="font-medium">{i.number}</TD>
              <TD>
                {formatDate(i.dueDate)}
                {overdue && (
                  <span className="ml-2 text-xs text-red-600">
                    {plural(i.daysLate, "día", "días")}
                  </span>
                )}
              </TD>
              <TD className="text-right font-medium">{formatMoney(i.amountCents, currency)}</TD>
              <TD>
                <StatusBadge meta={INSTALLMENT_STATUS_META[i.status]} />
              </TD>
              <TD className="text-slate-600">{formatDate(i.paidAt)}</TD>
              <TD className="text-right">
                <LateFeeCell installment={i} currency={currency} />
              </TD>
              {onPay && (
                <TD className="text-right">
                  {i.id === nextUnpaidId && (
                    <Button size="sm" onClick={() => onPay(i)}>
                      <HandCoins /> Cobrar
                    </Button>
                  )}
                </TD>
              )}
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
