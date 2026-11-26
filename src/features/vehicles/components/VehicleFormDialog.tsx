import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import type { Vehicle } from "@/bindings/Vehicle";
import { MoneyField, SelectField, TextareaField, TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { VEHICLE_STATUS } from "@/lib/constants";
import {
  CURRENCY_OPTIONS,
  FUEL_TYPES,
  listOptions,
  metaOptions,
  toOptions,
  TRANSMISSIONS,
  VEHICLE_CONDITION_LABEL,
  VEHICLE_STATUS_META,
} from "@/lib/labels";
import { useSaveVehicle } from "../hooks";
import { CoverImageField } from "./CoverImageField";
import { vehicleSchema, vehicleToForm, vehicleToInput, type VehicleValues } from "../schema";

const conditionOptions = toOptions(VEHICLE_CONDITION_LABEL);
const statusOptions = metaOptions(VEHICLE_STATUS_META).filter(
  (o) => o.value !== VEHICLE_STATUS.SOLD,
);
const fuelOptions = listOptions(FUEL_TYPES);
const transmissionOptions = listOptions(TRANSMISSIONS);

export function VehicleFormDialog({
  open,
  vehicle,
  onClose,
}: {
  open: boolean;
  vehicle: Vehicle | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={vehicle ? "Editar vehículo" : "Nuevo vehículo"}
      description={vehicle ? `${vehicle.brand} ${vehicle.model}` : "Cargá los datos del vehículo"}
    >
      {/* key: reinicia el formulario al cambiar de vehículo */}
      <VehicleForm key={vehicle?.id ?? "new"} vehicle={vehicle} onDone={onClose} />
    </Dialog>
  );
}

function VehicleForm({ vehicle, onDone }: { vehicle: Vehicle | null; onDone: () => void }) {
  const { control, handleSubmit } = useForm<VehicleValues>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: vehicleToForm(vehicle),
  });
  const currency = useWatch({ control, name: "currency" });
  const save = useSaveVehicle(vehicle?.id ?? null, onDone);
  const isSold = vehicle?.status === VEHICLE_STATUS.SOLD;

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(vehicleToInput(v)))} noValidate>
      <div className="grid grid-cols-6 gap-4">
        <div className="col-span-6 border-b border-slate-100 pb-4">
          <CoverImageField control={control} />
        </div>
        <TextField
          control={control}
          name="brand"
          label="Marca"
          required
          autoFocus
          placeholder="Toyota"
          className="col-span-2"
        />
        <TextField
          control={control}
          name="model"
          label="Modelo"
          required
          placeholder="Corolla"
          className="col-span-2"
        />
        <TextField
          control={control}
          name="version"
          label="Versión"
          placeholder="XEi 2.0 CVT"
          className="col-span-2"
        />

        <TextField control={control} name="year" label="Año" required inputMode="numeric" />
        <SelectField
          control={control}
          name="condition"
          label="Condición"
          options={conditionOptions}
        />
        <TextField
          control={control}
          name="km"
          label="Kilómetros"
          inputMode="numeric"
          className="col-span-2"
        />
        <TextField control={control} name="color" label="Color" className="col-span-2" />

        <TextField
          control={control}
          name="plate"
          label="Patente"
          placeholder="SBA1234"
          className="col-span-2 uppercase"
        />
        <SelectField
          control={control}
          name="fuel"
          label="Combustible"
          options={fuelOptions}
          empty="—"
          className="col-span-2"
        />
        <SelectField
          control={control}
          name="transmission"
          label="Transmisión"
          options={transmissionOptions}
          empty="—"
          className="col-span-2"
        />

        <TextField control={control} name="vin" label="N° de chasis (VIN)" className="col-span-3" />
        <TextField
          control={control}
          name="engineNumber"
          label="N° de motor"
          className="col-span-3"
        />

        <SelectField
          control={control}
          name="currency"
          label="Moneda"
          options={CURRENCY_OPTIONS}
          className="col-span-2"
        />
        <MoneyField
          control={control}
          name="salePriceCents"
          label="Precio de venta"
          required
          currency={currency}
          className="col-span-2"
        />
        <MoneyField
          control={control}
          name="purchasePriceCents"
          label="Costo de compra"
          hint="Uso interno"
          currency={currency}
          className="col-span-2"
        />

        {isSold ? (
          <Field label="Estado" className="col-span-2">
            <Input value={VEHICLE_STATUS_META.sold.label} disabled />
          </Field>
        ) : (
          <SelectField
            control={control}
            name="status"
            label="Estado"
            options={statusOptions}
            className="col-span-2"
          />
        )}
        <TextareaField control={control} name="notes" label="Notas" className="col-span-4" />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={save.isPending}>
          Guardar
        </Button>
      </DialogFooter>
    </form>
  );
}
