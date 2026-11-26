import { z } from "zod";
import type { Vehicle } from "@/bindings/Vehicle";
import type { VehicleInput } from "@/bindings/VehicleInput";
import {
  CURRENCY,
  DEFAULT_CURRENCY,
  LIMITS,
  VEHICLE_CONDITION,
  VEHICLE_STATUS,
} from "@/lib/constants";
import { digitsToNumber, emptyToNull, zv } from "@/lib/validation";

const maxYear = new Date().getFullYear() + 1;

export const vehicleSchema = z.object({
  brand: zv.text("Ingresá la marca"),
  model: zv.text("Ingresá el modelo"),
  version: zv.optionalText(),
  year: z
    .string()
    .regex(/^\d{4}$/, "Año inválido")
    .refine((y) => Number(y) >= LIMITS.MIN_YEAR && Number(y) <= maxYear, "Año inválido"),
  plate: zv.optionalText(),
  vin: zv.optionalText(),
  engineNumber: zv.optionalText(),
  color: zv.optionalText(),
  km: zv.digits(),
  fuel: zv.optionalText(),
  transmission: zv.optionalText(),
  condition: z.enum([VEHICLE_CONDITION.NEW, VEHICLE_CONDITION.USED]),
  purchasePriceCents: zv.optionalMoney(),
  salePriceCents: zv.money("Ingresá el precio de venta"),
  currency: z.enum(CURRENCY),
  /** `sold` no se elige a mano: se asigna al registrar la venta. */
  status: z.enum([VEHICLE_STATUS.AVAILABLE, VEHICLE_STATUS.RESERVED]),
  notes: zv.optionalText(),
  coverImage: z.string().nullable(),
});

export type VehicleValues = z.infer<typeof vehicleSchema>;

export function vehicleToForm(v: Vehicle | null): VehicleValues {
  return {
    brand: v?.brand ?? "",
    model: v?.model ?? "",
    version: v?.version ?? "",
    year: String(v?.year ?? new Date().getFullYear()),
    plate: v?.plate ?? "",
    vin: v?.vin ?? "",
    engineNumber: v?.engineNumber ?? "",
    color: v?.color ?? "",
    km: String(v?.km ?? 0),
    fuel: v?.fuel ?? "",
    transmission: v?.transmission ?? "",
    condition: v?.condition ?? VEHICLE_CONDITION.USED,
    purchasePriceCents: v?.purchasePriceCents ?? null,
    salePriceCents: v?.salePriceCents ?? null,
    currency: v?.currency ?? DEFAULT_CURRENCY,
    status:
      v?.status === VEHICLE_STATUS.RESERVED ? VEHICLE_STATUS.RESERVED : VEHICLE_STATUS.AVAILABLE,
    notes: v?.notes ?? "",
    coverImage: v?.coverImage ?? null,
  };
}

export function vehicleToInput(v: VehicleValues): VehicleInput {
  return {
    brand: v.brand,
    model: v.model,
    version: emptyToNull(v.version),
    year: Number(v.year),
    plate: emptyToNull(v.plate),
    vin: emptyToNull(v.vin),
    engineNumber: emptyToNull(v.engineNumber),
    color: emptyToNull(v.color),
    km: digitsToNumber(v.km),
    fuel: emptyToNull(v.fuel),
    transmission: emptyToNull(v.transmission),
    condition: v.condition,
    purchasePriceCents: v.purchasePriceCents,
    purchaseCurrency: v.purchasePriceCents != null ? v.currency : null,
    salePriceCents: v.salePriceCents ?? 0,
    currency: v.currency,
    status: v.status,
    notes: emptyToNull(v.notes),
    coverImage: v.coverImage,
  };
}
