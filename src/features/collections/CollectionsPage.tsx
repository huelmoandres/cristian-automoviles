import { CalendarCheck } from "lucide-react";
import { useDeferredValue, useState } from "react";
import type { DueFilter } from "@/bindings/DueFilter";
import type { DueScope } from "@/bindings/DueScope";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { MoneyList } from "@/components/ui/money-list";
import { EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui/page";
import { SearchInput } from "@/components/ui/search-input";
import { Segmented } from "@/components/ui/segmented";
import { SelectOptions } from "@/components/ui/select-options";
import { DEFAULT_UPCOMING_DAYS, DUE_SCOPE, UPCOMING_DAYS_OPTIONS } from "@/lib/constants";
import { plural } from "@/lib/format";
import type { Option } from "@/lib/labels";
import { sumByCurrency } from "@/lib/money";
import { DueInstallmentsTable } from "./components/DueInstallmentsTable";
import { useDueInstallments } from "./hooks";

const SCOPE_OPTIONS: Option<DueScope>[] = [
  { value: DUE_SCOPE.OVERDUE, label: "Vencidas" },
  { value: DUE_SCOPE.UPCOMING, label: "Próximas a vencer" },
  { value: DUE_SCOPE.UNPAID, label: "Todas las impagas" },
];

const EMPTY_MESSAGE: Record<DueScope, string> = {
  overdue: "No hay cuotas vencidas. ¡Todos al día!",
  upcoming: "No hay cuotas por vencer en ese período.",
  unpaid: "No hay cuotas pendientes de cobro.",
};

const daysOptions: Option[] = UPCOMING_DAYS_OPTIONS.map((d) => ({
  value: String(d),
  label: `Próximos ${d} días`,
}));

export function CollectionsPage() {
  const [scope, setScope] = useState<DueScope>(DUE_SCOPE.OVERDUE);
  const [days, setDays] = useState(DEFAULT_UPCOMING_DAYS);
  const [search, setSearch] = useState("");
  const filter: DueFilter = {
    scope,
    days: scope === DUE_SCOPE.UPCOMING ? days : null,
    search: useDeferredValue(search) || null,
  };
  const due = useDueInstallments(filter);

  return (
    <>
      <PageHeader title="Cobranzas" description="Cuotas para cobrar y seguimiento de morosos" />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <Segmented options={SCOPE_OPTIONS} value={scope} onChange={setScope} />
          {scope === DUE_SCOPE.UPCOMING && (
            <Select
              className="w-48"
              value={String(days)}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <SelectOptions options={daysOptions} />
            </Select>
          )}
          <SearchInput
            className="min-w-64 flex-1"
            placeholder="Buscar por cliente, documento, teléfono o patente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {due.data && due.data.length > 0 && (
          <div className="flex justify-end gap-1 border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm">
            <span className="text-slate-500">
              {plural(due.data.length, "cuota", "cuotas")} · Total
            </span>
            <span className="font-semibold text-slate-900">
              <MoneyList inline totals={sumByCurrency(due.data, (d) => d.amountCents)} />
            </span>
          </div>
        )}
        {due.isPending ? (
          <Loading />
        ) : due.isError ? (
          <div className="p-4">
            <ErrorState error={due.error} />
          </div>
        ) : due.data.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title={search ? `Sin resultados para “${search}”` : EMPTY_MESSAGE[scope]}
          />
        ) : (
          <DueInstallmentsTable items={due.data} />
        )}
      </Card>
    </>
  );
}
