import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "./utils";

type Options<TResult> = {
  /** Mensaje del aviso de éxito. */
  success?: string;
  onSuccess?: (result: TResult) => void;
};

/**
 * Mutación estándar de la app: al terminar bien refresca todos los datos (la base es local
 * y chica, así ningún listado queda desactualizado) y muestra avisos de éxito o error.
 */
export function useAppMutation<TVars = void, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  options: Options<TResult> = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries();
      if (options.success) toast.success(options.success);
      options.onSuccess?.(result);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
