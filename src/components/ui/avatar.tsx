import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-white",
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
