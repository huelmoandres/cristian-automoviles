import { z } from "zod";
import type { Client } from "@/bindings/Client";
import type { ClientInput } from "@/bindings/ClientInput";
import { DEFAULT_DOCUMENT_TYPE } from "@/lib/labels";
import { emptyToNull, zv } from "@/lib/validation";

export const clientSchema = z.object({
  firstName: zv.text("Ingresá el nombre"),
  lastName: zv.text("Ingresá el apellido"),
  documentType: zv.text(),
  documentNumber: zv.text("Ingresá el documento"),
  phone: zv.optionalText(),
  email: zv.email(),
  address: zv.optionalText(),
  city: zv.optionalText(),
  notes: zv.optionalText(),
});

export type ClientValues = z.infer<typeof clientSchema>;

export function clientToForm(c: Client | null): ClientValues {
  return {
    firstName: c?.firstName ?? "",
    lastName: c?.lastName ?? "",
    documentType: c?.documentType ?? DEFAULT_DOCUMENT_TYPE,
    documentNumber: c?.documentNumber ?? "",
    phone: c?.phone ?? "",
    email: c?.email ?? "",
    address: c?.address ?? "",
    city: c?.city ?? "",
    notes: c?.notes ?? "",
  };
}

export function clientToInput(v: ClientValues): ClientInput {
  return {
    firstName: v.firstName,
    lastName: v.lastName,
    documentType: v.documentType,
    documentNumber: v.documentNumber,
    phone: emptyToNull(v.phone),
    email: emptyToNull(v.email),
    address: emptyToNull(v.address),
    city: emptyToNull(v.city),
    notes: emptyToNull(v.notes),
  };
}

export function fullName(c: Pick<Client, "firstName" | "lastName">): string {
  return `${c.firstName} ${c.lastName}`;
}
