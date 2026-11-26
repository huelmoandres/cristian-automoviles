import { useMutation } from "@tanstack/react-query";
import { ImagePlus, Trash2 } from "lucide-react";
import { useController, type Control } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { pickImage } from "@/lib/pick-image";
import { errorMessage } from "@/lib/utils";
import type { VehicleValues } from "../schema";
import { VehiclePhoto } from "./VehiclePhoto";

/** Foto de portada: se elige del disco, Rust la procesa y el form guarda el nombre. */
export function CoverImageField({ control }: { control: Control<VehicleValues> }) {
  const { field } = useController({ control, name: "coverImage" });
  const upload = useMutation({
    mutationFn: async () => {
      const path = await pickImage();
      return path ? api.importVehicleImage(path) : null;
    },
    onSuccess: (fileName) => fileName && field.onChange(fileName),
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="flex items-center gap-4">
      <VehiclePhoto
        fileName={field.value}
        alt="Portada del vehículo"
        className="aspect-[4/3] w-44 shrink-0 rounded-lg border border-slate-200"
      />
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">Foto de portada</p>
        <p className="text-xs text-slate-500">JPG, PNG o WebP. Se optimiza automáticamente.</p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            loading={upload.isPending}
            onClick={() => upload.mutate()}
          >
            <ImagePlus /> {field.value ? "Cambiar foto" : "Elegir foto"}
          </Button>
          {field.value && (
            <Button size="sm" variant="ghost" onClick={() => field.onChange(null)}>
              <Trash2 /> Quitar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
