import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import type { PaymentPreview } from "@/bindings/PaymentPreview";
import { DateField, MoneyField, SelectField, TextareaField } from "@/components/form/fields";
import { FormError } from "@/components/form/form-error";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { ValueBox } from "@/components/ui/value-box";
import { formatDate, formatMoney, formatPercent, plural } from "@/lib/format";
import { PAYMENT_METHOD_LABEL, toOptions } from "@/lib/labels";
import { usePaymentPreview, useRegisterPayment } from "../hooks";
import { defaultPayment, paymentSchema, paymentToInput, type PaymentValues } from "../schema";

const methodOptions = toOptions(PAYMENT_METHOD_LABEL);

/** Datos de la cuota a cobrar, para el encabezado del diálogo. */
export type PaymentTarget = {
  installmentId: number;
  number: number;
  installmentsCount: number;
  clientName: string;
  vehicleLabel: string;
};

export function PaymentDialog({
  target,
  onClose,
}: {
  target: PaymentTarget | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={target != null}
      onClose={onClose}
      title={target ? `Cobrar cuota ${target.number} de ${target.installmentsCount}` : ""}
      description={target ? `${target.clientName} · ${target.vehicleLabel}` : undefined}
    >
      {target && <PaymentForm key={target.installmentId} target={target} onDone={onClose} />}
    </Dialog>
  );
}

function PaymentForm({ target, onDone }: { target: PaymentTarget; onDone: () => void }) {
  const { control, handleSubmit, setValue } = useForm<PaymentValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: defaultPayment(),
  });
  const [paidAt, lateFee] = useWatch({ control, name: ["paidAt", "lateFeeCents"] });
  const preview = usePaymentPreview(target.installmentId, paidAt);
  const p = preview.data;
  const register = useRegisterPayment(onDone);

  // Al cambiar la fecha de pago se recalcula el recargo sugerido (sigue siendo editable).
  useEffect(() => {
    if (preview.data && !preview.isPlaceholderData) {
      setValue("lateFeeCents", preview.data.suggestedLateFeeCents);
    }
  }, [preview.data, preview.isPlaceholderData, setValue]);

  return (
    <form
      onSubmit={handleSubmit((v) => register.mutate(paymentToInput(target.installmentId, v)))}
      noValidate
    >
      {p && <InstallmentInfo preview={p} />}

      <div className="grid grid-cols-2 gap-4">
        <DateField control={control} name="paidAt" label="Fecha de pago" required />
        <SelectField
          control={control}
          name="method"
          label="Medio de pago"
          options={methodOptions}
        />
      </div>

      {p && <LatenessNotice preview={p} />}

      <div className="mt-4 grid grid-cols-2 gap-4">
        <MoneyField
          control={control}
          name="lateFeeCents"
          label="Recargo por mora"
          currency={p?.currency}
          hint={
            p && lateFee !== p.suggestedLateFeeCents
              ? `Sugerido: ${formatMoney(p.suggestedLateFeeCents, p.currency)}`
              : "Se puede ajustar o condonar"
          }
        />
        <Field label="Total a cobrar">
          <ValueBox highlight>
            {p ? formatMoney(p.amountCents + (lateFee ?? 0), p.currency) : "—"}
          </ValueBox>
        </Field>
        <TextareaField control={control} name="notes" label="Notas" className="col-span-2" />
      </div>

      <div className="mt-3">
        <FormError error={preview.error} />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={register.isPending} disabled={!p}>
          Registrar pago
        </Button>
      </DialogFooter>
    </form>
  );
}

function InstallmentInfo({ preview: p }: { preview: PaymentPreview }) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm">
      <div>
        <p className="text-slate-500">Vencimiento</p>
        <p className="font-medium">{formatDate(p.dueDate)}</p>
      </div>
      <div>
        <p className="text-slate-500">Importe de la cuota</p>
        <p className="font-medium">{formatMoney(p.amountCents, p.currency)}</p>
      </div>
    </div>
  );
}

function LatenessNotice({ preview: p }: { preview: PaymentPreview }) {
  if (!p.isLate) {
    return (
      <Alert tone="green" icon={CheckCircle2} className="mt-4">
        Pago en término, sin recargo.
      </Alert>
    );
  }
  return (
    <Alert tone="amber" icon={AlertTriangle} className="mt-4">
      Pago fuera de término: {plural(p.daysLate, "día", "días")} de atraso
      {p.graceDays > 0 && ` (con ${plural(p.graceDays, "día", "días")} de gracia)`}. Corresponde un
      recargo del {formatPercent(p.lateFeeBp)}.
    </Alert>
  );
}
