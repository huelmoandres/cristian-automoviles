import { invoke } from "@tauri-apps/api/core";
import type { AuthStatus } from "@/bindings/AuthStatus";
import type { Client } from "@/bindings/Client";
import type { ClientDetail } from "@/bindings/ClientDetail";
import type { ClientInput } from "@/bindings/ClientInput";
import type { ClientListItem } from "@/bindings/ClientListItem";
import type { CloudBackupEntry } from "@/bindings/CloudBackupEntry";
import type { CloudBackupInput } from "@/bindings/CloudBackupInput";
import type { CloudBackupStatus } from "@/bindings/CloudBackupStatus";
import type { Dashboard } from "@/bindings/Dashboard";
import type { DueFilter } from "@/bindings/DueFilter";
import type { DueInstallment } from "@/bindings/DueInstallment";
import type { FinancingPlan } from "@/bindings/FinancingPlan";
import type { PaymentInput } from "@/bindings/PaymentInput";
import type { PaymentPreview } from "@/bindings/PaymentPreview";
import type { PlanInput } from "@/bindings/PlanInput";
import type { PlanSimulation } from "@/bindings/PlanSimulation";
import type { QuickSearchResults } from "@/bindings/QuickSearchResults";
import type { Sale } from "@/bindings/Sale";
import type { SaleDetail } from "@/bindings/SaleDetail";
import type { SaleFilter } from "@/bindings/SaleFilter";
import type { SaleInput } from "@/bindings/SaleInput";
import type { SalePreview } from "@/bindings/SalePreview";
import type { Settings } from "@/bindings/Settings";
import type { Vehicle } from "@/bindings/Vehicle";
import type { VehicleFilter } from "@/bindings/VehicleFilter";
import type { VehicleInput } from "@/bindings/VehicleInput";
import type { UpdaterStatus } from "@/bindings/UpdaterStatus";

/** Wrappers tipados de los comandos definidos en src-tauri/src/commands. */
export const api = {
  // Autenticación
  authStatus: () => invoke<AuthStatus>("auth_status"),
  setupUser: (username: string, password: string) =>
    invoke<AuthStatus>("setup_user", { username, password }),
  login: (username: string, password: string) =>
    invoke<AuthStatus>("login", { username, password }),
  logout: () => invoke<void>("logout"),
  changePassword: (current: string, newPassword: string) =>
    invoke<void>("change_password", { current, newPassword }),

  // Configuración
  getSettings: () => invoke<Settings>("get_settings"),
  updateSettings: (input: Settings) => invoke<Settings>("update_settings", { input }),
  exportBackup: (destinationPath: string) => invoke<void>("export_backup", { destinationPath }),
  importBackup: (sourcePath: string) => invoke<string | null>("import_backup", { sourcePath }),
  cloudBackupStatus: () => invoke<CloudBackupStatus>("cloud_backup_status"),
  configureCloudBackup: (input: CloudBackupInput) =>
    invoke<CloudBackupStatus>("configure_cloud_backup", { input }),
  disableCloudBackup: () => invoke<CloudBackupStatus>("disable_cloud_backup"),
  runCloudBackup: () => invoke<CloudBackupStatus>("run_cloud_backup"),
  listCloudBackups: () => invoke<CloudBackupEntry[]>("list_cloud_backups"),
  restoreCloudBackup: (key: string) => invoke<string | null>("restore_cloud_backup", { key }),
  updaterStatus: () => invoke<UpdaterStatus>("updater_status"),

  // Vehículos
  listVehicles: (filter: VehicleFilter) => invoke<Vehicle[]>("list_vehicles", { filter }),
  getVehicle: (id: number) => invoke<Vehicle>("get_vehicle", { id }),
  createVehicle: (input: VehicleInput) => invoke<Vehicle>("create_vehicle", { input }),
  updateVehicle: (id: number, input: VehicleInput) =>
    invoke<Vehicle>("update_vehicle", { id, input }),
  deleteVehicle: (id: number) => invoke<void>("delete_vehicle", { id }),
  /** Procesa y guarda una foto elegida por el usuario; devuelve el nombre del archivo. */
  importVehicleImage: (sourcePath: string) =>
    invoke<string>("import_vehicle_image", { sourcePath }),
  mediaDir: () => invoke<string>("media_dir"),

  // Clientes
  listClients: (search: string | null) => invoke<ClientListItem[]>("list_clients", { search }),
  getClient: (id: number) => invoke<ClientDetail>("get_client", { id }),
  createClient: (input: ClientInput) => invoke<Client>("create_client", { input }),
  updateClient: (id: number, input: ClientInput) => invoke<Client>("update_client", { id, input }),
  deleteClient: (id: number) => invoke<void>("delete_client", { id }),

  // Planes de financiación
  listPlans: (includeInactive: boolean) =>
    invoke<FinancingPlan[]>("list_plans", { includeInactive }),
  createPlan: (input: PlanInput) => invoke<FinancingPlan>("create_plan", { input }),
  updatePlan: (id: number, input: PlanInput) => invoke<FinancingPlan>("update_plan", { id, input }),
  deletePlan: (id: number) => invoke<void>("delete_plan", { id }),
  simulatePlans: (financedCents: number) =>
    invoke<PlanSimulation[]>("simulate_plans", { financedCents }),

  // Ventas
  previewSale: (input: SaleInput) => invoke<SalePreview>("preview_sale", { input }),
  createSale: (input: SaleInput) => invoke<SaleDetail>("create_sale", { input }),
  listSales: (filter: SaleFilter) => invoke<Sale[]>("list_sales", { filter }),
  getSale: (id: number) => invoke<SaleDetail>("get_sale", { id }),
  cancelSale: (id: number) => invoke<SaleDetail>("cancel_sale", { id }),

  // Pagos
  previewPayment: (installmentId: number, paidAt: string) =>
    invoke<PaymentPreview>("preview_payment", { installmentId, paidAt }),
  registerPayment: (input: PaymentInput) => invoke<SaleDetail>("register_payment", { input }),
  deletePayment: (id: number) => invoke<SaleDetail>("delete_payment", { id }),

  // Cobranzas y tablero
  listDueInstallments: (filter: DueFilter) =>
    invoke<DueInstallment[]>("list_due_installments", { filter }),
  getDashboard: () => invoke<Dashboard>("get_dashboard"),
  quickSearch: (query: string) => invoke<QuickSearchResults>("quick_search_all", { query }),
};
