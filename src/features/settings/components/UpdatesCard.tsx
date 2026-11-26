import { useQuery } from "@tanstack/react-query";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { Download, Info, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { errorMessage } from "@/lib/utils";

type Stage = "idle" | "checking" | "installing" | "restart";

export function UpdatesCard() {
  const status = useQuery({
    queryKey: queryKeys.updater,
    queryFn: api.updaterStatus,
    staleTime: Infinity,
    retry: false,
  });
  const [stage, setStage] = useState<Stage>("idle");
  const [available, setAvailable] = useState<Update | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ downloaded: 0, total: 0 });
  const updateRef = useRef<Update | null>(null);
  const installingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (!installingRef.current) void updateRef.current?.close().catch(() => undefined);
    };
  }, []);

  async function checkUpdates() {
    setStage("checking");
    setError(null);
    setMessage(null);
    setAvailable(null);
    try {
      await updateRef.current?.close();
      updateRef.current = null;
      const update = await check({ timeout: 15_000 });
      if (!mountedRef.current) {
        await update?.close();
        return;
      }
      updateRef.current = update;
      setAvailable(update);
      if (!update) setMessage("Ya tenés la última versión disponible.");
    } catch (cause) {
      setError(
        `No se pudieron buscar actualizaciones. Revisá la conexión e intentá nuevamente. ${errorMessage(cause)}`,
      );
    } finally {
      setStage("idle");
    }
  }

  async function restart() {
    try {
      await relaunch();
    } catch {
      setError("La actualización está instalada. Cerrá y volvé a abrir la app para usarla.");
    }
  }

  async function installUpdate() {
    const update = updateRef.current;
    if (!update) return;
    installingRef.current = true;
    setStage("installing");
    setError(null);
    setProgress({ downloaded: 0, total: 0 });
    try {
      await update.downloadAndInstall(
        (event) => {
          if (event.event === "Started") {
            setProgress({ downloaded: 0, total: event.data.contentLength ?? 0 });
          } else if (event.event === "Progress") {
            setProgress((current) => ({
              ...current,
              downloaded: current.downloaded + event.data.chunkLength,
            }));
          }
        },
        { timeout: 60_000 },
      );
      setStage("restart");
      setConfirming(false);
      setMessage(`Se instaló la versión ${update.version}. Reiniciá la app para continuar.`);
      setAvailable(null);
      updateRef.current = null;
      await update.close().catch(() => undefined);
      await restart();
    } catch (cause) {
      setStage("idle");
      setError(`No se pudo instalar la actualización. ${errorMessage(cause)}`);
    } finally {
      installingRef.current = false;
    }
  }

  const percent =
    progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null;

  return (
    <Card>
      <CardHeader
        title="Actualizaciones"
        description={`Versión instalada: ${status.data?.version ?? "…"}`}
      />
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-600">
          Buscá nuevas versiones e instalalas desde esta computadora. Tus datos se conservan al
          actualizar la app.
        </p>
        {status.data && !status.data.configured && (
          <Alert tone="amber" icon={Info}>
            Las actualizaciones todavía no están habilitadas en esta versión. El proveedor debe
            configurar el servicio y entregar un primer instalador compatible.
          </Alert>
        )}
        {status.isError && (
          <p role="alert" className="text-sm text-red-700">
            {errorMessage(status.error)}
          </p>
        )}
        {message && (
          <p role="status" className="text-sm text-emerald-700">
            {message}
          </p>
        )}
        {error && !confirming && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        {available && (
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <p className="text-sm font-medium">Versión {available.version} disponible</p>
            {available.body && (
              <p className="max-h-40 overflow-auto whitespace-pre-wrap text-sm text-slate-600">
                {available.body}
              </p>
            )}
            <Button onClick={() => setConfirming(true)} disabled={stage !== "idle"}>
              <Download /> Descargar e instalar
            </Button>
          </div>
        )}
        {stage === "restart" ? (
          <Button onClick={() => void restart()}>Reiniciar app</Button>
        ) : (
          <Button
            variant="outline"
            loading={stage === "checking" || status.isPending}
            disabled={!status.data?.configured || stage !== "idle"}
            onClick={() => void checkUpdates()}
          >
            <RefreshCw /> Buscar actualizaciones
          </Button>
        )}
      </CardContent>
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        preventClose={stage === "installing"}
        title={`Instalar versión ${available?.version ?? "nueva"}`}
        size="sm"
      >
        <p className="text-sm text-slate-600">
          La app se cerrará y se volverá a abrir para completar la actualización. Terminá de guardar
          cualquier operación antes de continuar.
        </p>
        {stage === "installing" && (
          <div className="mt-4 space-y-2" role="status" aria-live="polite">
            <progress
              className="h-2 w-full accent-brand-600"
              max={100}
              value={percent ?? undefined}
              aria-label="Descarga de actualización"
            />
            <p className="text-sm text-slate-600">
              {percent === 100
                ? "Instalando actualización…"
                : percent !== null
                  ? `Descargando… ${percent}%`
                  : `Descargando… ${(progress.downloaded / 1_048_576).toFixed(1)} MB`}
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setConfirming(false)}
            disabled={stage === "installing"}
          >
            Cancelar
          </Button>
          <Button onClick={() => void installUpdate()} loading={stage === "installing"}>
            Instalar actualización
          </Button>
        </DialogFooter>
      </Dialog>
    </Card>
  );
}
