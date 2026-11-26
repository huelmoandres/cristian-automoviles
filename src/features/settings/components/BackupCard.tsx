import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BackupActions } from "./BackupActions";

export function BackupCard() {
  return (
    <Card>
      <CardHeader
        title="Respaldos"
        description="Guardá tus datos o trasladalos a otra computadora"
      />
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-600">
          El respaldo incluye clientes, vehículos, fotos, ventas, cuotas, pagos, configuración y
          usuario. Guardá el archivo en un pendrive o en otra ubicación para recuperarlo si cambiás
          de PC.
        </p>
        <p className="text-sm text-slate-600">
          En la otra computadora, instalá la app y elegí Importar respaldo en la pantalla inicial.
        </p>
        <BackupActions />
        <p className="text-xs text-slate-500">
          El archivo contiene los datos del negocio y no está cifrado. Guardalo en un lugar privado.
        </p>
      </CardContent>
    </Card>
  );
}
