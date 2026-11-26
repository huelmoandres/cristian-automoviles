import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { SaleDetail } from "@/bindings/SaleDetail";
import type { SaleFilter } from "@/bindings/SaleFilter";
import type { SaleInput } from "@/bindings/SaleInput";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useAppMutation } from "@/lib/use-app-mutation";

export function useSales(filter: SaleFilter) {
  return useQuery({ queryKey: queryKeys.sales.list(filter), queryFn: () => api.listSales(filter) });
}

export function useSale(id: number) {
  return useQuery({ queryKey: queryKeys.sales.detail(id), queryFn: () => api.getSale(id) });
}

/** Cronograma calculado en Rust (misma lógica que al confirmar la venta). */
export function useSalePreview(input: SaleInput | null) {
  return useQuery({
    queryKey: queryKeys.sales.preview(input),
    queryFn: () => api.previewSale(input as SaleInput),
    enabled: input != null,
    placeholderData: keepPreviousData,
  });
}

export function useCreateSale(onSuccess: (detail: SaleDetail) => void) {
  return useAppMutation((input: SaleInput) => api.createSale(input), {
    success: "Venta registrada",
    onSuccess,
  });
}

export function useCancelSale(onSuccess: () => void) {
  return useAppMutation((id: number) => api.cancelSale(id), {
    success: "Venta anulada",
    onSuccess,
  });
}
