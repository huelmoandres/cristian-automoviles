import { ErrorState, Loading, PageHeader } from "@/components/ui/page";
import { BusinessCard } from "./components/BusinessCard";
import { BackupCard } from "./components/BackupCard";
import { ChangePasswordCard } from "./components/ChangePasswordCard";
import { UpdatesCard } from "./components/UpdatesCard";
import { useSettings } from "./hooks";

export function SettingsPage() {
  const settings = useSettings();

  return (
    <>
      <PageHeader title="Configuración" description="Datos del negocio, acceso y mantenimiento" />
      <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
        {settings.isPending ? (
          <Loading />
        ) : settings.isError ? (
          <ErrorState error={settings.error} />
        ) : (
          <BusinessCard settings={settings.data} />
        )}
        <ChangePasswordCard />
        <BackupCard />
        <UpdatesCard />
      </div>
    </>
  );
}
