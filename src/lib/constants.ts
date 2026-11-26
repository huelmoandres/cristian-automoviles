import type { Currency } from "@/bindings/Currency";
import type { DueScope } from "@/bindings/DueScope";
import type { InstallmentStatus } from "@/bindings/InstallmentStatus";
import type { PaymentMethod } from "@/bindings/PaymentMethod";
import type { SaleStatus } from "@/bindings/SaleStatus";
import type { VehicleCondition } from "@/bindings/VehicleCondition";
import type { VehicleStatus } from "@/bindings/VehicleStatus";

export const APP_NAME = "Cristian Automóviles";

/*
 * Valores de los enums de dominio. Los tipos se generan desde Rust (src-tauri/src/domain/status.rs);
 * `satisfies` garantiza que cada constante sea un valor válido de ese tipo.
 */

export const VEHICLE_STATUS = {
  AVAILABLE: "available",
  RESERVED: "reserved",
  SOLD: "sold",
} as const satisfies Record<string, VehicleStatus>;

export const VEHICLE_CONDITION = {
  NEW: "new",
  USED: "used",
} as const satisfies Record<string, VehicleCondition>;

export const SALE_STATUS = {
  ACTIVE: "active",
  PAID: "paid",
  CANCELLED: "cancelled",
} as const satisfies Record<string, SaleStatus>;

export const INSTALLMENT_STATUS = {
  PAID: "paid",
  PAID_LATE: "paid_late",
  PENDING: "pending",
  OVERDUE: "overdue",
} as const satisfies Record<string, InstallmentStatus>;

export const PAYMENT_METHOD = {
  CASH: "efectivo",
  TRANSFER: "transferencia",
  CHECK: "cheque",
  OTHER: "otro",
} as const satisfies Record<string, PaymentMethod>;

/** Forma de pago de una venta (solo frontend: en Rust, `planId: null` = contado). */
export const PAYMENT_MODE = {
  /** Pago total en el acto. */
  CASH: "cash",
  /** Entrega opcional + saldo en cuotas con un plan (contado + financiado). */
  FINANCED: "financed",
} as const;
export type PaymentMode = (typeof PAYMENT_MODE)[keyof typeof PAYMENT_MODE];

export const DUE_SCOPE = {
  OVERDUE: "overdue",
  UPCOMING: "upcoming",
  UNPAID: "unpaid",
} as const satisfies Record<string, DueScope>;

export const CURRENCY = {
  USD: "USD",
  UYU: "UYU",
} as const satisfies Record<string, Currency>;

/** Los autos se cotizan en dólares: es la moneda preseleccionada en los formularios. */
export const DEFAULT_CURRENCY: Currency = CURRENCY.USD;

/** Espejo de las reglas validadas en Rust, para dar feedback inmediato en formularios. */
export const LIMITS = {
  MIN_PASSWORD_LENGTH: 6,
  MIN_YEAR: 1900,
  MAX_INSTALLMENTS: 240,
  MAX_PERCENT: 1000,
  MAX_GRACE_DAYS: 365,
} as const;

/** Ventana por defecto para "próximos vencimientos" en cobranzas. */
export const UPCOMING_DAYS_OPTIONS = [7, 15, 30, 60] as const;
export const DEFAULT_UPCOMING_DAYS = 30;

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Formatos de foto aceptados (espejo de `ALLOWED_EXTENSIONS` en media.rs). */
export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];
