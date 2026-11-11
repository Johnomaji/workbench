import type { Metadata } from "next";
import { Suspense } from "react";
import { BackLink, Card, NoAccess, PageHeader } from "@/components/ui/layout";
import { FormSkeleton } from "@/components/ui/skeletons";
import { orgPath } from "@/lib/org-path";
import { requireOrgUser } from "@/server/auth/session";
import { getNewItemOptions } from "@/server/items/queries";
import { NewItemForm } from "./new-item-form";

export const metadata: Metadata = { title: "New item" };

export default function NewItemPage({ params }: PageProps<"/[org]/items/new">) {
  return (
    <div className="mx-auto max-w-3xl">
      <Suspense fallback={<FormSkeleton fields={4} label="Loading the form…" />}>
        <NewItem params={params} />
      </Suspense>
    </div>
  );
}

async function NewItem({ params }: Pick<PageProps<"/[org]/items/new">, "params">) {
  const user = await requireOrgUser((await params).org);
  const options = await getNewItemOptions(user);
  return (
    <>
      <BackLink href={orgPath(user.organization.slug, "/items")}>All items</BackLink>
      <PageHeader title="New item" description="One piece of content, like a video or a campaign post." />
      {options.departments.length === 0 ? (
        <NoAccess />
      ) : (
        <Card>
          <NewItemForm options={options} />
        </Card>
      )}
    </>
  );
}
