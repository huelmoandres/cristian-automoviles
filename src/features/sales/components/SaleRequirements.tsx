import { Car, CheckCircle2, Circle, UserPlus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ClientFormDialog } from "@/features/clients/components/ClientFormDialog";
import { VehicleFormDialog } from "@/features/vehicles/components/VehicleFormDialog";
import { cn } from "@/lib/utils";

function Requirement({
  done,
  title,
  description,
  action,
}: {
  done: boolean;
  title: string;
  description: string;
  action: ReactNode;
}) {
  const Icon = done ? CheckCircle2 : Circle;
  return (
    <div className="flex items-center gap-4 rounded-lg border border-slate-200 p-4">
      <Icon className={cn("size-6 shrink-0", done ? "text-emerald-600" : "text-slate-300")} />
      <div className="flex-1">
        <p className="font-medium text-slate-900">{title}</p>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      {!done && action}
    </div>
  );
}

/** Para vender hace falta al menos un cliente y un vehículo disponible. */
export function SaleRequirements({
  hasClients,
  hasVehicles,
}: {
  hasClients: boolean;
  hasVehicles: boolean;
}) {
  const [clientOpen, setClientOpen] = useState(false);
  const [vehicleOpen, setVehicleOpen] = useState(false);

  return (
    <Card className="max-w-2xl">
      <CardHeader
        title="Antes de registrar una venta"
        description="Completá estos pasos y el formulario se habilita automáticamente."
      />
      <CardContent className="space-y-3">
        <Requirement
          done={hasClients}
          title="Cargar un cliente"
          description="El comprador del vehículo."
          action={
            <Button size="sm" onClick={() => setClientOpen(true)}>
              <UserPlus /> Nuevo cliente
            </Button>
          }
        />
        <Requirement
          done={hasVehicles}
          title="Tener un vehículo disponible"
          description="Un auto del stock que no esté vendido."
          action={
            <Button size="sm" onClick={() => setVehicleOpen(true)}>
              <Car /> Nuevo vehículo
            </Button>
          }
        />
      </CardContent>
      <ClientFormDialog open={clientOpen} client={null} onClose={() => setClientOpen(false)} />
      <VehicleFormDialog open={vehicleOpen} vehicle={null} onClose={() => setVehicleOpen(false)} />
    </Card>
  );
}
