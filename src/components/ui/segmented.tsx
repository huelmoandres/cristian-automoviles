import type { Option } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** Selector de opciones excluyentes con aspecto de pestañas. */
export function Segmented<V extends string>({
  options,
  value,
  onChange,
}: {
  options: Option<V>[];
  value: V;
  onChange: (value: V) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            o.value === value
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
