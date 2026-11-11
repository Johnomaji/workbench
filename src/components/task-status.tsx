import type { TaskStatus } from "@/server/workflow/types";
import { Badge } from "./ui/feedback";

type Tone = "neutral" | "primary" | "success" | "warning" | "danger";

/** Plain-language status for a task. "On hold" = the item was sent back past it; its work is kept. */
export function taskStatusLabel(status: TaskStatus, active: boolean): { label: string; tone: Tone } {
  switch (status) {
    case "LOCKED":
      return { label: "Not started yet", tone: "neutral" };
    case "READY":
      return active ? { label: "Ready to start", tone: "primary" } : { label: "Waiting", tone: "neutral" };
    case "IN_PROGRESS":
      return active ? { label: "In progress", tone: "primary" } : { label: "On hold", tone: "warning" };
    case "SENT_BACK":
      return active ? { label: "Sent back", tone: "danger" } : { label: "On hold", tone: "warning" };
    case "DONE":
      return { label: "Done", tone: "success" };
  }
}

export function TaskStatusBadges({
  status,
  active,
  changesRequested,
}: {
  status: TaskStatus;
  active: boolean;
  changesRequested: boolean;
}) {
  const { label, tone } = taskStatusLabel(status, active);
  return (
    <>
      <Badge tone={tone}>{label}</Badge>
      {changesRequested && status !== "DONE" && <Badge tone="warning">Changes requested</Badge>}
    </>
  );
}
