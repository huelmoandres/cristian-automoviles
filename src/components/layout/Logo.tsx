import logoUrl from "@/assets/logo.png";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Logo de la empresa (incluye el nombre). Tiene fondo transparente y letras/auto claros:
 * usar solo sobre superficies oscuras (`bg-ink`).
 */
export function Logo({ className }: { className?: string }) {
  return <img src={logoUrl} alt={APP_NAME} className={cn("h-auto w-full max-w-56", className)} />;
}
