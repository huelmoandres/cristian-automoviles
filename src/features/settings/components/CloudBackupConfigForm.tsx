import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { CloudBackupStatus } from "@/bindings/CloudBackupStatus";
import { TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/utils";

const configSchema = z
  .object({
    accountId: z
      .string()
      .trim()
      .regex(/^[a-f\d]{32}$/i, "Ingresá el ID de cuenta de 32 caracteres"),
    bucket: z.string().trim().min(3, "Ingresá el nombre del bucket privado"),
    accessKeyId: z.string().trim().min(1, "Ingresá el Access Key ID"),
    secretAccessKey: z.string().trim().min(1, "Ingresá el Secret Access Key"),
    passphrase: z.string().min(12, "Usá al menos 12 caracteres").max(256),
    passphraseConfirm: z.string(),
    savedRecoveryDetails: z
      .boolean()
      .refine(Boolean, "Confirmá que guardaste los datos de recuperación"),
  })
  .refine((values) => values.passphrase === values.passphraseConfirm, {
    path: ["passphraseConfirm"],
    message: "Las contraseñas no coinciden",
  });

type ConfigValues = z.infer<typeof configSchema>;

type Props = {
  accountId: string | null;
  bucket: string | null;
  recoveryOnly: boolean;
  onConfigured: (status: CloudBackupStatus) => void;
  onCancel?: () => void;
  onBusyChange: (busy: boolean) => void;
};

export function CloudBackupConfigForm({
  accountId,
  bucket,
  recoveryOnly,
  onConfigured,
  onCancel,
  onBusyChange,
}: Props) {
  const checkboxId = useId();
  const [error, setError] = useState<string | null>(null);
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<ConfigValues>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      accountId: accountId ?? "",
      bucket: bucket ?? "",
      accessKeyId: "",
      secretAccessKey: "",
      passphrase: "",
      passphraseConfirm: "",
      savedRecoveryDetails: false,
    },
  });

  async function submit(values: ConfigValues) {
    onBusyChange(true);
    setError(null);
    try {
      const status = await api.configureCloudBackup({
        accountId: values.accountId,
        bucket: values.bucket,
        accessKeyId: values.accessKeyId,
        secretAccessKey: values.secretAccessKey,
        passphrase: values.passphrase,
      });
      reset();
      onConfigured(status);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      onBusyChange(false);
    }
  }

  return (
    <form
      className="space-y-4 rounded-lg border border-slate-200 p-4"
      onSubmit={handleSubmit(submit)}
      noValidate
      autoComplete="off"
    >
      <p className="text-sm text-slate-600">
        {recoveryOnly
          ? "Ingresá los mismos datos de R2 y la contraseña que usaste para crear los respaldos."
          : "Usá un bucket privado de R2 Standard y una credencial con lectura y escritura limitada a ese bucket."}
      </p>
      <fieldset className="grid gap-4 sm:grid-cols-2" disabled={isSubmitting}>
        <TextField
          control={control}
          name="accountId"
          label="ID de cuenta de Cloudflare"
          required
          autoCapitalize="none"
          spellCheck={false}
          maxLength={32}
        />
        <TextField
          control={control}
          name="bucket"
          label="Nombre del bucket"
          required
          autoCapitalize="none"
          spellCheck={false}
        />
        <TextField
          control={control}
          name="accessKeyId"
          label="Access Key ID"
          type="password"
          required
          autoComplete="off"
          spellCheck={false}
        />
        <TextField
          control={control}
          name="secretAccessKey"
          label="Secret Access Key"
          type="password"
          required
          autoComplete="off"
          spellCheck={false}
        />
        <TextField
          control={control}
          name="passphrase"
          label="Contraseña de los respaldos"
          type="password"
          required
          autoComplete={recoveryOnly ? "off" : "new-password"}
          maxLength={256}
          hint="Al menos 12 caracteres. Puede ser distinta de la contraseña de ingreso."
        />
        <TextField
          control={control}
          name="passphraseConfirm"
          label="Repetir contraseña de los respaldos"
          type="password"
          required
          autoComplete="off"
          maxLength={256}
        />
        <div className="space-y-2 sm:col-span-2">
          <label htmlFor={checkboxId} className="flex items-start gap-2 text-sm text-slate-700">
            <input
              id={checkboxId}
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-brand-700"
              aria-invalid={Boolean(errors.savedRecoveryDetails)}
              {...register("savedRecoveryDetails")}
            />
            Guardé fuera de esta PC la contraseña de los respaldos y los datos de acceso a R2 para
            poder recuperarlos si pierdo la computadora.
          </label>
          {errors.savedRecoveryDetails && (
            <p role="alert" className="text-xs text-red-700">
              {errors.savedRecoveryDetails.message}
            </p>
          )}
          <p className="text-xs text-slate-500">
            Sin esa contraseña no se pueden descifrar las copias. Las credenciales se guardan en el
            almacén seguro del sistema y no se incluyen en los respaldos.
          </p>
          {accountId && (
            <p className="text-xs text-amber-800">
              Cambiar la contraseña no cambia la de las copias anteriores. Conservá también la
              contraseña anterior para poder restaurarlas.
            </p>
          )}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={isSubmitting}>
          {recoveryOnly ? "Conectar para recuperar" : "Guardar y activar respaldo diario"}
        </Button>
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
