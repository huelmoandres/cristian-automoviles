import { useSearchParams } from "react-router";
import type { VehicleStatus } from "@/bindings/VehicleStatus";
import { VEHICLE_STATUS } from "@/lib/constants";
import { ALL_STATUSES, VEHICLES_PARAMS } from "@/lib/routes";

const STATUSES = Object.values(VEHICLE_STATUS) as string[];

function isStatus(value: string | null): value is VehicleStatus {
  return value != null && STATUSES.includes(value);
}

/**
 * Búsqueda y estado del listado de vehículos guardados en la URL, para poder abrir la
 * página ya filtrada (p. ej. desde la búsqueda rápida). Sin estado elegido se muestran los
 * disponibles, salvo que haya una búsqueda: ahí se busca en todo el stock.
 */
export function useVehicleFilters() {
  const [params, setParams] = useSearchParams();
  const search = params.get(VEHICLES_PARAMS.search) ?? "";
  const statusParam = params.get(VEHICLES_PARAMS.status);
  const status: VehicleStatus | null = isStatus(statusParam)
    ? statusParam
    : statusParam === ALL_STATUSES || search
      ? null
      : VEHICLE_STATUS.AVAILABLE;

  function update(key: string, value: string) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }

  return {
    search,
    status,
    setSearch: (value: string) => update(VEHICLES_PARAMS.search, value),
    setStatus: (value: VehicleStatus | null) =>
      update(VEHICLES_PARAMS.status, value ?? ALL_STATUSES),
  };
}
