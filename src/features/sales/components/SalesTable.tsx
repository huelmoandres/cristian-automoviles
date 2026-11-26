import { Link, useNavigate } from "react-router";
import type { Sale } from "@/bindings/Sale";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatMoney, plural } from "@/lib/format";
import { SALE_STATUS_META } from "@/lib/labels";
import { routes } from "@/lib/routes";
import { isCashSale, paymentText } from "../utils";

export function SalesTable({ sales }: { sales: Sale[] }) {
  const navigate = useNavigate();

  return (
    <Table>
      <THead>
        <tr>
          <TH>Fecha</TH>
          <TH>Cliente</TH>
          <TH>Vehículo</TH>
          <TH>Forma de pago</TH>
          <TH className="text-right">Precio</TH>
          <TH className="text-right">Saldo</TH>
          <TH>Estado</TH>
        </tr>
      </THead>
      <TBody>
        {sales.map((s) => (
          <TR
            key={s.id}
            className="cursor-pointer"
            onClick={() => navigate(routes.saleDetail(s.id))}
          >
            <TD className="whitespace-nowrap">{formatDate(s.saleDate)}</TD>
            <TD>
              <Link
                to={routes.clientDetail(s.clientId)}
                onClick={(e) => e.stopPropagation()}
                className="font-medium text-slate-900 hover:text-brand-700"
              >
                {s.clientName}
              </Link>
            </TD>
            <TD className="text-slate-600">{s.vehicleLabel}</TD>
            <TD className="text-slate-600">
              {paymentText(s)}
              {!isCashSale(s) && (
                <div className="text-xs">
                  {s.paidInstallments} de {s.installmentsCount} pagas
                  {s.overdueInstallments > 0 && (
                    <span className="ml-2 font-medium text-red-600">
                      {plural(s.overdueInstallments, "vencida", "vencidas")}
                    </span>
                  )}
                </div>
              )}
            </TD>
            <TD className="text-right">{formatMoney(s.priceCents, s.currency)}</TD>
            <TD className="text-right font-medium">{formatMoney(s.balanceCents, s.currency)}</TD>
            <TD>
              <StatusBadge meta={SALE_STATUS_META[s.status]} />
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
