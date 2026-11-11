import { Badge } from "@/components/ui/feedback";
import type { UserStatus } from "@/server/admin/users";

export function StatusBadge({ status }: { status: UserStatus }) {
  if (status === "deactivated") return <Badge tone="danger">Deactivated</Badge>;
  if (status === "pending") return <Badge tone="warning">Invite not accepted</Badge>;
  return <Badge tone="success">Active</Badge>;
}
