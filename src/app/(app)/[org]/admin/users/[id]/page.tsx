import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Alert, Badge } from "@/components/ui/feedback";
import { SectionsSkeleton } from "@/components/ui/skeletons";
import { BackLink, NoAccess, PageHeader, Section } from "@/components/ui/layout";
import { formatDate, formatDateTime, formatRelative } from "@/lib/format";
import { orgPath } from "@/lib/org-path";
import { getUserDetail, listDepartmentRoles, type UserDetail } from "@/server/admin/users";
import { requireOrgUser } from "@/server/auth/session";
import { canManageUsers } from "@/server/permissions/policy";
import { StatusBadge } from "../status-badge";
import { UserForm } from "../user-form";
import { AccountStatusPanel, SignInPanel } from "./panels";

export const metadata: Metadata = { title: "Person" };

const NOTICES: Record<string, { tone: "success" | "warning"; text: string }> = {
  "created-invited": { tone: "success", text: "Person added. We've emailed them to let them know." },
  "created-temporary": {
    tone: "success",
    text: "Person added with a temporary password. Share it privately; they'll choose their own when they first sign in.",
  },
  "created-email-failed": {
    tone: "warning",
    text: "Person added, but we couldn't send the invite email. Try sending it again below, or set a temporary password.",
  },
};

export default function UserPage({ params, searchParams }: PageProps<"/[org]/admin/users/[id]">) {
  return (
    <div className="mx-auto max-w-3xl">
      <Suspense fallback={<SectionsSkeleton label="Loading this person…" />}>
        <UserDetailView params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function UserDetailView({ params, searchParams }: PageProps<"/[org]/admin/users/[id]">) {
  const [{ org, id }, query] = await Promise.all([params, searchParams]);
  const actor = await requireOrgUser(org);
  if (!canManageUsers(actor)) return <NoAccess />;

  const [user, departments] = await Promise.all([getUserDetail(actor, id), listDepartmentRoles(actor)]);
  if (!user) notFound();

  const notice = typeof query.notice === "string" ? NOTICES[query.notice] : undefined;
  const isSelf = user.id === actor.id;
  const now = new Date();

  return (
    <div className="space-y-6">
      <BackLink href={orgPath(actor.organization.slug, "/admin/users")}>People</BackLink>
      <PageHeader
        title={user.name}
        description={user.email}
        meta={
          <>
            <StatusBadge status={user.status} />
            {user.isAdmin && <Badge tone="primary">Administrator</Badge>}
            {isSelf && <Badge>You</Badge>}
          </>
        }
      />
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      <Section id="details" title="Details">
        <UserForm
          mode="edit"
          departments={departments}
          isSelf={isSelf}
          user={{ id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin, roleIds: user.roleIds }}
          profileEditable={user.managedHere}
        />
      </Section>

      <Section
        id="sign-in"
        title="Signing in"
        description={signInDescription(user, now)}
      >
        <SignInPanel
          userId={user.id}
          name={user.name}
          isActive={user.isActive}
          linkKind={!user.hasPassword ? "invite" : user.status === "pending" ? "added" : "reset"}
          canSetPassword={user.managedHere}
          canSignOut={user.managedHere || isSelf}
        />
      </Section>

      <Section
        id="status"
        title="Account status"
        description={
          user.isActive
            ? `Added to ${actor.organization.name} ${formatDate(user.addedAt)}.`
            : `Deactivated ${user.deactivatedAt ? formatDate(user.deactivatedAt) : ""}. Their work and history are kept.`
        }
      >
        <AccountStatusPanel
          userId={user.id}
          name={user.name}
          isActive={user.isActive}
          isSelf={isSelf}
          openTaskCount={user.openTaskCount}
          organizationName={actor.organization.name}
        />
      </Section>
    </div>
  );
}

function signInDescription(user: UserDetail, now: Date): string {
  if (!user.hasPassword) {
    return user.pendingLinkExpiresAt
      ? `Hasn't chosen a password yet. Their invite link expires ${formatRelative(user.pendingLinkExpiresAt, now)}.`
      : "Hasn't chosen a password yet, and their invite link has expired.";
  }
  const shared = user.managedHere ? "" : " They also use their account in other organizations, so they manage their own password.";
  if (user.status === "pending") return `Already has a Workbench account, but hasn't opened this organization yet.${shared}`;
  if (user.mustChangePassword) return "Using a temporary password. They'll be asked to change it when they sign in.";
  const last = user.lastLoginAt
    ? `Last signed in ${formatRelative(user.lastLoginAt, now)} (${formatDateTime(user.lastLoginAt)}).`
    : "Has a password but hasn't signed in yet.";
  return last + shared;
}
