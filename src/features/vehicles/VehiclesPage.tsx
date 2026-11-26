import { Car, Plus } from "lucide-react";
import { useDeferredValue, useState } from "react";
import type { Vehicle } from "@/bindings/Vehicle";
import type { VehicleFilter } from "@/bindings/VehicleFilter";
import type { VehicleStatus } from "@/bindings/VehicleStatus";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select } from "@/components/ui/input";
import { EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui/page";
import { SearchInput } from "@/components/ui/search-input";
import { Segmented } from "@/components/ui/segmented";
import { SelectOptions } from "@/components/ui/select-options";
import { metaOptions, VEHICLE_STATUS_META, type Option } from "@/lib/labels";
import { useEntityDialog } from "@/lib/use-entity-dialog";
import { VehicleFormDialog } from "./components/VehicleFormDialog";
import { VehicleGrid } from "./components/VehicleGrid";
import { VehiclesTable } from "./components/VehiclesTable";
import { useDeleteVehicle, useVehicles } from "./hooks";
import { useVehicleFilters } from "./use-vehicle-filters";

const statusOptions = metaOptions(VEHICLE_STATUS_META);

const VIEW_MODE = { GRID: "grid", TABLE: "table" } as const;
type ViewMode = (typeof VIEW_MODE)[keyof typeof VIEW_MODE];
const VIEW_OPTIONS: Option<ViewMode>[] = [
  { value: VIEW_MODE.GRID, label: "Tarjetas" },
  { value: VIEW_MODE.TABLE, label: "Tabla" },
];

export function VehiclesPage() {
  const { search, setSearch, status, setStatus } = useVehicleFilters();
  const filter: VehicleFilter = { search: useDeferredValue(search) || null, status };
  const vehicles = useVehicles(filter);
  const [view, setView] = useState<ViewMode>(VIEW_MODE.GRID);

  const form = useEntityDialog<Vehicle>();
  const [deleting, setDeleting] = useState<Vehicle | null>(null);
  const remove = useDeleteVehicle(() => setDeleting(null));

  return (
    <>
      <PageHeader
        title="Vehículos"
        description="Stock de autos de la concesionaria"
        actions={
          <Button onClick={() => form.open()}>
            <Plus /> Nuevo vehículo
          </Button>
        }
      />

      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <SearchInput
            className="min-w-64 flex-1"
            placeholder="Buscar por marca, modelo, patente, color o año…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            className="w-44"
            value={status ?? ""}
            onChange={(e) => setStatus((e.target.value || null) as VehicleStatus | null)}
          >
            <SelectOptions options={statusOptions} empty="Todos los estados" />
          </Select>
          <Segmented options={VIEW_OPTIONS} value={view} onChange={setView} />
        </div>

        {vehicles.isPending ? (
          <Loading />
        ) : vehicles.isError ? (
          <div className="p-4">
            <ErrorState error={vehicles.error} />
          </div>
        ) : vehicles.data.length === 0 ? (
          <EmptyState
            icon={Car}
            title="No hay vehículos"
            description={
              search || status ? "Probá con otros filtros." : "Cargá el primer auto del stock."
            }
          />
        ) : view === VIEW_MODE.GRID ? (
          <VehicleGrid vehicles={vehicles.data} onEdit={form.open} onDelete={setDeleting} />
        ) : (
          <VehiclesTable vehicles={vehicles.data} onEdit={form.open} onDelete={setDeleting} />
        )}
      </Card>

      <VehicleFormDialog open={form.isOpen} vehicle={form.entity} onClose={form.close} />
      <ConfirmDialog
        open={deleting != null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        title="Eliminar vehículo"
        confirmLabel="Eliminar"
      >
        ¿Eliminar{" "}
        <strong>
          {deleting?.brand} {deleting?.model}
        </strong>
        ? Esta acción no se puede deshacer.
      </ConfirmDialog>
    </>
  );
}
