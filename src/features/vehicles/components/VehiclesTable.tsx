import type { Vehicle } from "@/bindings/Vehicle";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMoney, formatNumber } from "@/lib/format";
import { VEHICLE_STATUS_META } from "@/lib/labels";
import { vehicleSubtitle, vehicleTitle } from "../utils";
import { VehicleActions, type VehicleActionHandlers } from "./VehicleActions";
import { VehiclePhoto } from "./VehiclePhoto";

export function VehiclesTable({
  vehicles,
  ...handlers
}: { vehicles: Vehicle[] } & VehicleActionHandlers) {
  return (
    <Table>
      <THead>
        <tr>
          <TH>Vehículo</TH>
          <TH>Año</TH>
          <TH>Patente</TH>
          <TH className="text-right">Km</TH>
          <TH className="text-right">Precio</TH>
          <TH>Estado</TH>
          <TH />
        </tr>
      </THead>
      <TBody>
        {vehicles.map((v) => (
          <TR key={v.id}>
            <TD>
              <div className="flex items-center gap-3">
                <VehiclePhoto
                  fileName={v.coverThumb}
                  alt={vehicleTitle(v)}
                  className="h-12 w-16 shrink-0 rounded-md"
                />
                <div>
                  <div className="font-medium text-slate-900">{vehicleTitle(v)}</div>
                  <div className="text-xs text-slate-500">{vehicleSubtitle(v)}</div>
                </div>
              </div>
            </TD>
            <TD>{v.year}</TD>
            <TD className="font-mono text-xs">{v.plate ?? "—"}</TD>
            <TD className="text-right">{formatNumber(v.km)}</TD>
            <TD className="text-right font-medium">{formatMoney(v.salePriceCents, v.currency)}</TD>
            <TD>
              <StatusBadge meta={VEHICLE_STATUS_META[v.status]} />
            </TD>
            <TD>
              <VehicleActions vehicle={v} {...handlers} />
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
