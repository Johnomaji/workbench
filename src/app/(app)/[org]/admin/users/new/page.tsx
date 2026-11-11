import type { Metadata } from "next";
import { Suspense } from "react";
import { FormSkeleton } from "@/components/ui/skeletons";
import { BackLink, Card, NoAccess, PageHeader } from "@/components/ui/layout";
import { orgPath } from "@/lib/org-path";
import { listDepartmentRoles } from "@/server/admin/users";
import { requireOrgUser } from "@/server/auth/session";
import { canManageUsers } from "@/server/permissions/policy";
import { UserForm } from "../user-form";

export const metadata: Metadata = { title: "Add a person" };

export default function NewUserPage({ params }: PageProps<"/[org]/admin/users/new">) {
  return (
    <div className="mx-auto max-w-3xl">
      <Suspense fallback={<FormSkeleton fields={4} label="Loading the form…" />}>
        <NewUser params={params} />
      </Suspense>
    </div>
  );
}

async function NewUser({ params }: Pick<PageProps<"/[org]/admin/users/new">, "params">) {
  const actor = await requireOrgUser((await params).org);
  if (!canManageUsers(actor)) return <NoAccess />;
  const departments = await listDepartmentRoles(actor);
  return (
    <>
      <BackLink href={orgPath(actor.organization.slug, "/admin/users")}>People</BackLink>
      <PageHeader
        title="Add a person"
        description={`They'll get an email inviting them to ${actor.organization.name}. If they already use Workbench elsewhere, they keep their own password.`}
      />
      <Card>
        <UserForm mode="create" departments={departments} />
      </Card>
    </>
  );
}
