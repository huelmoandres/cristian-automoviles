import { useDeferredValue } from "react";
import { useWatch, type Control } from "react-hook-form";
import type { FinancingPlan } from "@/bindings/FinancingPlan";
import { ChoiceCardsField } from "@/components/form/fields";
import type { Choice } from "@/components/ui/choice-cards";
import { usePlanSimulation } from "@/features/financing/hooks";
import { formatMoney, formatPercent } from "@/lib/format";
import { financedAmount, type SaleValues } from "../schema";

/**
 * Planes de cuotas como tarjetas, con la cuota estimada para el saldo a financiar
 * (cálculo en Rust, el mismo que genera el cronograma final).
 */
export function PaymentPlanPicker({
  control,
  plans,
}: {
  control: Control<SaleValues>;
  plans: FinancingPlan[];
}) {
  const [currency, priceCents, downPaymentCents] = useWatch({
    control,
    name: ["currency", "priceCents", "downPaymentCents"],
  });
  const financed = financedAmount({ priceCents, downPaymentCents });
  const simulation = usePlanSimulation(useDeferredValue(financed || null));
  const installmentByPlan = new Map(
    (simulation.data ?? []).map((s) => [s.plan.id, s.installmentCents]),
  );

  const options: Choice[] = plans.map((plan) => {
    const installment = installmentByPlan.get(plan.id);
    return {
      value: String(plan.id),
      title: plan.name,
      description: `Recargo ${formatPercent(plan.surchargeBp)}`,
      detail: installment ? `${formatMoney(installment, currency)} / mes` : undefined,
    };
  });

  return (
    <ChoiceCardsField
      control={control}
      name="planId"
      label="Plan de cuotas"
      required
      options={options}
      columnsClassName="grid-cols-2 xl:grid-cols-4"
      className="sm:col-span-3"
    />
  );
}
