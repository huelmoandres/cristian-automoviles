import { Command } from "cmdk";
import type { ReactNode } from "react";

/** Fila de la búsqueda rápida: ícono/imagen, título, detalle y algo a la derecha. */
export function ResultItem({
  value,
  onSelect,
  leading,
  title,
  subtitle,
  trailing,
}: {
  value: string;
  onSelect: () => void;
  leading: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-default items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 data-[selected=true]:bg-slate-100"
    >
      {leading}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-900">{title}</p>
        {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
      </div>
      {trailing}
    </Command.Item>
  );
}

export function ResultIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500 [&_svg]:size-4">
      {children}
    </span>
  );
}
