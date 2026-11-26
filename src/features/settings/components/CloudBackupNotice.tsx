import { CloudAlert } from "lucide-react";
import { Link } from "react-router";
import { Alert } from "@/components/ui/alert";
import { routes } from "@/lib/routes";
import { useCloudBackupStatus } from "../cloud-backup-hooks";

const dateTime = new Intl.DateTimeFormat("es-UY", { dateStyle: "short", timeStyle: "short" });

export function CloudBackupNotice() {
  const { data, dataUpdatedAt } = useCloudBackupStatus();
  if (!data || data.inProgress || (data.configured && !data.enabled)) return null;
  if (!data.configured && !data.lastError) return null;

  const nextBackup = data.nextBackupAt ? Date.parse(data.nextBackupAt) : null;
  const overdue = nextBackup !== null && dataUpdatedAt - nextBackup > 5 * 60_000;
  if (!data.lastError && data.lastSuccessAt && !overdue) return null;

  const lastBackup = data.lastSuccessAt ? new Date(data.lastSuccessAt) : null;
  return (
    <div role="status" className="mb-6">
      <Alert tone="amber" icon={CloudAlert}>
        <p className="font-medium">
          {data.lastError
            ? "El respaldo en la nube necesita atención"
            : "Hay un respaldo en la nube pendiente"}
        </p>
        <p className="mt-1">
          {data.lastError ??
            "Los últimos cambios todavía no tienen una copia confirmada en la nube."}
          {lastBackup &&
            !Number.isNaN(lastBackup.getTime()) &&
            ` Última copia: ${dateTime.format(lastBackup)}.`}
        </p>
        <Link to={routes.settings()} className="mt-2 inline-block font-medium underline">
          Revisar respaldos
        </Link>
      </Alert>
    </div>
  );
}
