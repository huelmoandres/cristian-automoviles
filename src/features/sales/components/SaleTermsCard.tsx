import { useWatch, type Control } from "react-hook-form";
import type { FinancingPlan } from "@/bindings/FinancingPlan";
import {
  ChoiceCardsField,
  DateField,
  MoneyField,
  PercentField,
  SelectField,
  TextareaField,
} from "@/components/form/fields";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { Choice } from "@/components/ui/choice-cards";
import { Field } from "@/components/ui/field";
import { ValueBox } from "@/components/ui/value-box";
import { PAYMENT_MODE, type PaymentMode } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { CURRENCY_OPTIONS } from "@/lib/labels";
import { financedAmount, type SaleValues } from "../schema";
import { PaymentPlanPicker } from "./PaymentPlanPicker";

const PAYMENT_MODE_OPTIONS: Choice<PaymentMode>[] = [
  {
    value: PAYMENT_MODE.CASH,
    title: "Contado",
    description: "Paga el total en el acto",
  },
  {
    value: PAYMENT_MODE.FINANCED,
    title: "Financiado",
    description: "Entrega al contado (opcional) + saldo en cuotas",
  },
];

export function SaleTermsCard({
  control,
  plans,
}: {
  control: Control<SaleValues>;
  plans: FinancingPlan[];
}) {
  const [currency, paymentMode, priceCents, downPaymentCents] = useWatch({
    control,
    name: ["currency", "paymentMode", "priceCents", "downPaymentCents"],
  });
  const isFinanced = paymentMode === PAYMENT_MODE.FINANCED;

  return (
    <Card>
      <CardHeader title="Precio y forma de pago" />
      <CardContent className="grid gap-4 sm:grid-cols-3">
        <DateField control={control} name="saleDate" label="Fecha de venta" required />
        <SelectField control={control} name="currency" label="Moneda" options={CURRENCY_OPTIONS} />
        <MoneyField
          control={control}
          name="priceCents"
          label="Precio"
          required
          currency={currency}
        />

        <ChoiceCardsField
          control={control}
          name="paymentMode"
          label="Forma de pago"
          options={PAYMENT_MODE_OPTIONS}
          columnsClassName="grid-cols-2"
          className="sm:col-span-3"
        />

        {isFinanced && (
          <>
            <MoneyField
              control={control}
              name="downPaymentCents"
              label="Entrega al contado"
              currency={currency}
              hint="0 o vacío si financia el total"
            />
            <Field label="Saldo a financiar">
              <ValueBox>
                {formatMoney(financedAmount({ priceCents, downPaymentCents }), currency)}
              </ValueBox>
            </Field>
            <DateField
              control={control}
              name="firstDueDate"
              label="Vencimiento 1ª cuota"
              required
            />
            <PaymentPlanPicker control={control} plans={plans} />
            <PercentField
              control={control}
              name="lateFeeBp"
              label="Recargo por mora"
              required
              hint="Por cuota pagada fuera de término"
            />
          </>
        )}
        <TextareaField control={control} name="notes" label="Notas" className="sm:col-span-3" />
      </CardContent>
    </Card>
  );
}
