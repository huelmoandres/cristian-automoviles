import { Pencil, Plus, ReceiptText, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BackLink, EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui/page";
import { SaleAccount } from "@/features/sales/components/SaleAccount";
import { routes } from "@/lib/routes";
import { ClientFormDialog } from "./components/ClientFormDialog";
import { ContactCard } from "./components/ContactCard";
import { DebtSummary } from "./components/DebtSummary";
import { useClient, useDeleteClient } from "./hooks";
import { fullName } from "./schema";

export function ClientDetailPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const detail = useClient(id);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const remove = useDeleteClient(() => navigate(routes.clients()));

  if (detail.isPending) return <Loading />;
  if (detail.isError) return <ErrorState error={detail.error} />;
  const { client, sales } = detail.data;
  const newSale = () => navigate(routes.newSale({ clientId: client.id }));

  return (
    <>
      <BackLink to={routes.clients()}>Clientes</BackLink>
      <PageHeader
        title={fullName(client)}
        description={`${client.documentType} ${client.documentNumber}`}
        actions={
          <>
            {sales.length === 0 && (
              <Button variant="ghost" onClick={() => setDeleteOpen(true)}>
                <Trash2 /> Eliminar
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil /> Editar
            </Button>
            <Button onClick={newSale}>
              <Plus /> Nueva venta
            </Button>
          </>
        }
      />

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <ContactCard client={client} />
        <div className="lg:col-span-2">
          <DebtSummary sales={sales.map((s) => s.sale)} />
        </div>
      </div>

      <h2 className="mb-3 text-lg font-semibold text-slate-900">Compras</h2>
      {sales.length === 0 ? (
        <Card>
          <EmptyState
            icon={ReceiptText}
            title="Sin compras registradas"
            action={
              <Button onClick={newSale}>
                <Plus /> Registrar venta
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {sales.map((s) => (
            <SaleAccount key={s.sale.id} detail={s} linkToSale />
          ))}
        </div>
      )}

      <ClientFormDialog open={editOpen} client={client} onClose={() => setEditOpen(false)} />
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => remove.mutate(client.id)}
        loading={remove.isPending}
        title="Eliminar cliente"
        confirmLabel="Eliminar"
      >
        ¿Eliminar a <strong>{fullName(client)}</strong>?
      </ConfirmDialog>
    </>
  );
}
