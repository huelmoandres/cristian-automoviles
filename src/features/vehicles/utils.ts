import type { Vehicle } from "@/bindings/Vehicle";
import { formatNumber } from "@/lib/format";
import { VEHICLE_CONDITION_LABEL } from "@/lib/labels";

export function vehicleTitle(v: Pick<Vehicle, "brand" | "model">): string {
  return `${v.brand} ${v.model}`;
}

/** "XEi · Usado · Gris". */
export function vehicleSubtitle(v: Vehicle): string {
  return [v.version, VEHICLE_CONDITION_LABEL[v.condition], v.color].filter(Boolean).join(" · ");
}

/** "2020 · 45.000 km". */
export function vehicleSpecs(v: Vehicle): string {
  return `${v.year} · ${formatNumber(v.km)} km`;
}
