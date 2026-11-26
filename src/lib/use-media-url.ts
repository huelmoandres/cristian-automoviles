import { convertFileSrc } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { api } from "./api";
import { queryKeys } from "./query-keys";

/**
 * Devuelve una función que convierte el nombre de una foto guardada por la app en una URL
 * que el webview puede mostrar (protocolo de assets de Tauri).
 */
export function useMediaUrl() {
  const { data: dir } = useQuery({
    queryKey: queryKeys.mediaDir,
    queryFn: api.mediaDir,
    staleTime: Infinity,
  });
  return useCallback(
    (fileName: string | null | undefined): string | null =>
      dir && fileName ? convertFileSrc(dir + fileName) : null,
    [dir],
  );
}
