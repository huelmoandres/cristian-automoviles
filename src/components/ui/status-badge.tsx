import type { StatusMeta } from "@/lib/labels";
import { Badge } from "./badge";

export function StatusBadge({ meta }: { meta: StatusMeta }) {
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}
