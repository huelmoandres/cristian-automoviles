import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { Settings } from "@/bindings/Settings";
import { TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useUpdateSettings } from "../hooks";
import { businessSchema, businessToForm, businessToSettings, type BusinessValues } from "../schema";

export function BusinessCard({ settings }: { settings: Settings }) {
  const { control, handleSubmit, formState, reset } = useForm<BusinessValues>({
    resolver: zodResolver(businessSchema),
    defaultValues: businessToForm(settings),
  });
  const update = useUpdateSettings();

  return (
    <Card>
      <CardHeader title="Negocio" />
      <CardContent>
        <form
          onSubmit={handleSubmit((v) =>
            update.mutate(businessToSettings(v, settings), {
              onSuccess: (saved) => reset(businessToForm(saved)),
            }),
          )}
          className="space-y-4"
          noValidate
        >
          <TextField control={control} name="businessName" label="Nombre del negocio" required />
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
