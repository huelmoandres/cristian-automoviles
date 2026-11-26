import { errorMessage } from "@/lib/utils";

/** Error general de un formulario (p. ej. el rechazo de un comando). */
export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage(error)}</p>
  );
}
