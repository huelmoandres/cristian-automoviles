import { format, parseISO } from "date-fns";

/** Formato de números, monedas y fechas de Uruguay. */
const LOCALE = "es-UY";
const formatters = new Map<string, Intl.NumberFormat>();

function moneyFormatter(currency: string, decimals: boolean) {
  const key = `${currency}:${decimals}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency,
      minimumFractionDigits: decimals ? 2 : 0,
      maximumFractionDigits: decimals ? 2 : 0,
    });
    formatters.set(key, f);
  }
  return f;
}

/** Centavos → "$ 1.500.000" / "US$ 15.000,50". */
export function formatMoney(cents: number, currency: string): string {
  return moneyFormatter(currency, cents % 100 !== 0).format(cents / 100);
}

const plain = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });

/** Centavos → "1.500.000,5" (para inputs). */
export function centsToInput(cents: number | null | undefined): string {
  return cents == null ? "" : plain.format(cents / 100);
}

/**
 * Interpreta montos escritos a mano: "1.500.000", "1500000,50", "15000.5".
 * Con coma, la coma es el decimal; sin coma, un punto seguido de 3 dígitos es separador de miles.
 */
export function parseMoney(value: string): number | null {
  const v = value.replace(/[^\d.,-]/g, "");
  if (!v) return null;
  let normalized: string;
  if (v.includes(",")) {
    normalized = v.replace(/\./g, "").replace(",", ".");
  } else {
    const parts = v.split(".");
    const last = parts.at(-1) ?? "";
    normalized = parts.length > 1 && last.length === 3 ? parts.join("") : v;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Puntos básicos → "20%" / "12,5%". */
export function formatPercent(bp: number): string {
  return `${plain.format(bp / 100)}%`;
}

export function percentToInput(bp: number): string {
  return plain.format(bp / 100);
}

/** "20" / "12,5" → puntos básicos. */
export function parsePercent(value: string): number | null {
  const n = Number(value.trim().replace(",", "."));
  return value.trim() && Number.isFinite(n) ? Math.round(n * 100) : null;
}

export function formatDate(iso: string | null | undefined): string {
  return iso ? format(parseISO(iso), "dd/MM/yyyy") : "—";
}

export function todayIso(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function formatNumber(n: number): string {
  return plain.format(n);
}

/** plural(1, "cuota", "cuotas") → "1 cuota"; plural(3, …) → "3 cuotas". */
export function plural(count: number, singular: string, pluralForm: string): string {
  return `${formatNumber(count)} ${count === 1 ? singular : pluralForm}`;
}

/** "cristian perez" → "CP"; "admin" → "AD". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1 ? (words[0]?.[0] ?? "") + (words[1]?.[0] ?? "") : name.trim().slice(0, 2);
  return letters.toUpperCase();
}
