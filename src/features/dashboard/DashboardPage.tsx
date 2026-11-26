import {
  AlertTriangle,
  CalendarClock,
  Car,
  CheckCircle2,
  HandCoins,
  Percent,
  Plus,
  ReceiptText,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { MoneyList } from "@/components/ui/money-list";
import { EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui/page";
import { StatCard } from "@/components/ui/stat-card";
import { DueInstallmentsTable } from "@/features/collections/components/DueInstallmentsTable";
import { useSettings } from "@/features/settings/hooks";
import { plural } from "@/lib/format";
import { routes } from "@/lib/routes";
import { CountTile } from "./components/CountTile";
import { useDashboard } from "./hooks";

const countOf = (totals: { count: number }[]) => totals.reduce((n, t) => n + t.count, 0);

export function DashboardPage() {
  const navigate = useNavigate();
  const dashboard = useDashboard();
  const { data: settings } = useSettings();

  if (dashboard.isPending) return <Loading />;
  if (dashboard.isError) return <ErrorState error={dashboard.error} />;
  const d = dashboard.data;
  const overdueCount = countOf(d.overdue);

  return (
    <>
      <PageHeader
        title={settings?.businessName ?? "Inicio"}
        description="Resumen de cobranzas y stock"
        actions={
          <Button onClick={() => navigate(routes.newSale())}>
            <Plus /> Nueva venta
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Cuotas vencidas"
          icon={AlertTriangle}
          tone={overdueCount > 0 ? "red" : "green"}
          footer={overdueCount > 0 ? plural(overdueCount, "cuota", "cuotas") : "Todos al día"}
        >
          <MoneyList totals={d.overdue} />
        </StatCard>
        <StatCard
          label="Recargos por mora a cobrar"
          icon={Percent}
          tone="amber"
          footer="Si se cobraran hoy"
        >
          <MoneyList totals={d.pendingLateFees} />
        </StatCard>
        <StatCard
          label="Vencen esta semana"
          icon={CalendarClock}
          footer={plural(countOf(d.upcomingWeek), "cuota", "cuotas")}
        >
          <MoneyList totals={d.upcomingWeek} />
        </StatCard>
        <StatCard
          label="Cobrado este mes"
          icon={CheckCircle2}
          tone="green"
          footer="Cuotas + recargos"
        >
          <MoneyList totals={d.collectedMonth} />
        </StatCard>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <CountTile
          label="Vehículos disponibles"
          value={d.availableVehicles}
          icon={Car}
          to={routes.vehicles()}
        />
        <CountTile
          label="Ventas en curso"
          value={d.activeSales}
          icon={ReceiptText}
          to={routes.sales()}
        />
        <CountTile label="Clientes" value={d.clients} icon={Users} to={routes.clients()} />
      </div>

      <Card>
        <CardHeader
          title="Para cobrar"
          description="Cuotas vencidas y las que vencen en los próximos 7 días"
          actions={
            <Button size="sm" variant="outline" onClick={() => navigate(routes.collections())}>
              <HandCoins /> Ver cobranzas
            </Button>
          }
        />
        {d.attention.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Nada pendiente para esta semana" />
        ) : (
          <DueInstallmentsTable items={d.attention} />
        )}
      </Card>
    </>
  );
}
