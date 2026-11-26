import { z } from "zod";
import type { PaymentInput } from "@/bindings/PaymentInput";
import { PAYMENT_METHOD } from "@/lib/constants";
import { todayIso } from "@/lib/format";
import { emptyToNull, zv } from "@/lib/validation";

export const paymentSchema = z.object({
  paidAt: zv.isoDate(),
  method: z.enum(PAYMENT_METHOD),
  lateFeeCents: zv.money("Ingresá el recargo (0 si no corresponde)"),
  notes: zv.optionalText(),
});

export type PaymentValues = z.infer<typeof paymentSchema>;

export const defaultPayment = (): PaymentValues => ({
  paidAt: todayIso(),
  method: PAYMENT_METHOD.CASH,
  lateFeeCents: 0,
  notes: "",
});

export function paymentToInput(installmentId: number, v: PaymentValues): PaymentInput {
  return {
    installmentId,
    paidAt: v.paidAt,
    method: v.method,
    lateFeeCents: v.lateFeeCents ?? 0,
    notes: emptyToNull(v.notes),
  };
}
