import type { DueFilter } from "@/bindings/DueFilter";
import type { SaleFilter } from "@/bindings/SaleFilter";
import type { SaleInput } from "@/bindings/SaleInput";
import type { VehicleFilter } from "@/bindings/VehicleFilter";

/** Claves de react-query centralizadas. */
export const queryKeys = {
  auth: ["auth"] as const,
  settings: ["settings"] as const,
  dashboard: ["dashboard"] as const,
  mediaDir: ["media-dir"] as const,
  updater: ["updater"] as const,
  quickSearch: (query: string) => ["quick-search", query] as const,
  vehicles: {
    list: (filter: VehicleFilter) => ["vehicles", "list", filter] as const,
  },
  clients: {
    list: (search: string | null) => ["clients", "list", search] as const,
    detail: (id: number) => ["clients", "detail", id] as const,
  },
  plans: {
    list: (includeInactive: boolean) => ["plans", "list", includeInactive] as const,
    simulation: (financedCents: number | null) => ["plans", "simulation", financedCents] as const,
  },
  sales: {
    list: (filter: SaleFilter) => ["sales", "list", filter] as const,
    detail: (id: number) => ["sales", "detail", id] as const,
    preview: (input: SaleInput | null) => ["sales", "preview", input] as const,
  },
  payments: {
    preview: (installmentId: number, paidAt: string) =>
      ["payments", "preview", installmentId, paidAt] as const,
  },
  collections: {
    list: (filter: DueFilter) => ["collections", "list", filter] as const,
  },
};
