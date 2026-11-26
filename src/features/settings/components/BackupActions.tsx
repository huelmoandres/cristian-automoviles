import { useMutation, useQueryClient } from "@tanstack/react-query";
import { open, save } from "@tauri-apps/plugin-dialog";
import { format } from "date-fns";
import { Download, Upload } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import type { AuthStatus } from "@/bindings/AuthStatus";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { routes } from "@/lib/routes";
import { errorMessage } from "@/lib/utils";

const backupFilters = [{ name: "Respaldo de Cristian Automóviles", extensions: ["zip"] }];

export function BackupActions({ importOnly = false }: { importOnly?: boolean }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const restore = useMutation({
    mutationFn: api.importBackup,
    onSuccess: async (recoveryPath) => {
      await queryClient.cancelQueries();
      queryClient.setQueryData<AuthStatus>(queryKeys.auth, { hasUser: true, username: null });
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== queryKeys.auth[0] });
      navigate(routes.home(), { replace: true });
      toast.success("Respaldo importado. Ingresá con el usuario y la contraseña del respaldo.", {
        duration: 12_000,
        description: recoveryPath ? `Copia de los datos anteriores: ${recoveryPath}` : undefined,
      });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const busy = selecting || exporting || restore.isPending;

  async function exportBackup() {
    setExporting(true);
    try {
      const destinationPath = await save({
        title: "Guardar respaldo",
        defaultPath: `cristian-respaldo-${format(new Date(), "yyyy-MM-dd-HHmmss")}.zip`,
        filters: backupFilters,
      });
      if (!destinationPath) return;
      await api.exportBackup(destinationPath);
      toast.success("Respaldo guardado", { description: destinationPath });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setExporting(false);
    }
  }

  async function chooseBackup() {
    setSelecting(true);
    try {
      const selected = await open({
        title: "Importar respaldo",
        multiple: false,
        directory: false,
        filters: backupFilters,
      });
      if (typeof selected === "string") {
        restore.reset();
        setSourcePath(selected);
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSelecting(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {!importOnly && (
          <Button onClick={() => void exportBackup()} loading={exporting} disabled={busy}>
            <Download /> Crear respaldo
          </Button>
        )}
        <Button
          variant="outline"
          className={importOnly ? "w-full" : undefined}
          onClick={() => void chooseBackup()}
          disabled={busy}
          loading={selecting || restore.isPending}
        >
          <Upload /> Importar respaldo
        </Button>
      </div>
      <ConfirmDialog
        open={sourcePath !== null}
        onClose={() => {
          if (!restore.isPending) setSourcePath(null);
        }}
        onConfirm={() => {
          if (sourcePath) restore.mutate(sourcePath);
        }}
        title="Importar respaldo"
        confirmLabel="Importar y reemplazar datos"
        loading={restore.isPending}
      >
        <div className="space-y-3">
          <p>
            Se reemplazarán todos los datos, las fotos y el usuario de esta instalación por los del
            respaldo. Esta operación no combina los registros de ambas computadoras.
          </p>
          {!importOnly && (
            <p>Antes de reemplazarlos, se guardará una copia de los datos actuales.</p>
          )}
          <p>Al terminar, ingresá con el usuario y la contraseña del respaldo.</p>
          <p className="break-all rounded-lg bg-slate-50 p-3 text-xs">{sourcePath}</p>
          {restore.isPending && <p role="status">Validando e importando el respaldo…</p>}
          {restore.isError && (
            <p role="alert" className="text-red-700">
              {errorMessage(restore.error)}
            </p>
          )}
        </div>
      </ConfirmDialog>
    </>
  );
}
