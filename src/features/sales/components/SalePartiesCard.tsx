import { UserPlus } from "lucide-react";
import { useState } from "react";
import type { Control, UseFormSetValue } from "react-hook-form";
import type { ClientListItem } from "@/bindings/ClientListItem";
import type { Vehicle } from "@/bindings/Vehicle";
import { SelectField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ClientFormDialog } from "@/features/clients/components/ClientFormDialog";
import { formatMoney } from "@/lib/format";
import type { Option } from "@/lib/labels";
import type { SaleValues } from "../schema";

function clientOption(c: ClientListItem): Option {
  return { value: String(c.id), label: `${c.lastName}, ${c.firstName} — ${c.documentNumber}` };
}

function vehicleOption(v: Vehicle): Option {
  const plate = v.plate ? ` (${v.plate})` : "";
  return {
    value: String(v.id),
    label: `${v.brand} ${v.model} ${v.year}${plate} — ${formatMoney(v.salePriceCents, v.currency)}`,
  };
}

export function SalePartiesCard({
  control,
  setValue,
  clients,
  vehicles,
}: {
  control: Control<SaleValues>;
  setValue: UseFormSetValue<SaleValues>;
  clients: ClientListItem[];
  vehicles: Vehicle[];
}) {
  const [clientFormOpen, setClientFormOpen] = useState(false);

  return (
    <Card>
      <CardHeader
        title="Cliente y vehículo"
        actions={
          <Button size="sm" variant="outline" onClick={() => setClientFormOpen(true)}>
            <UserPlus /> Nuevo cliente
          </Button>
        }
      />
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <SelectField
          control={control}
          name="clientId"
          label="Cliente"
          required
          empty="Elegí un cliente…"
          options={clients.map(clientOption)}
        />
        <SelectField
          control={control}
          name="vehicleId"
          label="Vehículo"
          required
          empty={vehicles.length ? "Elegí un vehículo…" : "No hay vehículos disponibles"}
          options={vehicles.map(vehicleOption)}
        />
      </CardContent>
      <ClientFormDialog
        open={clientFormOpen}
        client={null}
        onClose={() => setClientFormOpen(false)}
        onSaved={(c) => setValue("clientId", String(c.id), { shouldValidate: true })}
      />
    </Card>
  );
}
