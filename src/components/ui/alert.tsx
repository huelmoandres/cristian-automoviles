import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const tones = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-800",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  red: "border-red-200 bg-red-50 text-red-700",
  blue: "border-blue-200 bg-blue-50 text-blue-800",
};

export function Alert({
  tone,
  icon: Icon,
  className,
  children,
}: {
  tone: keyof typeof tones;
  icon: LucideIcon;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex gap-2 rounded-lg border p-3 text-sm", tones[tone], className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
