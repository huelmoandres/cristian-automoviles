import { ErrorState, Loading, PageHeader } from "@/components/ui/page";
import { useSettings } from "@/features/settings/hooks";
import { LateFeeCard } from "./components/LateFeeCard";
import { PlanSimulatorCard } from "./components/PlanSimulatorCard";
import { PlansCard } from "./components/PlansCard";

export function FinancingPage() {
  const settings = useSettings();

  return (
    <>
      <PageHeader
        title="Financiación y recargos"
        description="Planes de cuotas con su recargo y el recargo por pagos fuera de término"
      />
      <div className="space-y-6">
        <div className="grid items-start gap-6 xl:grid-cols-5">
          <div className="xl:col-span-3">
            <PlansCard />
          </div>
          <div className="xl:col-span-2">
            {settings.isPending ? (
              <Loading />
            ) : settings.isError ? (
              <ErrorState error={settings.error} />
            ) : (
              <LateFeeCard settings={settings.data} />
            )}
          </div>
        </div>
        <PlanSimulatorCard />
      </div>
    </>
  );
}
