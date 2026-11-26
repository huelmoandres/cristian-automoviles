import { Command } from "cmdk";
import { Plus, ReceiptText, Search, User } from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { NAV_SECTIONS } from "@/components/layout/nav";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { VehiclePhoto } from "@/features/vehicles/components/VehiclePhoto";
import { vehicleSpecs, vehicleTitle } from "@/features/vehicles/utils";
import { formatDate, formatMoney, plural } from "@/lib/format";
import { SALE_STATUS_META, VEHICLE_STATUS_META } from "@/lib/labels";
import { isModShortcut, MOD_KEY_LABEL } from "@/lib/platform";
import { routes } from "@/lib/routes";
import { useQuickSearch } from "../hooks";
import { ResultIcon, ResultItem } from "./ResultItem";

const SHORTCUT_KEY = "k";

const groupClass =
  "px-1 py-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-slate-400";

/** Búsqueda global (⌘K / Ctrl+K): clientes, vehículos, ventas y accesos rápidos. */
export function QuickSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const { data } = useQuickSearch(deferredQuery);
  const hasQuery = query.trim().length > 0;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isModShortcut(event, SHORTCUT_KEY)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function changeOpen(value: boolean) {
    setOpen(value);
    if (!value) setQuery("");
  }

  function go(to: string) {
    changeOpen(false);
    navigate(to);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-400 outline-none hover:bg-white/10 hover:text-slate-200 focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Buscar…</span>
        <kbd className="rounded border border-white/15 px-1.5 text-xs text-slate-400">
          {MOD_KEY_LABEL}K
        </kbd>
      </button>

      <Command.Dialog
        open={open}
        onOpenChange={changeOpen}
        label="Búsqueda rápida"
        shouldFilter={false}
        overlayClassName="fixed inset-0 z-50 bg-slate-950/50"
        contentClassName="fixed left-1/2 top-[15vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-4">
          <Search className="size-4 text-slate-400" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Buscar clientes, vehículos o ventas…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>
        <Command.List className="max-h-[60vh] overflow-y-auto p-1">
          {hasQuery && (
            <Command.Empty className="px-4 py-10 text-center text-sm text-slate-500">
              Sin resultados para “{query.trim()}”.
            </Command.Empty>
          )}

          {!hasQuery && (
            <Command.Group heading="Ir a" className={groupClass}>
              <ResultItem
                value="nueva-venta"
                onSelect={() => go(routes.newSale())}
                leading={
                  <ResultIcon>
                    <Plus />
                  </ResultIcon>
                }
                title="Nueva venta"
              />
              {NAV_SECTIONS.flatMap((s) => s.items).map(({ to, label, icon: Icon }) => (
                <ResultItem
                  key={to}
                  value={`nav-${to}`}
                  onSelect={() => go(to)}
                  leading={
                    <ResultIcon>
                      <Icon />
                    </ResultIcon>
                  }
                  title={label}
                />
              ))}
            </Command.Group>
          )}

          {hasQuery && data && data.clients.length > 0 && (
            <Command.Group heading="Clientes" className={groupClass}>
              {data.clients.map((c) => (
                <ResultItem
                  key={c.id}
                  value={`client-${c.id}`}
                  onSelect={() => go(routes.clientDetail(c.id))}
                  leading={
                    <ResultIcon>
                      <User />
                    </ResultIcon>
                  }
                  title={`${c.lastName}, ${c.firstName}`}
                  subtitle={[`${c.documentType} ${c.documentNumber}`, c.phone]
                    .filter(Boolean)
                    .join(" · ")}
                  trailing={
                    c.overdueInstallments > 0 && (
                      <Badge tone="red">
                        {plural(c.overdueInstallments, "vencida", "vencidas")}
                      </Badge>
                    )
                  }
                />
              ))}
            </Command.Group>
          )}

          {hasQuery && data && data.vehicles.length > 0 && (
            <Command.Group heading="Vehículos" className={groupClass}>
              {data.vehicles.map((v) => (
                <ResultItem
                  key={v.id}
                  value={`vehicle-${v.id}`}
                  onSelect={() => go(routes.vehicles({ search: v.plate ?? vehicleTitle(v) }))}
                  leading={
                    <VehiclePhoto
                      fileName={v.coverThumb}
                      alt={vehicleTitle(v)}
                      className="h-8 w-11 shrink-0 rounded-md"
                    />
                  }
                  title={vehicleTitle(v)}
                  subtitle={`${vehicleSpecs(v)} · ${formatMoney(v.salePriceCents, v.currency)}`}
                  trailing={<StatusBadge meta={VEHICLE_STATUS_META[v.status]} />}
                />
              ))}
            </Command.Group>
          )}

          {hasQuery && data && data.sales.length > 0 && (
            <Command.Group heading="Ventas" className={groupClass}>
              {data.sales.map((s) => (
                <ResultItem
                  key={s.id}
                  value={`sale-${s.id}`}
                  onSelect={() => go(routes.saleDetail(s.id))}
                  leading={
                    <ResultIcon>
                      <ReceiptText />
                    </ResultIcon>
                  }
                  title={`${s.clientName} — ${s.vehicleLabel}`}
                  subtitle={`Venta del ${formatDate(s.saleDate)}`}
                  trailing={<StatusBadge meta={SALE_STATUS_META[s.status]} />}
                />
              ))}
            </Command.Group>
          )}
        </Command.List>
      </Command.Dialog>
    </>
  );
}
