import type { Vehicle } from "@/bindings/Vehicle";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatMoney } from "@/lib/format";
import { VEHICLE_STATUS_META } from "@/lib/labels";
import { vehicleSpecs, vehicleSubtitle, vehicleTitle } from "../utils";
import { VehicleActions, type VehicleActionHandlers } from "./VehicleActions";
import { VehiclePhoto } from "./VehiclePhoto";

function VehicleCard({ vehicle: v, ...handlers }: { vehicle: Vehicle } & VehicleActionHandlers) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="relative">
        <VehiclePhoto
          fileName={v.coverImage}
          alt={vehicleTitle(v)}
          className="aspect-[4/3] w-full"
        />
        <div className="absolute left-3 top-3">
          <StatusBadge meta={VEHICLE_STATUS_META[v.status]} />
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="font-semibold text-slate-900">{vehicleTitle(v)}</p>
        <p className="text-sm text-slate-500">{vehicleSubtitle(v)}</p>
        <p className="mt-1 text-sm text-slate-500">
          {vehicleSpecs(v)}
          {v.plate && <span className="ml-2 font-mono text-xs">{v.plate}</span>}
        </p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-4">
          <p className="text-lg font-semibold text-slate-900">
            {formatMoney(v.salePriceCents, v.currency)}
          </p>
          <VehicleActions vehicle={v} {...handlers} />
        </div>
      </div>
    </Card>
  );
}

export function VehicleGrid({
  vehicles,
  ...handlers
}: { vehicles: Vehicle[] } & VehicleActionHandlers) {
  return (
    <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {vehicles.map((v) => (
        <VehicleCard key={v.id} vehicle={v} {...handlers} />
      ))}
    </div>
  );
}
