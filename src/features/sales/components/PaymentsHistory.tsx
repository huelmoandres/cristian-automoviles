import { HandCoins, Undo2 } from "lucide-react";
import { useState } from "react";
import type { Payment } from "@/bindings/Payment";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/page";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useDeletePayment } from "@/features/payments/hooks";
import { formatDate, formatMoney } from "@/lib/format";
import { PAYMENT_METHOD_LABEL } from "@/lib/labels";

export function PaymentsHistory({ payments, currency }: { payments: Payment[]; currency: string }) {
  const [undoing, setUndoing] = useState<Payment | null>(null);
  const remove = useDeletePayment(() => setUndoing(null));
  const money = (cents: number) => formatMoney(cents, currency);

  return (
    <Card>
      <CardHeader title="Pagos registrados" description="Cuotas cobradas, con sus recargos" />
      {payments.length === 0 ? (
        <EmptyState icon={HandCoins} title="Todavía no hay pagos de cuotas" />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Fecha</TH>
              <TH>Cuota</TH>
              <TH>Medio</TH>
              <TH className="text-right">Importe</TH>
              <TH className="text-right">Recargo</TH>
              <TH className="text-right">Total</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {payments.map((p) => (
              <TR key={p.id}>
                <TD>{formatDate(p.paidAt)}</TD>
                <TD>N° {p.installmentNumber}</TD>
                <TD>
                  {PAYMENT_METHOD_LABEL[p.method]}
                  {p.notes && <div className="text-xs text-slate-500">{p.notes}</div>}
                </TD>
                <TD className="text-right">{money(p.amountCents)}</TD>
                <TD className="text-right">{p.lateFeeCents > 0 ? money(p.lateFeeCents) : "—"}</TD>
                <TD className="text-right font-medium">{money(p.amountCents + p.lateFeeCents)}</TD>
                <TD className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setUndoing(p)}>
                    <Undo2 /> Anular
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <ConfirmDialog
        open={undoing != null}
        onClose={() => setUndoing(null)}
        onConfirm={() => undoing && remove.mutate(undoing.id)}
        loading={remove.isPending}
        title="Anular pago"
        confirmLabel="Anular pago"
      >
        La cuota N° {undoing?.installmentNumber} volverá a quedar impaga. Usalo solo para corregir
        un pago cargado por error.
      </ConfirmDialog>
    </Card>
  );
}
