import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const cloudBackupKeys = {
  status: ["cloud-backup", "status"] as const,
  history: ["cloud-backup", "history"] as const,
};

export function useCloudBackupStatus(enabled = true) {
  return useQuery({
    queryKey: cloudBackupKeys.status,
    queryFn: api.cloudBackupStatus,
    enabled,
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useCloudBackupHistory() {
  return useQuery({
    queryKey: cloudBackupKeys.history,
    queryFn: api.listCloudBackups,
    enabled: false,
    retry: false,
  });
}
