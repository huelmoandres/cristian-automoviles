import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { PlanInput } from "@/bindings/PlanInput";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useAppMutation } from "@/lib/use-app-mutation";

export function usePlans(includeInactive = false) {
  return useQuery({
    queryKey: queryKeys.plans.list(includeInactive),
    queryFn: () => api.listPlans(includeInactive),
  });
}

/** Total y cuota de cada plan activo para un monto financiado (cálculo en Rust). */
export function usePlanSimulation(financedCents: number | null) {
  return useQuery({
    queryKey: queryKeys.plans.simulation(financedCents),
    queryFn: () => api.simulatePlans(financedCents ?? 0),
    enabled: financedCents != null && financedCents > 0,
    placeholderData: keepPreviousData,
  });
}

export function useSavePlan(planId: number | null, onSuccess: () => void) {
  return useAppMutation(
    (input: PlanInput) => (planId ? api.updatePlan(planId, input) : api.createPlan(input)),
    { success: planId ? "Plan actualizado" : "Plan creado", onSuccess },
  );
}

export function useDeletePlan(onSuccess: () => void) {
  return useAppMutation((id: number) => api.deletePlan(id), {
    success: "Plan eliminado",
    onSuccess,
  });
}
