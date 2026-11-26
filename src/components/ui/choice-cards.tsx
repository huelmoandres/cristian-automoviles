import * as RadioGroup from "@radix-ui/react-radio-group";
import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Choice<V extends string = string> = {
  value: V;
  title: ReactNode;
  description?: ReactNode;
  /** Dato destacado al pie de la tarjeta (p. ej. un monto). */
  detail?: ReactNode;
};

/** Opciones excluyentes como tarjetas (radio group accesible de Radix). */
export function ChoiceCards<V extends string>({
  id,
  options,
  value,
  onChange,
  className,
}: {
  id?: string;
  options: Choice<V>[];
  value: V;
  onChange: (value: V) => void;
  className?: string;
}) {
  return (
    <RadioGroup.Root
      id={id}
      value={value}
      onValueChange={(v) => onChange(v as V)}
      className={cn("grid gap-3", className)}
    >
      {options.map((o) => (
        <RadioGroup.Item
          key={o.value}
          value={o.value}
          className={cn(
            "relative flex cursor-default flex-col rounded-lg border border-slate-200 bg-white p-3 pr-8 text-left transition-colors",
            "hover:border-slate-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
            "data-[state=checked]:border-brand-600 data-[state=checked]:bg-brand-50/60 data-[state=checked]:ring-1 data-[state=checked]:ring-brand-600",
          )}
        >
          <RadioGroup.Indicator className="absolute right-3 top-3">
            <CheckCircle2 className="size-4 text-brand-600" />
          </RadioGroup.Indicator>
          <span className="text-sm font-medium text-slate-900">{o.title}</span>
          {o.description && <span className="text-xs text-slate-500">{o.description}</span>}
          {o.detail && (
            <span className="mt-2 text-sm font-semibold text-slate-900">{o.detail}</span>
          )}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
