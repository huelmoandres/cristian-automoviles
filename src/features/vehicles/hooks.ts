import { useQuery } from "@tanstack/react-query";
import type { VehicleFilter } from "@/bindings/VehicleFilter";
import type { VehicleInput } from "@/bindings/VehicleInput";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useAppMutation } from "@/lib/use-app-mutation";

export function useVehicles(filter: VehicleFilter) {
  return useQuery({
    queryKey: queryKeys.vehicles.list(filter),
    queryFn: () => api.listVehicles(filter),
  });
}

export function useSaveVehicle(vehicleId: number | null, onSuccess: () => void) {
  return useAppMutation(
    (input: VehicleInput) =>
      vehicleId ? api.updateVehicle(vehicleId, input) : api.createVehicle(input),
    { success: vehicleId ? "Vehículo actualizado" : "Vehículo cargado", onSuccess },
  );
}

export function useDeleteVehicle(onSuccess: () => void) {
  return useAppMutation((id: number) => api.deleteVehicle(id), {
    success: "Vehículo eliminado",
    onSuccess,
  });
}
