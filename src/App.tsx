import { createHashRouter, Navigate, RouterProvider } from "react-router";
import { AppShell } from "@/components/layout/AppShell";
import { ErrorState, Loading } from "@/components/ui/page";
import { useAuthStatus } from "@/features/auth/hooks";
import { LoginPage } from "@/features/auth/LoginPage";
import { ClientDetailPage } from "@/features/clients/ClientDetailPage";
import { ClientsPage } from "@/features/clients/ClientsPage";
import { CollectionsPage } from "@/features/collections/CollectionsPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { FinancingPage } from "@/features/financing/FinancingPage";
import { NewSalePage } from "@/features/sales/NewSalePage";
import { SaleDetailPage } from "@/features/sales/SaleDetailPage";
import { SalesPage } from "@/features/sales/SalesPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { VehiclesPage } from "@/features/vehicles/VehiclesPage";
import { PATHS, routes } from "@/lib/routes";

/** Muestra el login (o la configuración inicial) hasta que haya sesión. */
function Root() {
  const auth = useAuthStatus();

  if (auth.isPending) return <Loading />;
  if (auth.isError) return <ErrorState error={auth.error} />;
  if (!auth.data.username) return <LoginPage firstRun={!auth.data.hasUser} />;
  return <AppShell username={auth.data.username} />;
}

// Hash router: funciona igual en desarrollo y empaquetado (sin servidor de rutas).
const router = createHashRouter([
  {
    path: PATHS.home,
    element: <Root />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: PATHS.collections, element: <CollectionsPage /> },
      { path: PATHS.sales, element: <SalesPage /> },
      { path: PATHS.newSale, element: <NewSalePage /> },
      { path: PATHS.saleDetail, element: <SaleDetailPage /> },
      { path: PATHS.clients, element: <ClientsPage /> },
      { path: PATHS.clientDetail, element: <ClientDetailPage /> },
      { path: PATHS.vehicles, element: <VehiclesPage /> },
      { path: PATHS.financing, element: <FinancingPage /> },
      { path: PATHS.settings, element: <SettingsPage /> },
      { path: "*", element: <Navigate to={routes.home()} replace /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
