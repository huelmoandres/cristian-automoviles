import type { LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { Card } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";

/** Contador con acceso directo a su listado. */
export function CountTile({
  label,
  value,
  icon: Icon,
  to,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  to: string;
}) {
  return (
    <Link to={to}>
      <Card className="flex items-center gap-4 p-4 transition-colors hover:border-brand-500">
        <div className="rounded-lg bg-slate-100 p-2.5">
          <Icon className="size-5 text-slate-600" />
        </div>
        <div>
          <p className="text-2xl font-semibold text-slate-900">{formatNumber(value)}</p>
          <p className="text-sm text-slate-500">{label}</p>
        </div>
      </Card>
    </Link>
  );
}
