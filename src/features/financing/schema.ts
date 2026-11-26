import { z } from "zod";
import type { FinancingPlan } from "@/bindings/FinancingPlan";
import type { PlanInput } from "@/bindings/PlanInput";
import type { Settings } from "@/bindings/Settings";
import { LIMITS } from "@/lib/constants";
import { emptyToNull, zv } from "@/lib/validation";

const wholeNumber = z.string().regex(/^\d+$/, "Solo números");

export const planSchema = z.object({
  name: zv.optionalText(),
  installments: wholeNumber.refine(
    (n) => Number(n) >= 1 && Number(n) <= LIMITS.MAX_INSTALLMENTS,
    `Entre 1 y ${LIMITS.MAX_INSTALLMENTS} cuotas`,
  ),
  surchargeBp: zv.percentBp(),
  active: z.boolean(),
});

export type PlanValues = z.infer<typeof planSchema>;

export function planToForm(p: FinancingPlan | null): PlanValues {
  return {
    name: p?.name ?? "",
    installments: p ? String(p.installments) : "",
    surchargeBp: p?.surchargeBp ?? null,
    active: p?.active ?? true,
  };
}

export function planToInput(v: PlanValues): PlanInput {
  return {
    name: emptyToNull(v.name),
    installments: Number(v.installments),
    surchargeBp: v.surchargeBp ?? 0,
    active: v.active,
  };
}

export const lateFeeSchema = z.object({
  lateFeeBp: zv.percentBp(),
  graceDays: wholeNumber.refine(
    (d) => Number(d) <= LIMITS.MAX_GRACE_DAYS,
    `Máximo ${LIMITS.MAX_GRACE_DAYS} días`,
  ),
});

export type LateFeeValues = z.infer<typeof lateFeeSchema>;

export function lateFeeToForm(s: Settings): LateFeeValues {
  return { lateFeeBp: s.lateFeeBp, graceDays: String(s.graceDays) };
}

/** Combina los valores de mora con el resto de la configuración vigente. */
export function lateFeeToSettings(v: LateFeeValues, current: Settings): Settings {
  return { ...current, lateFeeBp: v.lateFeeBp ?? 0, graceDays: Number(v.graceDays) };
}
