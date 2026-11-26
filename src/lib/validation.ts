import { z } from "zod";
import { ISO_DATE_PATTERN, LIMITS } from "./constants";

/** Mensajes genéricos reutilizados por los schemas. */
export const MSG = {
  required: "Campo obligatorio",
  invalidDate: "Fecha inválida",
  invalidEmail: "Email inválido",
  onlyDigits: "Solo números",
  amountRequired: "Ingresá un monto",
  percentRange: `Debe estar entre 0% y ${LIMITS.MAX_PERCENT}%`,
} as const;

/** Bloques de validación reutilizables para los schemas de formularios. */
export const zv = {
  /** Texto obligatorio (se recortan espacios). */
  text: (message: string = MSG.required) => z.string().trim().min(1, message),
  /** Texto opcional: "" se envía como null (ver `emptyToNull`). */
  optionalText: () => z.string(),
  email: () => z.union([z.literal(""), z.email(MSG.invalidEmail)]),
  /** Entero escrito en un input (admite puntos de miles). */
  digits: (message: string = MSG.onlyDigits) => z.string().regex(/^[\d.]*$/, message),
  isoDate: (message: string = MSG.invalidDate) => z.string().regex(ISO_DATE_PATTERN, message),
  /** Monto obligatorio en centavos (lo produce `MoneyField`). */
  money: (message: string = MSG.amountRequired) =>
    z
      .number()
      .nullable()
      .refine((v) => v != null && v >= 0, message),
  optionalMoney: () => z.number().nonnegative().nullable(),
  /** Porcentaje obligatorio en puntos básicos (lo produce `PercentField`). */
  percentBp: (message: string = MSG.percentRange) =>
    z
      .number()
      .nullable()
      .refine((v) => v != null && v >= 0 && v <= LIMITS.MAX_PERCENT * 100, message),
};

/** "" → null, para campos opcionales de los inputs de Rust. */
export function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** "45.000" → 45000. */
export function digitsToNumber(value: string): number {
  return Number(value.replace(/\./g, "")) || 0;
}
