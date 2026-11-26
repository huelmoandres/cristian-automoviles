import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/** Clientes, vehículos y ventas que coinciden con `query` (búsqueda en Rust). */
export function useQuickSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: queryKeys.quickSearch(trimmed),
    queryFn: () => api.quickSearch(trimmed),
    enabled: trimmed.length > 0,
    placeholderData: keepPreviousData,
  });
}
