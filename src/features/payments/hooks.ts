import { useQuery } from "@tanstack/react-query";
import type { PaymentInput } from "@/bindings/PaymentInput";
import { api } from "@/lib/api";
import { ISO_DATE_PATTERN } from "@/lib/constants";
import { queryKeys } from "@/lib/query-keys";
import { useAppMutation } from "@/lib/use-app-mutation";

/** Importe y recargo sugerido para pagar una cuota en una fecha dada. */
export function usePaymentPreview(installmentId: number, paidAt: string) {
  return useQuery({
    queryKey: queryKeys.payments.preview(installmentId, paidAt),
    queryFn: () => api.previewPayment(installmentId, paidAt),
    enabled: ISO_DATE_PATTERN.test(paidAt),
    placeholderData: (previous) => previous,
  });
}

export function useRegisterPayment(onSuccess: () => void) {
  return useAppMutation((input: PaymentInput) => api.registerPayment(input), {
    success: "Pago registrado",
    onSuccess,
  });
}

export function useDeletePayment(onSuccess: () => void) {
  return useAppMutation((id: number) => api.deletePayment(id), {
    success: "Pago anulado",
    onSuccess,
  });
}
