import { Calculator } from "lucide-react";
import type { SalePreview } from "@/bindings/SalePreview";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/page";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatMoney, formatPercent, plural } from "@/lib/format";

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={
        strong ? "flex justify-between font-semibold text-slate-900" : "flex justify-between"
      }
    >
      <span className={strong ? undefined : "text-slate-500"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

/** Resumen de la operación y cronograma de cuotas antes de confirmar. */
export function SalePreviewPanel({
  preview,
  error,
  currency,
  submitting,
}: {
  preview: SalePreview | undefined;
  error: unknown;
  currency: string;
  submitting: boolean;
}) {
  const money = (cents: number) => formatMoney(cents, currency);
  const first = preview?.schedule[0];

  return (
    <Card className="lg:sticky lg:top-6">
      <CardHeader title="Resumen" />
      {error ? (
        <div className="p-5">
          <ErrorState error={error} />
        </div>
      ) : !preview ? (
        <EmptyState
          icon={Calculator}
          title="Completá los datos"
          description="Acá vas a ver el total y el cronograma de cuotas."
        />
      ) : (
        <>
          <div className="space-y-2 px-5 py-4 text-sm">
            {preview.schedule.length === 0 ? (
              <Row label="Pago al contado" value={money(preview.downPaymentCents)} />
            ) : (
              <>
                {preview.downPaymentCents > 0 && (
                  <Row label="Entrega al contado" value={money(preview.downPaymentCents)} />
                )}
                <Row label="Saldo a financiar" value={money(preview.financedCents)} />
                <Row
                  label={`Recargo financiación (${formatPercent(preview.surchargeBp)})`}
                  value={money(preview.surchargeCents)}
                />
                <Row label="Total en cuotas" value={money(preview.totalFinancedCents)} />
              </>
            )}
            <div className="border-t border-slate-100 pt-2">
              <Row label="Total de la operación" value={money(preview.totalCents)} strong />
            </div>
            {first && (
              <p className="rounded-lg bg-brand-50 p-3 text-center text-brand-800">
                {plural(preview.schedule.length, "cuota", "cuotas")} de{" "}
                <strong>{money(first.amountCents)}</strong>
              </p>
            )}
          </div>
          {preview.schedule.length > 0 && (
            <div className="max-h-72 overflow-y-auto border-t border-slate-100">
              <Table>
                <THead>
                  <tr>
                    <TH>N°</TH>
                    <TH>Vence</TH>
                    <TH className="text-right">Importe</TH>
                  </tr>
                </THead>
                <TBody>
                  {preview.schedule.map((row) => (
                    <TR key={row.number}>
                      <TD className="py-2">{row.number}</TD>
                      <TD className="py-2">{formatDate(row.dueDate)}</TD>
                      <TD className="py-2 text-right">{money(row.amountCents)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </>
      )}
      <div className="border-t border-slate-100 p-5">
        <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={!preview}>
          Confirmar venta
        </Button>
      </div>
    </Card>
  );
}
