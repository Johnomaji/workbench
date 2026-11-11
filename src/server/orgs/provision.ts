/**
 * What every new organization starts with: the Media department, its roles and
 * its workflow. Also used by the seed, so it's safe to run again (everything is
 * upserted by key) and has no server-only imports.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { MEDIA_ROLES, MEDIA_STAGES, type MediaRoleKey } from "@/server/workflow/media-template";

type Client = PrismaClient | Prisma.TransactionClient;

export const MEDIA_DEPARTMENT_KEY = "media";
export const MEDIA_WORKFLOW_NAME = "Media production";

export type ProvisionedDepartment = {
  departmentId: string;
  workflowId: string;
  roleIds: Record<MediaRoleKey, string>;
};

export async function provisionMediaDepartment(
  client: Client,
  organizationId: string,
  options: { timeZone?: string } = {},
): Promise<ProvisionedDepartment> {
  const department = await client.department.upsert({
    where: { organizationId_key: { organizationId, key: MEDIA_DEPARTMENT_KEY } },
    update: {},
    create: {
      organizationId,
      key: MEDIA_DEPARTMENT_KEY,
      name: "Media",
      timezone: options.timeZone ?? "UTC",
      draftsVisibleToAll: false,
      stuckAfterHours: 48,
    },
    select: { id: true },
  });

  const roleIds = {} as Record<MediaRoleKey, string>;
  for (const role of MEDIA_ROLES) {
    const row = await client.role.upsert({
      where: { departmentId_key: { departmentId: department.id, key: role.key } },
      update: { name: role.name, canCreateItems: role.canCreateItems, canManageItems: role.canManageItems },
      create: { organizationId, departmentId: department.id, ...role },
      select: { id: true },
    });
    roleIds[role.key] = row.id;
  }

  const workflow = await client.workflow.upsert({
    where: { departmentId_name_version: { departmentId: department.id, name: MEDIA_WORKFLOW_NAME, version: 1 } },
    update: {},
    create: { departmentId: department.id, name: MEDIA_WORKFLOW_NAME, version: 1, isActive: true },
    select: { id: true },
  });

  for (const [index, stage] of MEDIA_STAGES.entries()) {
    const row = await client.stage.upsert({
      where: { workflowId_key: { workflowId: workflow.id, key: stage.key } },
      update: { name: stage.name, description: stage.description },
      create: {
        workflowId: workflow.id,
        key: stage.key,
        name: stage.name,
        description: stage.description,
        position: index + 1,
        kind: stage.kind,
      },
      select: { id: true },
    });
    for (const [taskIndex, task] of (stage.tasks ?? []).entries()) {
      await client.taskTemplate.upsert({
        where: { stageId_key: { stageId: row.id, key: task.key } },
        update: { name: task.name, submitLabel: task.submitLabel, canEditScript: task.canEditScript },
        create: {
          stageId: row.id,
          key: task.key,
          name: task.name,
          roleId: roleIds[task.role],
          position: taskIndex + 1,
          canEditScript: task.canEditScript,
          submitLabel: task.submitLabel,
        },
      });
    }
  }

  return { departmentId: department.id, workflowId: workflow.id, roleIds };
}
