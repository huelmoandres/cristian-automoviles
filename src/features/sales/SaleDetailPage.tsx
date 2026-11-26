import { Ban, User } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BackLink, ErrorState, Loading, PageHeader } from "@/components/ui/page";
import { SALE_STATUS } from "@/lib/constants";
import { routes } from "@/lib/routes";
import { PaymentsHistory } from "./components/PaymentsHistory";
import { SaleAccount } from "./components/SaleAccount";
import { useCancelSale, useSale } from "./hooks";
import { isCashSale } from "./utils";

export function SaleDetailPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const detail = useSale(id);
  const [cancelOpen, setCancelOpen] = useState(false);
  const cancel = useCancelSale(() => setCancelOpen(false));

  if (detail.isPending) return <Loading />;
  if (detail.isError) return <ErrorState error={detail.error} />;
  const { sale, payments } = detail.data;
  const canCancel = sale.status !== SALE_STATUS.CANCELLED && payments.length === 0;

  return (
    <>
      <BackLink to={routes.sales()}>Ventas</BackLink>
      <PageHeader
        title={`Venta #${sale.id}`}
        description={`${sale.clientName} · ${sale.clientDocument}`}
        actions={
          <>
            {canCancel && (
              <Button variant="ghost" onClick={() => setCancelOpen(true)}>
                <Ban /> Anular venta
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate(routes.clientDetail(sale.clientId))}>
              <User /> Ver cliente
            </Button>
          </>
        }
      />
      <div className="space-y-6">
        <SaleAccount detail={detail.data} />
        {!isCashSale(sale) && <PaymentsHistory payments={payments} currency={sale.currency} />}
      </div>
      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => cancel.mutate(sale.id)}
        loading={cancel.isPending}
        title="Anular venta"
        confirmLabel="Anular venta"
      >
        La venta quedará anulada y el vehículo <strong>{sale.vehicleLabel}</strong> volverá a estar
        disponible.
      </ConfirmDialog>
    </>
  );
}
