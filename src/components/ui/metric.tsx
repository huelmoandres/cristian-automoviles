import { cn } from "@/lib/utils";

const tones = { red: "text-red-600", green: "text-emerald-700" };

/** Dato chico con etiqueta, para filas de totales. */
export function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: keyof typeof tones;
}) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cn("font-semibold text-slate-900", tone && tones[tone])}>{value}</p>
    </div>
  );
}
