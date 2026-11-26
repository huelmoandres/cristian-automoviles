import { zodResolver } from "@hookform/resolvers/zod";
import { useDeferredValue, useEffect, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router";
import type { ClientListItem } from "@/bindings/ClientListItem";
import type { FinancingPlan } from "@/bindings/FinancingPlan";
import type { Settings } from "@/bindings/Settings";
import type { Vehicle } from "@/bindings/Vehicle";
import type { VehicleFilter } from "@/bindings/VehicleFilter";
import { BackLink, ErrorState, Loading, PageHeader } from "@/components/ui/page";
import { useClients } from "@/features/clients/hooks";
import { usePlans } from "@/features/financing/hooks";
import { useSettings } from "@/features/settings/hooks";
import { useVehicles } from "@/features/vehicles/hooks";
import { DEFAULT_CURRENCY, VEHICLE_STATUS } from "@/lib/constants";
import { NEW_SALE_PARAMS, routes } from "@/lib/routes";
import { SalePartiesCard } from "./components/SalePartiesCard";
import { SalePreviewPanel } from "./components/SalePreviewPanel";
import { SaleRequirements } from "./components/SaleRequirements";
import { SaleTermsCard } from "./components/SaleTermsCard";
import { useCreateSale, useSalePreview } from "./hooks";
import { defaultSale, previewInput, saleSchema, saleToInput, type SaleValues } from "./schema";

const ALL_VEHICLES: VehicleFilter = { search: null, status: null };

/** Carga lo necesario y verifica que se pueda vender antes de mostrar el formulario. */
export function NewSalePage() {
  const settings = useSettings();
  const clients = useClients(null);
  const vehicles = useVehicles(ALL_VEHICLES);
  const plans = usePlans();

  const error = settings.error ?? clients.error ?? vehicles.error ?? plans.error;
  const content = error ? (
    <ErrorState error={error} />
  ) : !settings.data || !clients.data || !vehicles.data || !plans.data ? (
    <Loading />
  ) : (
    <NewSaleContent
      settings={settings.data}
      clients={clients.data}
      vehicles={vehicles.data.filter((v) => v.status !== VEHICLE_STATUS.SOLD)}
      plans={plans.data}
    />
  );

  return (
    <>
      <BackLink to={routes.sales()}>Ventas</BackLink>
      <PageHeader title="Nueva venta" description="Registrá la venta y generá el plan de cuotas" />
      {content}
    </>
  );
}

type FormData = {
  settings: Settings;
  clients: ClientListItem[];
  vehicles: Vehicle[];
  plans: FinancingPlan[];
};

function NewSaleContent(props: FormData) {
  const hasClients = props.clients.length > 0;
  const hasVehicles = props.vehicles.length > 0;
  if (!hasClients || !hasVehicles) {
    return <SaleRequirements hasClients={hasClients} hasVehicles={hasVehicles} />;
  }
  return <NewSaleForm {...props} />;
}

function NewSaleForm({ settings, clients, vehicles, plans }: FormData) {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const { control, handleSubmit, setValue } = useForm<SaleValues>({
    resolver: zodResolver(saleSchema),
    defaultValues: defaultSale({
      clientId: params.get(NEW_SALE_PARAMS.clientId),
      vehicleId: params.get(NEW_SALE_PARAMS.vehicleId),
      currency: DEFAULT_CURRENCY,
      lateFeeBp: settings.lateFeeBp,
      planId: plans[0]?.id ?? null,
    }),
  });
  const values = useWatch({ control });
  const [vehicleId, currency] = useWatch({ control, name: ["vehicleId", "currency"] });

  // Al elegir un vehículo se precargan su precio y moneda (editables).
  const appliedVehicle = useRef<string | null>(null);
  useEffect(() => {
    if (vehicleId === appliedVehicle.current) return;
    const vehicle = vehicles.find((v) => String(v.id) === vehicleId);
    if (!vehicle) return;
    appliedVehicle.current = vehicleId;
    setValue("priceCents", vehicle.salePriceCents, { shouldValidate: true });
    setValue("currency", vehicle.currency);
  }, [vehicleId, vehicles, setValue]);

  const input = previewInput(useDeferredValue(values));
  const preview = useSalePreview(input);
  const create = useCreateSale((detail) => navigate(routes.saleDetail(detail.sale.id)));

  return (
    <form
      onSubmit={handleSubmit((v) => create.mutate(saleToInput(v)))}
      className="grid gap-6 lg:grid-cols-5"
      noValidate
    >
      <div className="space-y-6 lg:col-span-3">
        <SalePartiesCard
          control={control}
          setValue={setValue}
          clients={clients}
          vehicles={vehicles}
        />
        <SaleTermsCard control={control} plans={plans} />
      </div>
      <div className="lg:col-span-2">
        <SalePreviewPanel
          preview={input ? preview.data : undefined}
          error={input ? preview.error : null}
          currency={currency}
          submitting={create.isPending}
        />
      </div>
    </form>
  );
}
