import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useChangePassword } from "@/features/auth/hooks";
import {
  changePasswordSchema,
  emptyChangePassword,
  type ChangePasswordValues,
} from "@/features/auth/schema";

export function ChangePasswordCard() {
  const { control, handleSubmit, reset } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: emptyChangePassword,
  });
  const change = useChangePassword(() => reset());

  return (
    <Card>
      <CardHeader title="Cambiar contraseña" />
      <CardContent>
        <form onSubmit={handleSubmit((v) => change.mutate(v))} className="space-y-4" noValidate>
          <TextField
            control={control}
            name="current"
            label="Contraseña actual"
            type="password"
            autoComplete="current-password"
          />
          <TextField
            control={control}
            name="password"
            label="Nueva contraseña"
            type="password"
            autoComplete="new-password"
          />
          <TextField
            control={control}
            name="confirm"
            label="Repetir nueva contraseña"
            type="password"
            autoComplete="new-password"
          />
          <div className="flex justify-end">
            <Button type="submit" loading={change.isPending}>
              Actualizar contraseña
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
