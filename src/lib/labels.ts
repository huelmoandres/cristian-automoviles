import type { Currency } from "@/bindings/Currency";
import type { InstallmentStatus } from "@/bindings/InstallmentStatus";
import type { PaymentMethod } from "@/bindings/PaymentMethod";
import type { SaleStatus } from "@/bindings/SaleStatus";
import type { VehicleCondition } from "@/bindings/VehicleCondition";
import type { VehicleStatus } from "@/bindings/VehicleStatus";
import type { BadgeTone } from "@/components/ui/badge";

/** Texto y color de un estado, para `StatusBadge`. */
export type StatusMeta = { label: string; tone: BadgeTone };

export const INSTALLMENT_STATUS_META: Record<InstallmentStatus, StatusMeta> = {
  paid: { label: "Pagada", tone: "green" },
  paid_late: { label: "Pagada con atraso", tone: "amber" },
  pending: { label: "Pendiente", tone: "slate" },
  overdue: { label: "Vencida", tone: "red" },
};

export const VEHICLE_STATUS_META: Record<VehicleStatus, StatusMeta> = {
  available: { label: "Disponible", tone: "green" },
  reserved: { label: "Reservado", tone: "amber" },
  sold: { label: "Vendido", tone: "slate" },
};

export const SALE_STATUS_META: Record<SaleStatus, StatusMeta> = {
  active: { label: "En curso", tone: "blue" },
  paid: { label: "Saldada", tone: "green" },
  cancelled: { label: "Anulada", tone: "slate" },
};

export const VEHICLE_CONDITION_LABEL: Record<VehicleCondition, string> = {
  new: "0 km",
  used: "Usado",
};

export const CURRENCY_LABEL: Record<Currency, string> = {
  USD: "USD · Dólares",
  UYU: "UYU · Pesos",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  cheque: "Cheque",
  otro: "Otro",
};

export const DOCUMENT_TYPES = ["CI", "RUT", "Pasaporte", "DNI"] as const;
export const DEFAULT_DOCUMENT_TYPE = DOCUMENT_TYPES[0];
export const FUEL_TYPES = ["Nafta", "Diésel", "GNC", "Híbrido", "Eléctrico"] as const;
export const TRANSMISSIONS = ["Manual", "Automática"] as const;

export type Option<V extends string = string> = { value: V; label: string };

/** Record de etiquetas → opciones para un `<select>`. */
export function toOptions<K extends string>(labels: Record<K, string>): Option<K>[] {
  return (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }));
}

/** Lista simple → opciones (valor = etiqueta). */
export function listOptions(values: readonly string[]): Option[] {
  return values.map((value) => ({ value, label: value }));
}

export function metaOptions<K extends string>(meta: Record<K, StatusMeta>): Option<K>[] {
  return (Object.keys(meta) as K[]).map((value) => ({ value, label: meta[value].label }));
}

/** Opciones de moneda para los selects (USD primero: es la moneda por defecto). */
export const CURRENCY_OPTIONS = toOptions(CURRENCY_LABEL);
