import { Plus, ReceiptText } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { useNavigate } from "react-router";
import type { SaleFilter } from "@/bindings/SaleFilter";
import type { SaleStatus } from "@/bindings/SaleStatus";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui/page";
import { SearchInput } from "@/components/ui/search-input";
import { SelectOptions } from "@/components/ui/select-options";
import { SALE_STATUS } from "@/lib/constants";
import { metaOptions, SALE_STATUS_META } from "@/lib/labels";
import { routes } from "@/lib/routes";
import { SalesTable } from "./components/SalesTable";
import { useSales } from "./hooks";

const statusOptions = metaOptions(SALE_STATUS_META);

export function SalesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SaleStatus | null>(SALE_STATUS.ACTIVE);
  const filter: SaleFilter = { clientId: null, status, search: useDeferredValue(search) || null };
  const sales = useSales(filter);

  return (
    <>
      <PageHeader
        title="Ventas"
        description="Operaciones registradas y su estado de pago"
        actions={
          <Button onClick={() => navigate(routes.newSale())}>
            <Plus /> Nueva venta
          </Button>
        }
      />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <SearchInput
            className="min-w-64 flex-1"
            placeholder="Buscar por cliente, documento, marca, modelo o patente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            className="w-44"
            value={status ?? ""}
            onChange={(e) => setStatus((e.target.value || null) as SaleStatus | null)}
          >
            <SelectOptions options={statusOptions} empty="Todos los estados" />
          </Select>
        </div>
        {sales.isPending ? (
          <Loading />
        ) : sales.isError ? (
          <div className="p-4">
            <ErrorState error={sales.error} />
          </div>
        ) : sales.data.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="No hay ventas"
            description={
              search || status ? "Probá con otros filtros." : "Registrá la primera venta."
            }
          />
        ) : (
          <SalesTable sales={sales.data} />
        )}
      </Card>
    </>
  );
}
