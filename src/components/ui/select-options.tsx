import type { Option } from "@/lib/labels";

/** `<option>`s a partir de una lista, con una opción vacía opcional al principio. */
export function SelectOptions({ options, empty }: { options: Option[]; empty?: string }) {
  return (
    <>
      {empty != null && <option value="">{empty}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </>
  );
}
