import { Pencil, ShoppingCart, Trash2 } from "lucide-react";
import { useNavigate } from "react-router";
import type { Vehicle } from "@/bindings/Vehicle";
import { Button } from "@/components/ui/button";
import { VEHICLE_STATUS } from "@/lib/constants";
import { routes } from "@/lib/routes";

export type VehicleActionHandlers = {
  onEdit: (vehicle: Vehicle) => void;
  onDelete: (vehicle: Vehicle) => void;
};

/** Vender / editar / eliminar: compartido entre la tabla y las tarjetas. */
export function VehicleActions({
  vehicle,
  onEdit,
  onDelete,
}: { vehicle: Vehicle } & VehicleActionHandlers) {
  const navigate = useNavigate();
  const sellable = vehicle.status !== VEHICLE_STATUS.SOLD;

  return (
    <div className="flex items-center justify-end gap-1">
      {sellable && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate(routes.newSale({ vehicleId: vehicle.id }))}
        >
          <ShoppingCart /> Vender
        </Button>
      )}
      <Button size="icon" variant="ghost" title="Editar" onClick={() => onEdit(vehicle)}>
        <Pencil />
      </Button>
      {sellable && (
        <Button size="icon" variant="ghost" title="Eliminar" onClick={() => onDelete(vehicle)}>
          <Trash2 />
        </Button>
      )}
    </div>
  );
}
