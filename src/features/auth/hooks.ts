import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthStatus } from "@/bindings/AuthStatus";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useAppMutation } from "@/lib/use-app-mutation";
import type { ChangePasswordValues, CredentialsValues } from "./schema";

export function useAuthStatus() {
  return useQuery({ queryKey: queryKeys.auth, queryFn: api.authStatus, staleTime: Infinity });
}

/** Login, o creación del usuario en el primer inicio. */
export function useSignIn(firstRun: boolean) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ username, password }: CredentialsValues) =>
      firstRun ? api.setupUser(username, password) : api.login(username, password),
    onSuccess: (status: AuthStatus) => queryClient.setQueryData(queryKeys.auth, status),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      // Primero se actualiza la sesión (la app pasa al login) y después se descarta el
      // resto de los datos. No usar `clear()`: también borraría la query de sesión que
      // observa <Root> y la pantalla no se enteraría del cambio.
      queryClient.setQueryData<AuthStatus>(queryKeys.auth, { hasUser: true, username: null });
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== queryKeys.auth[0],
      });
    },
  });
}

export function useChangePassword(onSuccess: () => void) {
  return useAppMutation(
    ({ current, password }: ChangePasswordValues) => api.changePassword(current, password),
    { success: "Contraseña actualizada", onSuccess },
  );
}
