import { Plus, Users } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui/page";
import { SearchInput } from "@/components/ui/search-input";
import { routes } from "@/lib/routes";
import { ClientFormDialog } from "./components/ClientFormDialog";
import { ClientsTable } from "./components/ClientsTable";
import { useClients } from "./hooks";

export function ClientsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const clients = useClients(useDeferredValue(search) || null);
  const [formOpen, setFormOpen] = useState(false);

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Compradores y su situación de pagos"
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus /> Nuevo cliente
          </Button>
        }
      />
      <Card>
        <div className="border-b border-slate-100 p-4">
          <SearchInput
            placeholder="Buscar por nombre, apellido, documento o teléfono…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {clients.isPending ? (
          <Loading />
        ) : clients.isError ? (
          <div className="p-4">
            <ErrorState error={clients.error} />
          </div>
        ) : clients.data.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No hay clientes"
            description={search ? "Probá con otra búsqueda." : "Cargá el primer cliente."}
          />
        ) : (
          <ClientsTable clients={clients.data} />
        )}
      </Card>
      <ClientFormDialog
        open={formOpen}
        client={null}
        onClose={() => setFormOpen(false)}
        onSaved={(c) => navigate(routes.clientDetail(c.id))}
      />
    </>
  );
}
