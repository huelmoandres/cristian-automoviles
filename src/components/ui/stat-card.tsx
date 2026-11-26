import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card } from "./card";

const tones = {
  slate: "bg-slate-100 text-slate-600",
  brand: "bg-brand-50 text-brand-700",
  red: "bg-red-50 text-red-600",
  amber: "bg-amber-50 text-amber-600",
  green: "bg-emerald-50 text-emerald-600",
};

export function StatCard({
  label,
  icon: Icon,
  tone = "slate",
  children,
  footer,
}: {
  label: string;
  icon: LucideIcon;
  tone?: keyof typeof tones;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <div className={cn("rounded-lg p-2", tones[tone])}>
          <Icon className="size-4" />
        </div>
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{children}</div>
      {footer && <div className="mt-1 text-xs text-slate-500">{footer}</div>}
    </Card>
  );
}
