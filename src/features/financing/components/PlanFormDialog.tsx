import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { FinancingPlan } from "@/bindings/FinancingPlan";
import { CheckboxField, PercentField, TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { useSavePlan } from "../hooks";
import { planSchema, planToForm, planToInput, type PlanValues } from "../schema";

export function PlanFormDialog({
  open,
  plan,
  onClose,
}: {
  open: boolean;
  plan: FinancingPlan | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={plan ? "Editar plan" : "Nuevo plan de financiación"}
      description="El recargo se aplica sobre el saldo a financiar (precio − entrega)."
    >
      <PlanForm key={plan?.id ?? "new"} plan={plan} onDone={onClose} />
    </Dialog>
  );
}

function PlanForm({ plan, onDone }: { plan: FinancingPlan | null; onDone: () => void }) {
  const { control, handleSubmit } = useForm<PlanValues>({
    resolver: zodResolver(planSchema),
    defaultValues: planToForm(plan),
  });
  const save = useSavePlan(plan?.id ?? null, onDone);

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(planToInput(v)))} noValidate>
      <div className="grid grid-cols-2 gap-4">
        <TextField
          control={control}
          name="installments"
          label="Meses (cuotas)"
          required
          autoFocus
          inputMode="numeric"
        />
        <PercentField control={control} name="surchargeBp" label="Recargo total" required />
        <TextField
          control={control}
          name="name"
          label="Nombre"
          hint="Opcional: si queda vacío se llama “N cuotas”"
          className="col-span-2"
        />
        <div className="col-span-2">
          <CheckboxField control={control} name="active" label="Disponible para nuevas ventas" />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={save.isPending}>
          Guardar
        </Button>
      </DialogFooter>
    </form>
  );
}
