import { Car } from "lucide-react";
import { useMediaUrl } from "@/lib/use-media-url";
import { cn } from "@/lib/utils";

/** Foto del vehículo, o un ícono si no tiene. El tamaño lo define `className`. */
export function VehiclePhoto({
  fileName,
  alt,
  className,
}: {
  fileName: string | null;
  alt: string;
  className?: string;
}) {
  const mediaUrl = useMediaUrl();
  const src = mediaUrl(fileName);

  return (
    <div className={cn("overflow-hidden bg-slate-100", className)}>
      {src ? (
        <img src={src} alt={alt} className="size-full object-cover" draggable={false} />
      ) : (
        <div className="flex size-full items-center justify-center text-slate-300">
          <Car className="size-1/3 max-h-12 max-w-12" />
        </div>
      )}
    </div>
  );
}
