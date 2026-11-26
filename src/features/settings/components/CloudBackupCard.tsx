import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Cloud, History, Info, ShieldCheck, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import type { AuthStatus } from "@/bindings/AuthStatus";
import type { CloudBackupEntry } from "@/bindings/CloudBackupEntry";
import type { CloudBackupStatus } from "@/bindings/CloudBackupStatus";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { routes } from "@/lib/routes";
import { errorMessage } from "@/lib/utils";
import {
  cloudBackupKeys,
  useCloudBackupHistory,
  useCloudBackupStatus,
} from "../cloud-backup-hooks";
import { CloudBackupConfigForm } from "./CloudBackupConfigForm";

const dateTime = new Intl.DateTimeFormat("es-UY", { dateStyle: "short", timeStyle: "short" });
const sizes = new Intl.NumberFormat("es-UY", { maximumFractionDigits: 1 });

function formatDateTime(value: string | null) {
  if (!value) return "Todavía no hay una copia confirmada";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Fecha no disponible" : dateTime.format(date);
}

function formatSize(bytes: number) {
  return bytes >= 1_000_000_000
    ? `${sizes.format(bytes / 1_000_000_000)} GB`
    : `${sizes.format(bytes / 1_000_000)} MB`;
}

type PanelProps = { recoveryOnly?: boolean; onBusyChange?: (busy: boolean) => void };

export function CloudBackupPanel({ recoveryOnly = false, onBusyChange }: PanelProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [selected, setSelected] = useState<CloudBackupEntry | null>(null);
  const restore = useMutation({
    mutationFn: api.restoreCloudBackup,
    onSuccess: async () => {
      await queryClient.cancelQueries();
    },
  });
  const status = useCloudBackupStatus(!restore.isSuccess);
  const history = useCloudBackupHistory();
  const run = useMutation({
    mutationFn: api.runCloudBackup,
    onSuccess: (updated) => {
      queryClient.setQueryData(cloudBackupKeys.status, updated);
      toast.success("Respaldo confirmado en Cloudflare R2");
      if (history.data) void history.refetch();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: cloudBackupKeys.status }),
  });
  const disable = useMutation({
    mutationFn: api.disableCloudBackup,
    onSuccess: (updated) => {
      queryClient.setQueryData(cloudBackupKeys.status, updated);
      setConfirmDisable(false);
      toast.success("Respaldos automáticos desactivados. Las copias en R2 se conservan.");
    },
  });
  const data = status.data;
  const busy =
    configuring ||
    Boolean(data?.inProgress) ||
    run.isPending ||
    disable.isPending ||
    restore.isPending ||
    restore.isSuccess ||
    history.isFetching;

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  function configured(updated: CloudBackupStatus) {
    queryClient.setQueryData(cloudBackupKeys.status, updated);
    void queryClient.resetQueries({ queryKey: cloudBackupKeys.history, exact: true });
    setEditing(false);
    toast.success(
      recoveryOnly
        ? "Conexión a R2 guardada. Buscá la copia que querés recuperar."
        : "Respaldo diario activado",
    );
  }

  async function finishRestore() {
    await queryClient.cancelQueries();
    queryClient.setQueryData<AuthStatus>(queryKeys.auth, { hasUser: true, username: null });
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== queryKeys.auth[0] });
    navigate(routes.home(), { replace: true });
    toast.success("Respaldo recuperado. Ingresá con el usuario y la contraseña del respaldo.", {
      duration: 12_000,
    });
  }

  if (status.isPending)
    return (
      <p role="status" className="text-sm text-slate-500">
        Consultando la configuración de respaldos…
      </p>
    );
  if (status.isError && !data)
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-red-700">
          {errorMessage(status.error)}
        </p>
        <Button variant="outline" onClick={() => void status.refetch()}>
          Volver a intentar
        </Button>
      </div>
    );
  if (!data) return null;

  return (
    <div className="space-y-4">
      {!recoveryOnly && (
        <>
          <p className="text-sm text-slate-600">
            Se sube una copia completa y cifrada de la base, las fotos y las miniaturas cada 24
            horas. Se conservan las últimas 30 copias.
          </p>
          <p className="text-sm text-slate-600">
            La app debe estar abierta y tener internet. Si la PC estuvo apagada o la app cerrada, el
            respaldo pendiente se intenta al volver a abrirla.
          </p>
          <Alert tone="amber" icon={Info}>
            Ante una pérdida de la PC, se recupera hasta la última copia confirmada. Pueden perderse
            los cambios de las últimas 24 horas, o de más tiempo si hubo errores o falta de
            conexión.
          </Alert>
        </>
      )}
      {data.configured && (
        <div className="space-y-3 rounded-lg bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-900">
              {data.enabled ? "Respaldo diario activado" : "Respaldo diario desactivado"}
            </p>
            <p className="break-all text-xs text-slate-500">Bucket: {data.bucket}</p>
          </div>
          {!recoveryOnly && (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Última copia confirmada desde esta PC</dt>
                <dd className="mt-1 font-medium text-slate-800">
                  {formatDateTime(data.lastSuccessAt)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Próximo respaldo</dt>
                <dd className="mt-1 font-medium text-slate-800">
                  {data.enabled
                    ? data.nextBackupAt
                      ? formatDateTime(data.nextBackupAt)
                      : "Pendiente; se intentará en breve"
                    : "Desactivado"}
                </dd>
              </div>
            </dl>
          )}
          {data.inProgress && (
            <p role="status" className="text-sm text-slate-600">
              Hay una operación de respaldo en curso…
            </p>
          )}
        </div>
      )}
      {data.lastError && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {data.lastError}
        </p>
      )}
      {status.isError && data && (
        <p role="alert" className="text-sm text-red-700">
          No se pudo actualizar el estado: {errorMessage(status.error)}
        </p>
      )}
      {editing || !data.configured ? (
        <CloudBackupConfigForm
          accountId={data.accountId}
          bucket={data.bucket}
          recoveryOnly={recoveryOnly}
          onConfigured={configured}
          onBusyChange={setConfiguring}
          onCancel={data.configured ? () => setEditing(false) : undefined}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {!recoveryOnly && (
            <Button
              onClick={() => run.mutate()}
              loading={run.isPending}
              disabled={busy || !data.enabled}
            >
              <Cloud /> Respaldar ahora
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => void history.refetch()}
            loading={history.isFetching}
            disabled={busy}
          >
            <History /> {history.data ? "Actualizar historial" : "Buscar respaldos en R2"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              run.reset();
              setEditing(true);
            }}
            disabled={busy}
          >
            {recoveryOnly
              ? "Cambiar datos de acceso"
              : data.enabled
                ? "Cambiar configuración"
                : "Configurar y activar"}
          </Button>
          {!recoveryOnly && data.enabled && (
            <Button
              variant="ghost"
              onClick={() => {
                disable.reset();
                setConfirmDisable(true);
              }}
              disabled={busy}
            >
              Desactivar
            </Button>
          )}
        </div>
      )}
      {run.isError && (
        <p role="alert" className="text-sm text-red-700">
          {errorMessage(run.error)}
        </p>
      )}
      {history.isError && (
        <p role="alert" className="text-sm text-red-700">
          {errorMessage(history.error)}
        </p>
      )}
      {history.data && !editing && (
        <div className="space-y-3 border-t border-slate-200 pt-4">
          <h4 className="text-sm font-semibold text-slate-900">
            Copias disponibles en Cloudflare R2
          </h4>
          {history.data.length === 0 ? (
            <p className="text-sm text-slate-500">
              No se encontraron respaldos de esta aplicación en el bucket.
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200">
              {history.data.map((entry) => (
                <li
                  key={entry.key}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {formatDateTime(entry.createdAt)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatSize(entry.sizeBytes)} · Copia cifrada
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      restore.reset();
                      setSelected(entry);
                    }}
                  >
                    <Upload /> Recuperar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmDisable}
        onClose={() => {
          if (!disable.isPending) setConfirmDisable(false);
        }}
        onConfirm={() => disable.mutate()}
        title="Desactivar respaldo diario"
        confirmLabel="Desactivar respaldo diario"
        loading={disable.isPending}
      >
        <p>
          La app dejará de crear respaldos automáticos. Las copias que ya están en Cloudflare R2 se
          conservan.
        </p>
        {disable.isError && (
          <p role="alert" className="mt-3 text-red-700">
            {errorMessage(disable.error)}
          </p>
        )}
      </ConfirmDialog>
      <Dialog
        open={selected !== null}
        onClose={() => {
          if (!restore.isPending && !restore.isSuccess) setSelected(null);
        }}
        title={restore.isSuccess ? "Respaldo recuperado" : "Recuperar respaldo de la nube"}
        size="sm"
        preventClose={restore.isPending || restore.isSuccess}
      >
        {restore.isSuccess ? (
          <div className="space-y-4 text-sm text-slate-600">
            <Alert tone="green" icon={ShieldCheck}>
              Se recuperaron los datos y las fotos. La sesión se cerró; ingresá con el usuario y la
              contraseña del respaldo.
            </Alert>
            {restore.data && (
              <div>
                <p className="mb-2">Copia de los datos anteriores de esta PC:</p>
                <p className="break-all rounded-lg bg-slate-50 p-3 text-xs">{restore.data}</p>
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => void finishRestore()}>Ir a iniciar sesión</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-3 text-sm text-slate-600">
              <p>
                Se reemplazarán todos los datos, las fotos y el usuario de esta instalación por los
                de la copia del {selected ? formatDateTime(selected.createdAt) : ""}. Esta operación
                no combina registros.
              </p>
              {!recoveryOnly && (
                <p>
                  Antes de reemplazarlos, se guardará una copia de los datos actuales de esta PC.
                </p>
              )}
              <p>
                Al terminar se cerrará la sesión. Ingresá con el usuario y la contraseña guardados
                en el respaldo.
              </p>
              {restore.isPending && (
                <p role="status">Descargando, descifrando y validando el respaldo…</p>
              )}
              {restore.isError && (
                <p role="alert" className="text-red-700">
                  {errorMessage(restore.error)}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                disabled={restore.isPending}
                onClick={() => setSelected(null)}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                loading={restore.isPending}
                onClick={() => {
                  if (selected) restore.mutate(selected.key);
                }}
              >
                Recuperar y reemplazar datos
              </Button>
            </DialogFooter>
          </>
        )}
      </Dialog>
    </div>
  );
}

export function CloudBackupCard() {
  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title="Respaldos en la nube"
        description="Cloudflare R2 · Copias diarias cifradas"
      />
      <CardContent>
        <CloudBackupPanel />
      </CardContent>
    </Card>
  );
}
