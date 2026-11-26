import { useQuery } from "@tanstack/react-query";
import type { Client } from "@/bindings/Client";
import type { ClientInput } from "@/bindings/ClientInput";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useAppMutation } from "@/lib/use-app-mutation";

export function useClients(search: string | null) {
  return useQuery({
    queryKey: queryKeys.clients.list(search),
    queryFn: () => api.listClients(search),
  });
}

export function useClient(id: number) {
  return useQuery({ queryKey: queryKeys.clients.detail(id), queryFn: () => api.getClient(id) });
}

export function useSaveClient(clientId: number | null, onSuccess: (client: Client) => void) {
  return useAppMutation(
    (input: ClientInput) =>
      clientId ? api.updateClient(clientId, input) : api.createClient(input),
    { success: clientId ? "Cliente actualizado" : "Cliente creado", onSuccess },
  );
}

export function useDeleteClient(onSuccess: () => void) {
  return useAppMutation((id: number) => api.deleteClient(id), {
    success: "Cliente eliminado",
    onSuccess,
  });
}
