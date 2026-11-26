import { z } from "zod";
import type { Settings } from "@/bindings/Settings";
import { zv } from "@/lib/validation";

export const businessSchema = z.object({
  businessName: zv.text("Ingresá el nombre del negocio"),
});

export type BusinessValues = z.infer<typeof businessSchema>;

export function businessToForm(s: Settings): BusinessValues {
  return { businessName: s.businessName };
}

/** Combina los datos del negocio con el resto de la configuración vigente. */
export function businessToSettings(v: BusinessValues, current: Settings): Settings {
  return { ...current, ...v };
}
