/**
 * Loads a workflow definition from the database into the engine's plain
 * format. Takes the client as a parameter so the seed and tests can use it.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { WorkflowDef } from "./types";

type Client = Pick<PrismaClient, "stage"> | Prisma.TransactionClient;

export async function loadWorkflowDef(client: Client, workflowId: string): Promise<WorkflowDef> {
  const stages = await client.stage.findMany({
    where: { workflowId },
    orderBy: { position: "asc" },
    select: {
      id: true,
      key: true,
      name: true,
      position: true,
      kind: true,
      taskTemplates: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          key: true,
          name: true,
          roleId: true,
          position: true,
          canEditScript: true,
          submitLabel: true,
          role: { select: { name: true } },
        },
      },
    },
  });
  if (stages.length === 0) throw new Error(`Workflow ${workflowId} has no stages`);
  return {
    id: workflowId,
    stages: stages.map((s) => ({
      id: s.id,
      key: s.key,
      name: s.name,
      position: s.position,
      kind: s.kind,
      tasks: s.taskTemplates.map((t) => ({
        id: t.id,
        key: t.key,
        name: t.name,
        roleId: t.roleId,
        roleName: t.role.name,
        position: t.position,
        canEditScript: t.canEditScript,
        submitLabel: t.submitLabel,
      })),
    })),
  };
}
