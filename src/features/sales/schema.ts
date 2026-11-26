import { addMonths, format } from "date-fns";
import { z } from "zod";
import type { Currency } from "@/bindings/Currency";
import type { SaleInput } from "@/bindings/SaleInput";
import { CURRENCY, ISO_DATE_PATTERN, PAYMENT_MODE } from "@/lib/constants";
import { todayIso } from "@/lib/format";
import { emptyToNull, MSG, zv } from "@/lib/validation";

export const saleSchema = z
  .object({
    clientId: z.string().min(1, "Elegí un cliente"),
    vehicleId: z.string().min(1, "Elegí un vehículo"),
    saleDate: zv.isoDate(),
    currency: z.enum(CURRENCY),
    priceCents: zv.money("Ingresá el precio").refine((v) => (v ?? 0) > 0, "Ingresá el precio"),
    paymentMode: z.enum(PAYMENT_MODE),
    /** Pago al contado de una venta financiada (puede ser 0). */
    downPaymentCents: zv.optionalMoney(),
    planId: z.string(),
    firstDueDate: z.string(),
    lateFeeBp: zv.percentBp(),
    notes: zv.optionalText(),
  })
  .superRefine((v, ctx) => {
    if (v.paymentMode === PAYMENT_MODE.CASH) return;
    if (!v.planId) {
      ctx.addIssue({ code: "custom", path: ["planId"], message: "Elegí un plan de cuotas" });
    }
    if (!ISO_DATE_PATTERN.test(v.firstDueDate)) {
      ctx.addIssue({ code: "custom", path: ["firstDueDate"], message: MSG.invalidDate });
    }
    if ((v.downPaymentCents ?? 0) >= (v.priceCents ?? 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["downPaymentCents"],
        message: "La entrega debe ser menor al precio (si paga todo, elegí contado)",
      });
    }
  });

export type SaleValues = z.infer<typeof saleSchema>;

export function defaultSale(preset: {
  clientId: string | null;
  vehicleId: string | null;
  currency: Currency;
  lateFeeBp: number | null;
  /** Plan preseleccionado al financiar (el primero activo). */
  planId: number | null;
}): SaleValues {
  return {
    clientId: preset.clientId ?? "",
    vehicleId: preset.vehicleId ?? "",
    saleDate: todayIso(),
    currency: preset.currency,
    priceCents: null,
    paymentMode: PAYMENT_MODE.FINANCED,
    downPaymentCents: null,
    planId: preset.planId != null ? String(preset.planId) : "",
    firstDueDate: format(addMonths(new Date(), 1), "yyyy-MM-dd"),
    lateFeeBp: preset.lateFeeBp,
    notes: "",
  };
}

/** Saldo que se financia en cuotas: precio − entrega (0 en contado). */
export function financedAmount(v: Pick<SaleValues, "priceCents" | "downPaymentCents">): number {
  return Math.max((v.priceCents ?? 0) - (v.downPaymentCents ?? 0), 0);
}

export function saleToInput(v: SaleValues): SaleInput {
  const isCash = v.paymentMode === PAYMENT_MODE.CASH;
  return {
    clientId: Number(v.clientId),
    vehicleId: Number(v.vehicleId),
    saleDate: v.saleDate,
    currency: v.currency,
    priceCents: v.priceCents ?? 0,
    downPaymentCents: isCash ? (v.priceCents ?? 0) : (v.downPaymentCents ?? 0),
    planId: isCash ? null : Number(v.planId),
    firstDueDate: isCash ? null : v.firstDueDate,
    lateFeeBp: v.lateFeeBp,
    notes: emptyToNull(v.notes),
  };
}

/** Input para la vista previa, o `null` si el formulario todavía no es válido. */
export function previewInput(values: unknown): SaleInput | null {
  const parsed = saleSchema.safeParse(values);
  return parsed.success ? saleToInput(parsed.data) : null;
}
