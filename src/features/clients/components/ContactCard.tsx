import { Mail, MapPin, Phone } from "lucide-react";
import type { Client } from "@/bindings/Client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function ContactCard({ client }: { client: Client }) {
  const address = [client.address, client.city].filter(Boolean).join(", ");
  const rows = [
    { icon: Phone, value: client.phone, empty: "Sin teléfono" },
    { icon: Mail, value: client.email, empty: "Sin email" },
    { icon: MapPin, value: address, empty: "Sin domicilio" },
  ];

  return (
    <Card>
      <CardHeader title="Datos de contacto" />
      <CardContent className="space-y-3 text-sm">
        {rows.map(({ icon: Icon, value, empty }) => (
          <p key={empty} className="flex items-center gap-2 text-slate-700">
            <Icon className="size-4 text-slate-400" /> {value || empty}
          </p>
        ))}
        {client.notes && (
          <p className="rounded-lg bg-slate-50 p-3 text-slate-600">{client.notes}</p>
        )}
      </CardContent>
    </Card>
  );
}
