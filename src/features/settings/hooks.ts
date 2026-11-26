import { useQuery } from "@tanstack/react-query";
import type { Settings } from "@/bindings/Settings";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useAppMutation } from "@/lib/use-app-mutation";

export function useSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: api.getSettings, staleTime: Infinity });
}

export function useUpdateSettings() {
  return useAppMutation((input: Settings) => api.updateSettings(input), {
    success: "Configuración guardada",
  });
}
