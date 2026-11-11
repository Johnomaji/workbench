import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { ItemAuditAction } from "@/server/workflow/types";

export type AuditAction =
  | ItemAuditAction
  | "item.created"
  | "item.updated"
  | "item.archived"
  | "item.restored"
  | "task.change_request_resolved"
  | "auth.signed_in"
  | "auth.password_changed"
  | "auth.password_set"
  | "auth.signed_up"
  | "account.profile_updated"
  | "organization.created"
  | "organization.updated"
  | "organization.suspended"
  | "organization.reactivated"
  | "user.created"
  | "user.added_to_organization"
  | "user.updated"
  | "user.deactivated"
  | "user.reactivated"
  | "user.setup_link_sent"
  | "user.temporary_password_set"
  | "user.signed_out_everywhere";

export type AuditEntry = {
  action: AuditAction;
  actorId: string | null;
  entityType: "User" | "Organization" | "ContentItem" | "Task" | "Department" | "Workflow" | "Stage";
  entityId: string;
  /** The organization it happened in; leave out for things about a person or the platform. */
  organizationId?: string | null;
  departmentId?: string | null;
  itemId?: string | null;
  data?: Prisma.InputJsonValue;
  ipAddress?: string | null;
};

type Client = Pick<PrismaClient, "auditLog"> | Prisma.TransactionClient;

/** Append an audit entry. Pass the transaction client so it commits with the change. */
export async function writeAudit(client: Client, entry: AuditEntry): Promise<void> {
  await client.auditLog.create({
    data: {
      action: entry.action,
      actorId: entry.actorId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      organizationId: entry.organizationId ?? null,
      departmentId: entry.departmentId ?? null,
      itemId: entry.itemId ?? null,
      data: entry.data,
      ipAddress: entry.ipAddress ?? null,
    },
  });
}
