import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import type { Settings } from "@/bindings/Settings";
import { PercentField, TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useUpdateSettings } from "@/features/settings/hooks";
import { formatPercent, plural } from "@/lib/format";
import { lateFeeSchema, lateFeeToForm, lateFeeToSettings, type LateFeeValues } from "../schema";

/** Recargo por pago fuera de término (mora). */
export function LateFeeCard({ settings }: { settings: Settings }) {
  const { control, handleSubmit, formState, reset } = useForm<LateFeeValues>({
    resolver: zodResolver(lateFeeSchema),
    defaultValues: lateFeeToForm(settings),
  });
  const [lateFeeBp, graceDays] = useWatch({ control, name: ["lateFeeBp", "graceDays"] });
  const update = useUpdateSettings();
  const grace = Number(graceDays) || 0;

  return (
    <Card>
      <CardHeader
        title="Recargo por mora"
        description="Se aplica a las ventas nuevas; las existentes conservan sus condiciones."
      />
      <CardContent>
        <form
          onSubmit={handleSubmit((v) =>
            update.mutate(lateFeeToSettings(v, settings), {
              onSuccess: (saved) => reset(lateFeeToForm(saved)),
            }),
          )}
          className="space-y-4"
          noValidate
        >
          <div className="grid grid-cols-2 gap-4">
            <PercentField control={control} name="lateFeeBp" label="Recargo" required />
            <TextField
              control={control}
              name="graceDays"
              label="Días de gracia"
              inputMode="numeric"
            />
          </div>
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            Una cuota que se paga{" "}
            {grace > 0
              ? `más de ${plural(grace, "día", "días")} después del vencimiento`
              : "después del vencimiento"}{" "}
            lleva un recargo único del <strong>{formatPercent(lateFeeBp ?? 0)}</strong> de la cuota.
          </p>
          <div className="flex justify-end">
            <Button type="submit" loading={update.isPending} disabled={!formState.isDirty}>
              Guardar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
