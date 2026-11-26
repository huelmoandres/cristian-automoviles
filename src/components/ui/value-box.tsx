import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Valor calculado (solo lectura) con la altura de un input, para alinear en formularios. */
export function ValueBox({
  children,
  highlight,
  className,
}: {
  children: ReactNode;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-9 items-center justify-end rounded-lg px-3 text-sm font-semibold",
        highlight ? "bg-brand-50 text-lg text-brand-800" : "bg-slate-100 text-slate-900",
        className,
      )}
    >
      {children}
    </div>
  );
}
