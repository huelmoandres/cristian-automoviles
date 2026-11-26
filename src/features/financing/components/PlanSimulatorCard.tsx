import { Calculator } from "lucide-react";
import { useDeferredValue, useState } from "react";
import type { Currency } from "@/bindings/Currency";
import type { PlanSimulation } from "@/bindings/PlanSimulation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/numeric-input";
import { EmptyState } from "@/components/ui/page";
import { SelectOptions } from "@/components/ui/select-options";
import { DEFAULT_CURRENCY } from "@/lib/constants";
import { formatMoney, formatPercent } from "@/lib/format";
import { CURRENCY_OPTIONS } from "@/lib/labels";
import { usePlanSimulation } from "../hooks";

function PlanTile({ simulation: s, currency }: { simulation: PlanSimulation; currency: Currency }) {
  const money = (cents: number) => formatMoney(cents, currency);
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium text-slate-900">{s.plan.name}</p>
        <p className="text-xs text-slate-500">+{formatPercent(s.plan.surchargeBp)}</p>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        {money(s.installmentCents)}
        <span className="ml-1 text-sm font-normal text-slate-500">/ mes</span>
      </p>
      <p className="mt-1 text-sm text-slate-500">
        Total {money(s.totalCents)} · recargo {money(s.surchargeCents)}
      </p>
    </div>
  );
}

/** Cuánto paga el cliente en cada plan activo para un saldo a financiar. */
export function PlanSimulatorCard() {
  const [currency, setCurrency] = useState<Currency>(DEFAULT_CURRENCY);
  const [amount, setAmount] = useState<number | null>(null);
  const simulation = usePlanSimulation(useDeferredValue(amount));

  return (
    <Card>
      <CardHeader
        title="Simulador de cuotas"
        description="Ingresá el saldo a financiar (precio − entrega) y compará los planes activos."
      />
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-3">
          <Field label="Moneda" className="w-44">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
              <SelectOptions options={CURRENCY_OPTIONS} />
            </Select>
          </Field>
          <Field label="Saldo a financiar" className="w-64">
            <MoneyInput currency={currency} value={amount} onChange={setAmount} />
          </Field>
        </div>
        {!amount || !simulation.data ? (
          <EmptyState icon={Calculator} title="Ingresá un monto para comparar los planes" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {simulation.data.map((s) => (
              <PlanTile key={s.plan.id} simulation={s} currency={currency} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
