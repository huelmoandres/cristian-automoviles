import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { FinancingPlan } from "@/bindings/FinancingPlan";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState, Loading } from "@/components/ui/page";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatPercent } from "@/lib/format";
import { useEntityDialog } from "@/lib/use-entity-dialog";
import { useDeletePlan, usePlans } from "../hooks";
import { PlanFormDialog } from "./PlanFormDialog";

export function PlansCard() {
  const plans = usePlans(true);
  const form = useEntityDialog<FinancingPlan>();
  const [deleting, setDeleting] = useState<FinancingPlan | null>(null);
  const remove = useDeletePlan(() => setDeleting(null));

  return (
    <Card>
      <CardHeader
        title="Planes de financiación"
        description="Recargo total según la cantidad de meses. Se aplica sobre el saldo a financiar."
        actions={
          <Button size="sm" onClick={() => form.open()}>
            <Plus /> Nuevo plan
          </Button>
        }
      />
      {plans.isPending ? (
        <Loading />
      ) : plans.isError ? (
        <div className="p-4">
          <ErrorState error={plans.error} />
        </div>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Plan</TH>
              <TH className="text-right">Meses</TH>
              <TH className="text-right">Recargo</TH>
              <TH>Estado</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {plans.data.map((p) => (
              <TR key={p.id}>
                <TD className="font-medium">{p.name}</TD>
                <TD className="text-right">{p.installments}</TD>
                <TD className="text-right">{formatPercent(p.surchargeBp)}</TD>
                <TD>{p.active ? <Badge tone="green">Activo</Badge> : <Badge>Inactivo</Badge>}</TD>
                <TD>
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" title="Editar" onClick={() => form.open(p)}>
                      <Pencil />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Eliminar"
                      onClick={() => setDeleting(p)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <PlanFormDialog open={form.isOpen} plan={form.entity} onClose={form.close} />
      <ConfirmDialog
        open={deleting != null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        title="Eliminar plan"
        confirmLabel="Eliminar"
      >
        ¿Eliminar el plan <strong>{deleting?.name}</strong>? Si ya se usó en ventas, conviene
        desactivarlo.
      </ConfirmDialog>
    </Card>
  );
}
