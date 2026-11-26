import { useQuery } from "@tanstack/react-query";
import type { DueFilter } from "@/bindings/DueFilter";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function useDueInstallments(filter: DueFilter) {
  return useQuery({
    queryKey: queryKeys.collections.list(filter),
    queryFn: () => api.listDueInstallments(filter),
  });
}
