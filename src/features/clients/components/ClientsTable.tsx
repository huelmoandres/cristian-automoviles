import { Link, useNavigate } from "react-router";
import type { ClientListItem } from "@/bindings/ClientListItem";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { plural } from "@/lib/format";
import { routes } from "@/lib/routes";

function ClientSituation({ client }: { client: ClientListItem }) {
  if (client.overdueInstallments > 0) {
    return (
      <Badge tone="red">
        {plural(client.overdueInstallments, "cuota vencida", "cuotas vencidas")}
      </Badge>
    );
  }
  if (client.activeSales > 0) return <Badge tone="green">Al día</Badge>;
  return <Badge>Sin deuda</Badge>;
}

export function ClientsTable({ clients }: { clients: ClientListItem[] }) {
  const navigate = useNavigate();

  return (
    <Table>
      <THead>
        <tr>
          <TH>Cliente</TH>
          <TH>Documento</TH>
          <TH>Teléfono</TH>
          <TH>Localidad</TH>
          <TH>Situación</TH>
        </tr>
      </THead>
      <TBody>
        {clients.map((c) => (
          <TR
            key={c.id}
            className="cursor-pointer"
            onClick={() => navigate(routes.clientDetail(c.id))}
          >
            <TD>
              <Link
                to={routes.clientDetail(c.id)}
                className="font-medium text-slate-900 hover:text-brand-700"
              >
                {c.lastName}, {c.firstName}
              </Link>
            </TD>
            <TD className="text-slate-600">
              {c.documentType} {c.documentNumber}
            </TD>
            <TD className="text-slate-600">{c.phone ?? "—"}</TD>
            <TD className="text-slate-600">{c.city ?? "—"}</TD>
            <TD>
              <ClientSituation client={c} />
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
