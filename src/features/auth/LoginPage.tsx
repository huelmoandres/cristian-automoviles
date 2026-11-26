import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { TextField } from "@/components/form/fields";
import { FormError } from "@/components/form/form-error";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BackupActions } from "@/features/settings/components/BackupActions";
import { CloudBackupRecovery } from "@/features/settings/components/CloudBackupRecovery";
import { useSignIn } from "./hooks";
import { emptyCredentials, loginSchema, setupSchema, type CredentialsValues } from "./schema";

/** Login, o creación del usuario la primera vez que se abre la app. */
export function LoginPage({ firstRun }: { firstRun: boolean }) {
  const { control, handleSubmit } = useForm<CredentialsValues>({
    resolver: zodResolver(firstRun ? setupSchema : loginSchema),
    defaultValues: emptyCredentials,
  });
  const signIn = useSignIn(firstRun);

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-8 bg-ink bg-[radial-gradient(ellipse_at_bottom,var(--color-brand-950),transparent_60%)] p-6">
      <Logo className="max-w-72" />
      <Card className="w-full max-w-sm p-8">
        <h1 className="text-center text-lg font-semibold text-slate-900">
          {firstRun ? "Configuración inicial" : "Iniciar sesión"}
        </h1>
        <p className="mb-6 mt-1 text-center text-sm text-slate-500">
          {firstRun
            ? "Creá el usuario y la contraseña para acceder al sistema."
            : "Ingresá tus datos para continuar."}
        </p>
        <form className="space-y-4" onSubmit={handleSubmit((v) => signIn.mutate(v))} noValidate>
          <TextField
            control={control}
            name="username"
            label="Usuario"
            autoFocus
            autoComplete="username"
          />
          <TextField
            control={control}
            name="password"
            label="Contraseña"
            type="password"
            autoComplete={firstRun ? "new-password" : "current-password"}
          />
          {firstRun && (
            <TextField
              control={control}
              name="confirm"
              label="Repetir contraseña"
              type="password"
              autoComplete="new-password"
            />
          )}
          <FormError error={signIn.error} />
          <Button type="submit" className="w-full" size="lg" loading={signIn.isPending}>
            {firstRun ? "Crear usuario e ingresar" : "Ingresar"}
          </Button>
        </form>
        {firstRun && (
          <div className="mt-6 space-y-3 border-t border-slate-200 pt-5">
            <p className="text-center text-sm text-slate-500">
              Si venís de otra computadora, podés recuperar tus datos sin crear un usuario nuevo.
            </p>
            <BackupActions importOnly />
            <CloudBackupRecovery />
          </div>
        )}
      </Card>
    </div>
  );
}
